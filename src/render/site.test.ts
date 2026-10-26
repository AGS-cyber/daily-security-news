import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ArticleEdition, DigestEdition, Item, Selection } from '../types.js';
import { createHash } from 'node:crypto';
import { vulnerability } from '../test-helpers.js';
import { articlePage, digestPage } from './html.js';
import { writeEdition } from './edition.js';
import { ENHANCE_SCRIPT } from './enhance.js';
import { writeSite } from './site.js';

/**
 * Every page deliberately carries one script: the constant, CSP-hashed
 * enhancement. Remove exactly that one so assertions about untrusted content
 * can still say "no script at all came from the edition".
 */
function withoutEnhancement(html: string): string {
  const tag = `<script>${ENHANCE_SCRIPT}</script>`;
  assert.equal(html.split(tag).length - 1, 1, 'expected exactly one trusted enhancement script');
  return html.replace(tag, '');
}

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
    const july = digestEdition('2026-07-31');
    await writeEdition(july, dirs.editionsDir);
    const article = articleEdition();
    await writeEdition(article, dirs.editionsDir);
    await writeSite(article, dirs);

    const archive = await readFile(join(dirs.siteDir, 'archive.html'), 'utf8');
    // The calendar keeps each headline on its day, where the list used to
    // print it: hidden from the grid, still reachable and still read aloud.
    assert.match(archive, /A quiet week ends loudly/);
    assert.match(archive, /href="2026-08-05\.html"/);
    // Days ascend inside a month, so it is the months that run newest first.
    assert.match(archive, /<caption>August 2026/);
    assert.match(archive, /<caption>July 2026/);
    assert.ok(
      archive.indexOf('<caption>August 2026') < archive.indexOf('<caption>July 2026'),
      'the newest month should be the first grid on the page',
    );
    // A published day links; a day that published nothing is drawn and dimmed.
    assert.doesNotMatch(archive, /href="2026-08-04\.html"/);
    assert.match(archive, /<td class="off"><span>4<\/span><\/td>/);
    // The newest edition is the one index.html carries, and is marked as such.
    assert.match(archive, /<td class="on latest"><a class="article" href="2026-08-06\.html"/);

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

test('no page asks for an email address, and the only script is the hashed enhancement', async () => {
  await withDirs(async (dirs) => {
    const edition = articleEdition();
    await writeEdition(edition, dirs.editionsDir);
    await writeSite(edition, dirs);

    const hash = `sha256-${createHash('sha256').update(ENHANCE_SCRIPT, 'utf8').digest('base64')}`;
    // The subscribe form lived in layout(), so its removal has to hold for
    // today's page, the dated page and the archive alike.
    for (const file of ['index.html', '2026-08-06.html', 'archive.html']) {
      const page = await readFile(join(dirs.siteDir, file), 'utf8');
      assert.doesNotMatch(page, /buttondown/i, `${file} still points at Buttondown`);
      assert.doesNotMatch(page, /<form/i, `${file} still collects an address`);
      // One deliberate script, permitted by hash alone: no other script tag,
      // no external source, no inline handler, no inline/eval allowance.
      assert.doesNotMatch(withoutEnhancement(page), /<script/i, `${file} gained another script tag`);
      assert.doesNotMatch(page, /<script[^>]*\ssrc=/i, `${file} loads an external script`);
      assert.doesNotMatch(page, /<[a-z][^>]*\son[a-z]+\s*=/i, `${file} has an inline event handler`);
      const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page)?.at(1);
      assert.ok(csp, `${file} has no CSP`);
      assert.match(csp, new RegExp(`script-src '${hash.replace(/[+/=]/g, '\\$&')}'`), `${file} CSP does not pin the script hash`);
      assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline|connect-src/, `${file} CSP is too broad`);
    }
  });
});

test('every page carries the tab icon, inlined rather than fetched', async () => {
  await withDirs(async (dirs) => {
    const edition = articleEdition();
    await writeEdition(edition, dirs.editionsDir);
    await writeSite(edition, dirs);

    // In layout(), so it reaches all three page kinds.
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

test('hostile saved Markdown cannot create scripts, images or executable links', async () => {
 await withDirs(async (dirs) => {
  const edition = articleEdition({bodyMarkdown: '## News\n<script>alert(1)</script><img src=x onerror=alert(1)>\n[bad](javascript:alert(1)) [[s1]]'});
  await writeEdition(edition, dirs.editionsDir);
  await writeSite(edition, dirs);
  const html = await readFile(join(dirs.siteDir, 'index.html'), 'utf8');
  assert.doesNotMatch(withoutEnhancement(html), /<script|<img|href="javascript:/i);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /href="https:\/\/example.test\/a"/);
 });
});
test('expected future event exclusions show an informational notice without an incomplete banner', () => {
 const edition = articleEdition({normalizationExclusions:[{sourceId:'darkreading', title:'[Virtual Event] Outlook',
 url:'https://example.test/events/outlook', publishedAt:'2026-12-03T16:00:00Z',
 observedAt:'2026-09-29T17:29:47.241Z', reason:'future_event'}]});
 const html = articlePage(edition);
 assert.match(html,/1 future event listing was excluded/);
 assert.doesNotMatch(html,/This edition is incomplete/);
});
test('legacy normalize-only notice is honest and leaves the stored record unchanged', async () => {
 await withDirs(async (dirs) => {
  const edition = articleEdition({degraded:[{stage:'normalize',message:'1 items were dropped as unparseable'}]});
  await writeEdition(edition,dirs.editionsDir);
  const before = await readFile(join(dirs.editionsDir,`${edition.date}.json`),'utf8');
  await writeSite(edition,dirs);
  const html = await readFile(join(dirs.siteDir,'index.html'),'utf8');
  assert.match(html,/Collection notice/);
  assert.match(html,/specific rejection reason was not recorded/);
  assert.doesNotMatch(html,/This edition is incomplete|future event/);
  assert.equal(await readFile(join(dirs.editionsDir,`${edition.date}.json`),'utf8'), before);
  assert.deepEqual(JSON.parse(await readFile(join(dirs.siteDir,'editions',`${edition.date}.json`),'utf8')),edition);
 });
});
test('known malformed exclusions and independent failures retain the incomplete warning', () => {
 const edition = articleEdition({normalizationExclusions:[],degraded:[{stage:'normalize',message:'1 collected item was excluded: 1 with invalid publication date.'}]});
 assert.match(articlePage(edition),/This edition is incomplete/);
 const mixed = articleEdition({degraded:[{stage:'normalize',message:'1 items were dropped as unparseable'},{stage:'collect',message:'A feed failed'}]});
 assert.match(articlePage(mixed),/This edition is incomplete/);
 assert.match(articlePage(mixed),/specific rejection reason was not recorded/);
});

test('article and digest readers see full edition and story dates without scripts', () => {
  const article = articlePage(articleEdition());
  assert.match(article, /Edition 6 August 2026/);
  assert.match(article, /Generated <time datetime="2026-08-06T12:00:00.000Z">6 August 2026 12:00 UTC/);
  assert.match(article, /Scheduled daily at 12:00 UTC; publication can be delayed/);
  assert.match(article, /href="index.html">latest/);
  assert.match(article, /<time datetime="2026-08-06T09:00:00.000Z">6 August 2026 09:00 UTC/);
  assert.match(digestPage(digestEdition('2026-08-06')), /Edition 6 August 2026/);
});

test('coverage reports partial failures and exclusions without claiming new reporting', () => {
  const html = articlePage(articleEdition({ collection: [
    { sourceId: 'krebs', attemptedAt: '2026-08-06T12:00:00Z', status: 'ok', items: 5, skipped: 1 },
    { sourceId: 'down<script>', attemptedAt: '2026-08-06T12:00:00Z', status: 'failed', items: 0, skipped: 0 },
  ], degraded: [{ stage: 'collect', sourceId: 'down<script>', message: 'A source failed' }] }));
  assert.match(html, /Krebs on Security: 5 entries collected/);
  assert.match(html, /1 entry missing a title or link/);
  assert.match(html, /down&lt;script&gt;: fetch failed/);
  assert.match(html, /does not establish that a source has new reporting/);
  assert.match(html, /This edition is incomplete/);
  assert.doesNotMatch(withoutEnhancement(html), /<script/);
});

test('CISA actions are linked to evidence, escaped and explicitly dated', () => {
  const story = selected('s1', 'Example advisory', 'https://example.test/a');
  const cve = vulnerability();
  cve.kev!.requiredAction = 'Apply <script>untrusted</script> & follow vendor instructions.';
  story.cves = [cve];
  const html = articlePage(articleEdition({ selected: [story] }));
  assert.match(html, /CISA required action/);
  assert.match(html, /Apply &lt;script&gt;untrusted&lt;\/script&gt; &amp;/);
  assert.match(html, /href="https:\/\/www.cisa.gov\/known-exploited-vulnerabilities-catalog"/);
  assert.match(html, /retrieved <time datetime="2026-08-01T01:00:00.000Z"/);
  assert.match(html, /older than the refresh window at generation/);
  assert.match(html, /CISA catalog due date: 2026-08-22 \(not a universal deadline\)/);
  assert.doesNotMatch(withoutEnhancement(html), /<script/);
});

test('unenriched CVEs remain visible beside a story with explicit unknown status and no invented action', () => {
  const cve = vulnerability('CVE-2026-12345', { knownExploited: null, score: null, severity: null });
  cve.nvd = null;
  cve.provenance.nvd.status = 'unavailable';
  cve.provenance.nvd.retrievedAt = null;
  const edition = digestEdition('2026-08-06');
  edition.items[0]!.cves = [cve];
  const html = digestPage(edition);
  assert.match(html, /CVE-2026-12345/);
  assert.match(html, /KEV status unavailable/);
  assert.match(html, /NVD unavailable/);
  assert.doesNotMatch(html, /CISA required action:|CISA catalog due date:|CVSS \d/);
  assert.match(html, /Absence from KEV does not establish absence of exploitation/);
});
