import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ArticleEdition, DigestEdition, Item, Selection } from '../types.js';
import { vulnerability } from '../test-helpers.js';
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
    cves: [],
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
      model: 'deepseek-v4-flash',
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

    // The web-served copy of the record must be the edition itself, verbatim.
    const served: unknown = JSON.parse(
      await readFile(join(dirs.siteDir, 'editions', '2026-08-06.json'), 'utf8'),
    );
    assert.deepStrictEqual(served, edition);
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

    // index.json is the same archive index as data, newest first.
    const index: unknown = JSON.parse(
      await readFile(join(dirs.siteDir, 'editions', 'index.json'), 'utf8'),
    );
    assert.ok(Array.isArray(index));
    const newer = index.findIndex((e: { date: string }) => e.date === '2026-08-06');
    const older_ = index.findIndex((e: { date: string }) => e.date === '2026-08-05');
    assert.ok(newer !== -1, 'index.json should contain 2026-08-06');
    assert.ok(older_ !== -1, 'index.json should contain 2026-08-05');
    assert.equal(index[newer].mode, 'article');
    assert.equal(index[newer].headline, 'A quiet week ends loudly');
    // Newest first.
    assert.ok(newer < older_);
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

test('important selected vulnerabilities render as compact authoritative metadata', async () => {
  await withDirs(async (dirs) => {
    const story = selected('s1', 'Router flaw', 'https://example.test/a');
    story.cves = [vulnerability()];
    const edition = articleEdition({ selected: [story], alsoCollected: [] });
    await writeEdition(edition, dirs.editionsDir);
    await writeSite(edition, dirs);

    const page = await readFile(join(dirs.siteDir, 'index.html'), 'utf8');
    assert.match(page, /Vulnerability intelligence/);
    assert.match(page, /CVE-2026-12345/);
    assert.match(page, /CVSS 9\.8/);
    assert.match(page, /Critical/);
    assert.match(page, /CISA KEV/);
    assert.match(page, /CISA ransomware use: Known/);

    const stored = JSON.parse(
      await readFile(join(dirs.editionsDir, '2026-08-06.json'), 'utf8'),
    ) as ArticleEdition;
    assert.deepEqual(stored.selected[0]?.cves, story.cves);
  });
});

test('every page carries the subscribe form, and it needs no JavaScript', async () => {
  await withDirs(async (dirs) => {
    const edition = articleEdition();
    await writeEdition(edition, dirs.editionsDir);
    await writeSite(edition, dirs);

    // In layout(), so today's page, the dated page and the archive all have it.
    for (const file of ['index.html', '2026-08-06.html', 'archive.html']) {
      const page = await readFile(join(dirs.siteDir, file), 'utf8');
      assert.match(
        page,
        /<form method="post" action="https:\/\/buttondown\.com\/api\/emails\/embed-subscribe\//,
        `${file} is missing the subscribe form`,
      );
      assert.match(page, /name="email"[^>]*required|required[^>]*name="email"/, file);
      assert.match(page, /name="embed" value="1"/, file);
      // The site has never shipped a script tag and this must not be the first.
      assert.doesNotMatch(page, /<script/i, `${file} gained a script tag`);
    }
  });
});

test('every page carries the tab icon, inlined rather than fetched', async () => {
  await withDirs(async (dirs) => {
    const edition = articleEdition();
    await writeEdition(edition, dirs.editionsDir);
    await writeSite(edition, dirs);

    // In layout(), like the subscribe form, so it reaches all three page kinds.
    for (const file of ['index.html', '2026-08-06.html', 'archive.html']) {
      const page = await readFile(join(dirs.siteDir, file), 'utf8');
      const encoded = /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)">/
        .exec(page)
        ?.at(1);
      assert.ok(encoded, `${file} is missing the tab icon`);

      const svg = decodeURIComponent(encoded);
      // The `$` is three strokes. An SVG path fills black by default, so
      // without this the mark renders as a blob rather than failing.
      assert.match(svg, /fill="none"/, `${file}: the glyph would fill black`);
      assert.match(svg, /stroke="#7dffa4"/, `${file}: the glyph is not phosphor green`);
    }
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
