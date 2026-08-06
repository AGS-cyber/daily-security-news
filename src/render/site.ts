import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Edition } from '../types.js';
import { archivePage, articlePage, digestPage, type ArchiveEntry } from './html.js';

async function archiveEntries(editionsDir: string): Promise<ArchiveEntry[]> {
  const files = (await readdir(editionsDir)).filter((f) => f.endsWith('.json'));
  const entries: ArchiveEntry[] = [];

  for (const file of files) {
    const path = join(editionsDir, file);
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`${path} is not a JSON object`);
    }
    const record = parsed as {
      date?: unknown;
      mode?: unknown;
      items?: unknown;
      headline?: unknown;
      selected?: unknown;
      alsoCollected?: unknown;
    };
    if (typeof record.date !== 'string') {
      throw new Error(`${path} is missing a string "date"`);
    }

    if (record.mode === 'article') {
      if (
        typeof record.headline !== 'string' ||
        !Array.isArray(record.selected) ||
        !Array.isArray(record.alsoCollected)
      ) {
        throw new Error(
          `${path} is an article edition missing a string "headline", a "selected" array, or an "alsoCollected" array`,
        );
      }
      entries.push({
        date: record.date,
        mode: 'article',
        headline: record.headline,
        count: record.selected.length + record.alsoCollected.length,
      });
    } else if (record.mode === 'digest') {
      if (!Array.isArray(record.items)) {
        throw new Error(`${path} is a digest edition missing an "items" array`);
      }
      entries.push({ date: record.date, mode: 'digest', count: record.items.length });
    } else {
      throw new Error(`${path} has an unknown "mode": ${JSON.stringify(record.mode)}`);
    }
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

export async function writeSite(
  edition: Edition,
  o: { siteDir: string; editionsDir: string },
): Promise<string[]> {
  await mkdir(o.siteDir, { recursive: true });

  const html = edition.mode === 'article' ? articlePage(edition) : digestPage(edition);
  const datedPath = join(o.siteDir, `${edition.date}.html`);
  const indexPath = join(o.siteDir, 'index.html');
  await writeFile(datedPath, html, 'utf8');
  await writeFile(indexPath, html, 'utf8');

  const archivePath = join(o.siteDir, 'archive.html');
  await writeFile(archivePath, archivePage(await archiveEntries(o.editionsDir)), 'utf8');

  return [indexPath, datedPath, archivePath];
}
