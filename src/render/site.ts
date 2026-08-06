import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Edition } from '../types.js';
import { archivePage, digestPage } from './html.js';

async function archiveEntries(editionsDir: string): Promise<{ date: string; count: number }[]> {
  const files = (await readdir(editionsDir)).filter((f) => f.endsWith('.json'));
  const entries: { date: string; count: number }[] = [];

  for (const file of files) {
    const path = join(editionsDir, file);
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`${path} is not a JSON object`);
    }
    const { date, items } = parsed as { date?: unknown; items?: unknown };
    if (typeof date !== 'string' || !Array.isArray(items)) {
      throw new Error(`${path} is missing a string "date" or an "items" array`);
    }
    entries.push({ date, count: items.length });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

export async function writeSite(
  edition: Edition,
  o: { siteDir: string; editionsDir: string },
): Promise<string[]> {
  await mkdir(o.siteDir, { recursive: true });

  const html = digestPage(edition);
  const datedPath = join(o.siteDir, `${edition.date}.html`);
  const indexPath = join(o.siteDir, 'index.html');
  await writeFile(datedPath, html, 'utf8');
  await writeFile(indexPath, html, 'utf8');

  const archivePath = join(o.siteDir, 'archive.html');
  await writeFile(archivePath, archivePage(await archiveEntries(o.editionsDir)), 'utf8');

  return [indexPath, datedPath, archivePath];
}
