import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeSite } from './render/site.js';
import type { Edition } from './types.js';

const EDITIONS_DIR = 'data/editions';
const SITE_DIR = 'site';

/**
 * Rebuild every page from the stored editions.
 *
 * A normal run rewrites only three files — today's dated page, `index.html`,
 * and the archive — so a change under `render/` leaves every *past* dated page
 * on the old markup. Nothing detects that: the stale pages still render, just
 * in last month's design.
 *
 * This is the fix, and it is not the same as regenerating. It touches no
 * network, calls no model, and never writes `seen.json`; the edition pages are
 * a pure function of `data/editions`, which is why the editions are the
 * record. Each edition is validated on the way through — `writeSite` rebuilds
 * the archive from every file on disk and throws on any it cannot read.
 *
 * One exception to the purity: `archive.html` carries a "Generated <now>"
 * footer, so it comes out one line different on every run even when nothing
 * changed. That stamp is honest — the archive really is rebuilt each time —
 * but it means a re-render is never a no-op in git.
 */
async function rerender(): Promise<void> {
  const files = (await readdir(EDITIONS_DIR)).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`no editions in ${EDITIONS_DIR} — nothing to re-render`);

  // Ascending, so the newest edition is the one that lands in index.html.
  for (const file of files) {
    const edition = JSON.parse(await readFile(join(EDITIONS_DIR, file), 'utf8')) as Edition;
    await writeSite(edition, { siteDir: SITE_DIR, editionsDir: EDITIONS_DIR });
    console.log(`rerender    ${edition.date}`);
  }

  console.log(`rerender    ${files.length} editions · index.html is ${files.at(-1)}`);
}

try {
  await rerender();
} catch (err) {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
}
