import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { auditEditions, editionHealth } from './health.js';
import type { Edition, DigestEdition } from './types.js';

function quiet(date = new Date().toISOString().slice(0, 10)): DigestEdition {
  return { date, generatedAt: new Date().toISOString(), mode: 'digest', items: [], degraded: [],
    stats: { sourcesConfigured: 12, sourcesOk: 12, collected: 230, normalized: 230, deduped: 225, published: 0 } };
}

test('healthy quiet days and expected event exclusions are not failures', () => {
  const edition = quiet();
  edition.normalizationExclusions = [{ sourceId: 'example', title: 'Virtual event', url: 'https://example.test/events/a', publishedAt: '2099-01-01', observedAt: edition.generatedAt, reason: 'future_event' }];
  assert.deepEqual(editionHealth(edition), []);
});

test('declared failures and silently incomplete source counts are operational failures', () => {
  const edition = quiet();
  edition.stats.sourcesOk = 10;
  assert.match(editionHealth(edition)[0]!.message, /10\/12/);
  edition.degraded = [{ stage: 'collect', sourceId: 'example', message: 'HTTP 503' }];
  assert.deepEqual(editionHealth(edition), edition.degraded);
});

test('archive audit finds gaps and groups recurring problems by stage/source/day', () => {
  const editions = ['2026-10-24', '2026-10-26', '2026-10-27'].map(quiet);
  for (const edition of editions.slice(0, 2)) edition.degraded = [{ stage: 'collect', sourceId: 'example', message: 'HTTP 503' }];
  const report = auditEditions(editions);
  assert.equal(report.degradedEditions, 2);
  assert.deepEqual(report.missingDates, ['2026-10-25']);
  assert.deepEqual(report.recurring[0]!.dates, ['2026-10-24', '2026-10-26']);
});

test('a successful article can still have a placeholder headline or broken story coverage', () => {
  const edition = { ...quiet(), mode: 'article', headline: 'The headline', selected: [{ id: 's1' }], alsoCollected: [], bodyMarkdown: 'Story [[s2]]' } as unknown as Edition;
  edition.stats.published = 1;
  assert.deepEqual(editionHealth(edition).map((issue) => issue.message), ['Article has a placeholder headline', 'Body citations do not match selected stories']);
});

test('daily health command fails degraded runs, records an escaped summary, and accepts recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsn-health-'));
  try {
    const edition = quiet();
    const path = join(root, `${edition.date}.json`);
    const summary = join(root, 'summary.md');
    const run = () => spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./check-health.ts', import.meta.url))], {
      encoding: 'utf8', env: { ...process.env, EDITIONS_DIR: root, GITHUB_STEP_SUMMARY: summary }, timeout: 10_000,
    });
    edition.degraded.push({ stage: 'write', message: '<script>source text</script>' });
    await writeFile(path, JSON.stringify(edition));
    const failed = run();
    assert.equal(failed.status, 1, failed.stderr);
    assert.match(failed.stdout, /DEGRADED/);
    assert.match(await readFile(summary, 'utf8'), /&lt;script&gt;/);
    edition.degraded = [];
    await writeFile(path, JSON.stringify(edition));
    const recovered = run();
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.match(recovered.stdout, /healthy/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
