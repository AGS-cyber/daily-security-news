import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DegradedNotice } from '../types.js';

/** An empty failed collection cannot replace the last edition as a quiet news day. */
export function assertUsableCollection(
  sourcesOk: number, normalizedCount: number, notices: DegradedNotice[],
): void {
  if (sourcesOk > 0 && normalizedCount > 0) return;
  const reasons = notices.map((notice) => notice.message).join('; ');
  throw new Error(`Collection produced no usable news; publication stopped before writing editions or seen state.${reasons ? ` ${reasons}` : ''}`);
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
