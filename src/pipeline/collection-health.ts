import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DegradedNotice, Edition } from '../types.js';

/** An empty failed collection cannot replace the last edition as a quiet news day. */
export function assertUsableCollection(
  sourcesOk: number, normalizedCount: number, notices: DegradedNotice[],
): void {
  if (sourcesOk > 0 && normalizedCount > 0) return;
  const reasons = notices.map((notice) => notice.message).join('; ');
  throw new Error(`Collection produced no usable news; publication stopped before writing editions or seen state.${reasons ? ` ${reasons}` : ''}`);
}

/** A late enrichment/editorial failure must not downgrade an already published edition. */
export async function assertSafeEditionRerun(
  edition: Edition, options: { editionsDir: string; siteDir: string },
): Promise<void> {
  if (edition.degraded.length === 0 && edition.mode === 'article') return;
  const paths = [join(options.editionsDir, `${edition.date}.json`),
    join(options.siteDir, 'editions', `${edition.date}.json`)];
  const key = (notice: DegradedNotice) => `${notice.stage}/${notice.sourceId ?? ''}`;
  let checked = false;
  for (const path of paths) {
    let text: string;
    try { text = await readFile(path, 'utf8'); }
    catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; throw err; }
    let previous: Edition;
    try {
      previous = JSON.parse(text) as Edition;
      if (!previous || previous.date !== edition.date || !['article', 'digest'].includes(previous.mode) || !Array.isArray(previous.degraded)) throw new Error('invalid edition');
    } catch {
      throw new Error(`Refusing to replace existing edition ${edition.date}: previous quality cannot be checked at ${path}`);
    }
    checked = true;
    const previousFailures = new Set(previous.degraded.map(key));
    const added = edition.degraded.filter((notice) => !previousFailures.has(key(notice)));
    if ((previous.mode === 'article' && edition.mode !== 'article') || added.length > 0) {
      throw new Error(`Refusing to replace existing edition ${edition.date}: the rerun would degrade published quality. Published output and seen state were left unchanged. ${added.map((notice) => notice.message).join('; ')}`);
    }
  }
  if (!checked) {
    const path = join(options.siteDir, `${edition.date}.html`);
    try { await stat(path); }
    catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; throw err; }
    throw new Error(`Refusing to replace existing edition ${edition.date}: previous quality cannot be checked from HTML alone at ${path}`);
  }
}

/** Preserve the whole existing edition rather than refreshing its date over incomplete input. */
export async function assertSafeCollectionRerun(options: {
  date: string;
  editionsDir: string;
  siteDir: string;
  notices: DegradedNotice[];
}): Promise<void> {
  const failures = options.notices.filter(({ stage }) => stage === 'collect' || stage === 'normalize');
  if (failures.length === 0) return;

  // Any copy is enough: an earlier publication may have stopped between file writes.
  const paths = [
    join(options.editionsDir, `${options.date}.json`),
    join(options.siteDir, 'editions', `${options.date}.json`),
    join(options.siteDir, `${options.date}.html`),
  ];
  const existing: string[] = [];
  for (const path of paths) {
    try {
      await stat(path);
      existing.push(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Cannot check existing edition at ${path}; publication stopped`, { cause: err });
      }
    }
  }
  if (existing.length === 0) return;

  const reasons = failures.map(({ stage, sourceId, message }) =>
    `${stage}${sourceId ? `/${sourceId}` : ''}: ${message}`).join('; ');
  throw new Error(`Refusing to replace existing edition ${options.date}: collection is degraded. Existing output (${existing.join(', ')}), generation timestamps and seen state were left unchanged. No replacement edition was generated. Retry after collection recovers. ${reasons}`);
}
