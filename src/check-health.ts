import { appendFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { auditEditions, editionHealth } from './health.js';
import { assertFreshPublication } from './publication.js';
import { escapeHtml } from './render/escape.js';
import type { Edition } from './types.js';

const directory = process.env['EDITIONS_DIR'] ?? 'data/editions';
if (process.argv.includes('--history')) {
  const files = (await readdir(directory)).filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort();
  const editions = await Promise.all(files.map(async (file) => JSON.parse(await readFile(join(directory, file), 'utf8')) as Edition));
  console.log(JSON.stringify(auditEditions(editions), null, 2));
} else {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected edition date YYYY-MM-DD');
  const edition = JSON.parse(await readFile(join(directory, `${date}.json`), 'utf8')) as Edition;
  assertFreshPublication(edition, date, new Date());
  const issues = editionHealth(edition);
  const summary = `${date}: ${issues.length ? 'DEGRADED' : 'healthy'} (${edition.mode}, ${edition.stats.published} stories, ${edition.stats.sourcesOk}/${edition.stats.sourcesConfigured} sources)\n${issues.map((issue) => `${issue.stage}${issue.sourceId ? `/${issue.sourceId}` : ''}: ${issue.message}`).join('\n')}\n`;
  console.log(summary);
  // Escaping prevents source-provided text from becoming markup in the job summary.
  if (process.env['GITHUB_STEP_SUMMARY']) await appendFile(process.env['GITHUB_STEP_SUMMARY'], `<pre>${escapeHtml(summary)}</pre>\n`);
  if (issues.length > 0) process.exitCode = 1;
}
