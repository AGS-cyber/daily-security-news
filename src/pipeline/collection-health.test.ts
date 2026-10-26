import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { assertSafeCollectionRerun, assertUsableCollection } from './collection-health.js';
import { sources } from '../config/sources.js';
import type { DigestEdition } from '../types.js';

test('total collection failure and entirely rejected input fail before publication', () => {
  assert.throws(() => assertUsableCollection(0, 0, [{ stage: 'collect', message: 'Source unavailable' }]), /no usable news.*Source unavailable/);
  assert.throws(() => assertUsableCollection(1, 0, [{ stage: 'normalize', message: 'Invalid dates' }]), /no usable news.*Invalid dates/);
});

test('partial collection and healthy but already-seen news remain publishable', () => {
  assert.doesNotThrow(() => assertUsableCollection(1, 1, [{ stage: 'collect', message: 'Another feed failed' }]));
  // The guard deliberately precedes the seen/age filter; a quiet news day is allowed.
  assert.doesNotThrow(() => assertUsableCollection(12, 20, []));
});

test('the actual entry point leaves existing edition, site and seen state intact on an all-feed outage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsn-outage-'));
  try {
    await mkdir(join(root, 'data', 'editions'), { recursive: true });
    await mkdir(join(root, 'site'));
    const files = {
      'data/seen.json': '{}\n',
      'data/editions/existing.json': '{"keep":"existing edition"}\n',
      'site/index.html': '<p>Existing edition</p>',
    };
    for (const [path, contents] of Object.entries(files)) await writeFile(join(root, path), contents);
    const preload = join(root, 'offline.mjs');
    await writeFile(preload, 'globalThis.fetch = async () => new Response("mock outage", {status: 404});');
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), '--import', pathToFileURL(preload).href,
        fileURLToPath(new URL('../index.ts', import.meta.url))], {
        cwd: root, timeout: 10_000,
        env: { ...process.env, DEEPSEEK_API_KEY: '', NVD_API_KEY: '' },
      });
      let stderr = '';
      child.stdout.resume();
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stderr }));
    });
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, /Collection produced no usable news/);
    for (const [path, contents] of Object.entries(files)) assert.equal(await readFile(join(root, path), 'utf8'), contents);
    assert.deepEqual(await readdir(join(root, 'data', 'editions')), ['existing.json']);
    assert.deepEqual((await readdir(join(root, 'data'))).sort(), ['editions', 'seen.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function withRunDirectory(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsn-rerun-'));
  try { await fn(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

/** Include every published file and state byte, not just the story count. */
async function publicationSnapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function visit(path: string): Promise<void> {
    let entries;
    try { entries = await readdir(join(root, path), { withFileTypes: true }); }
    catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; throw err; }
    for (const entry of entries) {
      const relative = join(path, entry.name);
      if (entry.isDirectory()) await visit(relative);
      else files[relative] = (await readFile(join(root, relative))).toString('base64');
    }
  }
  await visit('data');
  await visit('site');
  return files;
}

type Scenario = 'healthy' | 'partial' | 'partial-cve' | 'invalid-date' | 'missing-link' | 'future-event';

async function runScenario(root: string, scenario: Scenario, at = '2026-10-25T12:00:00Z') {
  const date = at.slice(0, 10);
  const story = (title: string, url: string, published = `${date}T10:00:00Z`) =>
    `<item><title>${title}</title><link>${url}</link><pubDate>${published}</pubDate></item>`;
  const first = story(scenario === 'partial-cve' ? 'CVE-2026-12345 example advisory' : 'Example advisory', 'https://example.test/advisory');
  const second = story('Research on credential theft', 'https://example.test/research');
  const badDate = story('Malformed date report', 'https://example.test/bad-date', 'not a date');
  const futureEvent = story('Virtual event about browser security', 'https://example.test/events/security', '2099-01-01T00:00:00Z');
  const xml = `<rss version="2.0"><channel><title>Mock feed</title>${first}${scenario.startsWith('partial') ? '' : second}${scenario === 'invalid-date' ? badDate : ''}${scenario === 'missing-link' ? '<item><title>Missing link</title></item>' : ''}${scenario === 'future-event' ? futureEvent : ''}</channel></rss>`;
  const preload = join(root, 'scenario.mjs');
  await writeFile(preload, `
    import { appendFileSync } from 'node:fs';
    const OriginalDate = Date;
    const fixed = ${JSON.stringify(at)};
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return OriginalDate.parse(fixed); }
    };
    const urls = ${JSON.stringify(sources.map(source => source.feedUrl))};
    globalThis.fetch = async (url) => {
      const href = String(url);
      appendFileSync('requests.jsonl', JSON.stringify(href) + '\\n');
      if (!urls.includes(href)) throw new Error('Unexpected network request blocked by test: ' + href);
      if (${JSON.stringify(scenario)}.startsWith('partial') && href === urls[urls.length - 1]) return new Response('mock unavailable', { status: 404 });
      return new Response(${JSON.stringify(xml)});
    };
  `);
  await writeFile(join(root, 'requests.jsonl'), '');
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), '--import', pathToFileURL(preload).href,
      fileURLToPath(new URL('../index.ts', import.meta.url))], {
      cwd: root, timeout: 10_000, env: { ...process.env, DEEPSEEK_API_KEY: '', NVD_API_KEY: '' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const requests = (await readFile(join(root, 'requests.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as string);
  return { ...result, requests };
}

test('degraded repeats preserve an existing edition byte-for-byte, including timestamp, cache and seen state', async () => {
  await withRunDirectory(async root => {
    const first = await runScenario(root, 'healthy');
    assert.equal(first.code, 0, first.stderr);
    await mkdir(join(root, 'data', 'cache'));
    await writeFile(join(root, 'data', 'cache', 'vulnerability-intelligence.json'), 'existing cache sentinel');
    const before = await publicationSnapshot(root);
    for (const at of ['2026-10-25T13:00:00Z', '2026-10-25T14:00:00Z']) {
      const rerun = await runScenario(root, 'partial-cve', at);
      assert.equal(rerun.code, 1, rerun.stderr);
      assert.match(rerun.stderr, /Refusing to replace existing edition 2026-10-25/);
      assert.match(rerun.stderr, /collect\/microsoft-security:.*HTTP 404/);
      assert.match(rerun.stderr, /generation timestamps and seen state were left unchanged/);
      assert.match(rerun.stderr, /No replacement edition was generated/);
      assert.doesNotMatch(rerun.stdout, /extract|enrich|select|write|render/);
      assert.deepEqual(rerun.requests.sort(), sources.map(source => source.feedUrl).sort());
      assert.deepEqual(await publicationSnapshot(root), before);
    }
    const edition = JSON.parse(await readFile(join(root, 'data', 'editions', '2026-10-25.json'), 'utf8')) as DigestEdition;
    assert.equal(edition.items.length, 2);
    assert.equal(edition.generatedAt, '2026-10-25T12:00:00.000Z');
    const recovered = await runScenario(root, 'healthy', '2026-10-25T15:00:00Z');
    assert.equal(recovered.code, 0, recovered.stderr);
    const refreshed = JSON.parse(await readFile(join(root, 'data', 'editions', '2026-10-25.json'), 'utf8')) as DigestEdition;
    assert.equal(refreshed.generatedAt, '2026-10-25T15:00:00.000Z');
    assert.equal(refreshed.items.length, 2);
    assert.equal(await readFile(join(root, 'data', 'cache', 'vulnerability-intelligence.json'), 'utf8'), 'existing cache sentinel');
  });
});

test('missing fields and invalid dates block replacement even when every HTTP source succeeds', async () => {
  await withRunDirectory(async root => {
    assert.equal((await runScenario(root, 'healthy')).code, 0);
    const before = await publicationSnapshot(root);
    for (const scenario of ['invalid-date', 'missing-link'] as const) {
      const rerun = await runScenario(root, scenario, '2026-10-25T13:00:00Z');
      assert.equal(rerun.code, 1, rerun.stderr);
      assert.match(rerun.stderr, /Refusing to replace existing edition/);
      assert.match(rerun.stderr, scenario === 'invalid-date' ? /normalize:.*invalid publication date/ : /title or link was missing/);
      assert.deepEqual(await publicationSnapshot(root), before);
    }
  });
});

test('healthy repeat runs remain allowed and expected future events do not create a false failure', async () => {
  await withRunDirectory(async root => {
    assert.equal((await runScenario(root, 'healthy')).code, 0);
    const seen = await readFile(join(root, 'data', 'seen.json'), 'utf8');
    for (const [scenario, at] of [['healthy', '2026-10-25T13:00:00Z'], ['future-event', '2026-10-25T14:00:00Z']] as const) {
      const rerun = await runScenario(root, scenario, at);
      assert.equal(rerun.code, 0, rerun.stderr);
      const edition = JSON.parse(await readFile(join(root, 'data', 'editions', '2026-10-25.json'), 'utf8')) as DigestEdition;
      assert.equal(edition.items.length, 2);
      assert.equal(edition.generatedAt, new Date(at).toISOString());
      assert.ok(edition.degraded.every(({ stage }) => stage !== 'collect' && stage !== 'normalize'));
      assert.equal(await readFile(join(root, 'data', 'seen.json'), 'utf8'), seen);
    }
  });
});

test('a first partial edition is disclosed, including on a new day, then protected against degraded repeats', async () => {
  await withRunDirectory(async root => {
    const first = await runScenario(root, 'partial');
    assert.equal(first.code, 0, first.stderr);
    const firstDate = join(root, 'data', 'editions', '2026-10-25.json');
    const previous = await readFile(firstDate, 'utf8');
    const edition = JSON.parse(previous) as DigestEdition;
    assert.equal(edition.stats.sourcesOk, sources.length - 1);
    assert.ok(edition.degraded.some(({ stage }) => stage === 'collect'));
    assert.match(await readFile(join(root, 'site', 'index.html'), 'utf8'), /This edition is incomplete/);
    const before = await publicationSnapshot(root);
    assert.equal((await runScenario(root, 'partial', '2026-10-25T13:00:00Z')).code, 1);
    assert.deepEqual(await publicationSnapshot(root), before);
    const nextDay = await runScenario(root, 'partial', '2026-10-26T12:00:00Z');
    assert.equal(nextDay.code, 0, nextDay.stderr);
    assert.equal(await readFile(firstDate, 'utf8'), previous);
    assert.match(await readFile(join(root, 'site', 'index.html'), 'utf8'), /Edition 26 October 2026/);
  });
});

test('any same-date output protects against a degraded retry, without requiring valid old JSON', async () => {
  for (const path of ['data/editions/2026-10-25.json', 'site/editions/2026-10-25.json', 'site/2026-10-25.html']) {
    await withRunDirectory(async root => {
      const target = join(root, path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, 'Preserve this earlier output even if truncated');
      const options = { date: '2026-10-25', editionsDir: join(root, 'data', 'editions'), siteDir: join(root, 'site'),
        notices: [{ stage: 'collect' as const, sourceId: 'example', message: 'HTTP 503' }] };
      await assert.rejects(assertSafeCollectionRerun(options), /Refusing to replace existing edition/);
      assert.equal(await readFile(target, 'utf8'), 'Preserve this earlier output even if truncated');
      // Collection protection does not reinterpret later-stage enrichment or writing notices.
      await assertSafeCollectionRerun({ ...options, notices: [] });
    });
  }
});
