import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ArticleEdition, DigestEdition, Item, Selection } from '../types.js';
import { writeEdition } from './edition.js';
import { writeSite } from './site.js';

/**
 * Round-trips an edition through disk: writeEdition serialises it, then
 * writeSite reads every edition back to build the archive. Worth its own test
 * because the archive is the one place that parses edition JSON it did not
 * construct, so a shape change surfaces here and nowhere else.
 */

function item(id: string, title: string, url: string): Item {
  return {
    id,
    sourceId: 'krebs',
    sourceKind: 'rss',
    title,
    url,
    canonicalUrl: url,
    publishedAt: '2026-08-06T09:00:00.000Z',
    alsoCoveredBy: [],
  };
}

function selected(id: string, title: string, url: string): Item & Selection {
  return { ...item(id, title, url), section: 'exploited', rank: 1, angle: 'why it matters' };
}

function articleEdition(over: Partial<ArticleEdition> = {}): ArticleEdition {
  return {
    date: '2026-08-06',
    generatedAt: '2026-08-06T12:00:00.000Z',
    mode: 'article',
    headline: 'A quiet week ends loudly',
    standfirst: 'One paragraph of standfirst.',
    bodyMarkdown: '## Actively exploited\n\nThe interesting one is [[s1]].\n',
    selected: [selected('s1', 'Router <bug> & "chaos"', 'https://example.test/a')],
    alsoCollected: [item('s2', 'Something else', 'https://example.test/b')],
    degraded: [],
    stats: {
      sourcesConfigured: 12,
      sourcesOk: 12,
      collected: 40,
      normalized: 40,
      deduped: 38,
      published: 2,
    },
    usage: {
      model: 'deepseek-v4-pro',
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 40_000,
      outputTokens: 15_000,
      estimatedCostUsd: 0.0305,
    },
    ...over,
  };
}

function digestEdition(date: string): DigestEdition {
  return {
    date,
    generatedAt: `${date}T12:00:00.000Z`,
    mode: 'digest',
    items: [item('s1', 'Digest story', 'https://example.test/d')],
    degraded: [],
    stats: {
      sourcesConfigured: 12,
      sourcesOk: 11,
      collected: 20,
      normalized: 20,
      deduped: 19,
      published: 1,
    },
  };
}

async function withDirs<T>(fn: (dirs: { siteDir: string; editionsDir: string }) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), 'dsn-site-'));
  try {
    return await fn({ siteDir: join(root, 'site'), editionsDir: join(root, 'editions') });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('an article edition survives the disk round-trip into page and archive', async () => {
  await withDirs(async (dirs) => {
    const edition = articleEdition();
    await writeEdition(edition, dirs.editionsDir);
    await writeSite(edition, dirs);

    const page = await readFile(join(dirs.siteDir, 'index.html'), 'utf8');
    assert.match(page, /A quiet week ends loudly/);
    // The citation resolved to a real link, with the title escaped.
    assert.match(page, /<a href="https:\/\/example\.test\/a">/);
    assert.match(page, /Router &lt;bug&gt; &amp; &quot;chaos&quot;/);
    assert.doesNotMatch(page, /\[\[s1\]\]/, 'no unresolved citation should survive');
    // An article is a normal edition and must not claim to be the fallback.
    assert.doesNotMatch(page, /automated chronological digest/);

    const archive = await readFile(join(dirs.siteDir, 'archive.html'), 'utf8');
    assert.match(archive, /A quiet week ends loudly/);
  });
});

test('archive renders article and digest editions side by side', async () => {
  await withDirs(async (dirs) => {
    const older = digestEdition('2026-08-05');
    await writeEdition(older, dirs.editionsDir);
    const article = articleEdition();
    await writeEdition(article, dirs.editionsDir);
    await writeSite(article, dirs);

    const archive = await readFile(join(dirs.siteDir, 'archive.html'), 'utf8');
    assert.match(archive, /A quiet week ends loudly/);
    assert.match(archive, /2026-08-05/);
    // Newest first.
    assert.ok(archive.indexOf('2026-08-06') < archive.indexOf('2026-08-05'));
  });
});

test('a digest edition still renders its fallback disclosure', async () => {
  await withDirs(async (dirs) => {
    const edition = digestEdition('2026-08-06');
    await writeEdition(edition, dirs.editionsDir);
    await writeSite(edition, dirs);

    const page = await readFile(join(dirs.siteDir, 'index.html'), 'utf8');
    assert.match(page, /automated chronological digest/);
  });
});

test('a malformed edition JSON is fatal rather than skipped', async () => {
  await withDirs(async (dirs) => {
    const edition = articleEdition();
    await writeEdition(edition, dirs.editionsDir);
    await writeFile(join(dirs.editionsDir, '2026-08-04.json'), '{"date":"2026-08-04"}', 'utf8');

    await assert.rejects(() => writeSite(edition, dirs), /unknown "mode"/);
  });
});
