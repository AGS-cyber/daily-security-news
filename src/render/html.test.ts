import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArticleEdition, DigestEdition, Item, Selection } from '../types.js';
import { vulnerability } from '../test-helpers.js';
import { ENHANCE_SCRIPT, ENHANCE_SCRIPT_HASH } from './enhance.js';
import { timestamp } from './format.js';
import { archivePage, articlePage, CONTENT_SECURITY_POLICY, digestPage, layout } from './html.js';

/** Reader-facing renderer behaviour: dates, roles, source status, priority, structure. */

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id, sourceId: 'krebs', sourceKind: 'rss', title: `Story ${id}`,
    url: `https://example.test/${id}`, canonicalUrl: `https://example.test/${id}`,
    publishedAt: '2026-08-06T09:00:00.000Z', alsoCoveredBy: [], cves: [], ...over,
  };
}

function selected(id: string, over: Partial<Item> = {}): Item & Selection {
  return { ...item(id, over), section: 'exploited', rank: 1, angle: 'why' };
}

function article(over: Partial<ArticleEdition> = {}): ArticleEdition {
  return {
    date: '2026-08-06', generatedAt: '2026-08-06T12:00:00.000Z', mode: 'article',
    headline: 'A quiet week ends loudly', standfirst: 'Standfirst.',
    bodyMarkdown: '## Actively exploited\n\nRead [[s1]].\n',
    selected: [selected('s1')], alsoCollected: [item('s2'), item('s3', { sourceId: 'talos' })],
    degraded: [],
    stats: { sourcesConfigured: 12, sourcesOk: 12, collected: 3, normalized: 3, deduped: 3, published: 3 },
    usage: { model: 'm', promptCacheHitTokens: 0, promptCacheMissTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    ...over,
  };
}

function digest(over: Partial<DigestEdition> = {}): DigestEdition {
  return {
    date: '2026-08-06', generatedAt: '2026-08-06T12:00:00.000Z', mode: 'digest',
    items: [item('s1'), item('s2', { sourceId: 'talos' })], degraded: [],
    stats: { sourcesConfigured: 12, sourcesOk: 11, collected: 2, normalized: 2, deduped: 2, published: 2 },
    ...over,
  };
}

function section(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  assert.ok(start !== -1, `missing #${id}`);
  return html.slice(start, html.indexOf('</section>', start));
}

/** Inspect rendered markup without confusing selectors in the shared CSS/script for DOM attributes. */
function markupOnly(html: string): string {
  return html.replace(`<script>${ENHANCE_SCRIPT}</script>`, '').replace(/<style>[\s\S]*?<\/style>/, '');
}

test('index.html is the latest edition; a dated page is an unchanging stored edition', () => {
  const latest = articlePage(article(), { role: 'latest' });
  assert.match(latest, /<strong>Latest edition<\/strong> when this page was published/);
  assert.match(latest, /data-role="latest"/);
  assert.match(latest, /data-next-due="2026-08-07T12:00:00.000Z"/);
  assert.match(latest, /Next edition scheduled for <time datetime="2026-08-07T12:00:00.000Z">7 August 2026 12:00 UTC<\/time>/);
  assert.match(latest, /data-age-when="nojs">If that time has passed, this page may be out of date/);
  assert.match(latest, /<a aria-current="page" href="index.html">latest<\/a>/);

  const dated = articlePage(article());
  assert.match(dated, /<strong>Stored edition<\/strong>: the permanent page for 6 August 2026/);
  assert.match(dated, /not updated after generation/);
  assert.doesNotMatch(markupOnly(dated), /Latest edition|data-next-due|aria-current/);
  assert.doesNotMatch(dated, /data-age-when="(stale|due|nojs)"/, 'a permalink never claims to be stale or current');
  // The historical generation time is shown as recorded, never as "now".
  assert.match(dated, /Generated <time datetime="2026-08-06T12:00:00.000Z">/);
  assert.match(dated, /Edition generated <time datetime="2026-08-06T12:00:00.000Z">6 August 2026 12:00 UTC<\/time>; this page shows that run/);
});

test('titles keep their established strings', () => {
  assert.match(articlePage(article()), /<title>A quiet week ends loudly — 6 August 2026<\/title>/);
  assert.match(digestPage(digest()), /<title>Security digest — 6 August 2026<\/title>/);
  assert.match(archivePage([]), /<title>Archive — Daily Security News<\/title>/);
});

test('article prose comes before the secondary lists', () => {
  const story = selected('s1', { cves: [vulnerability()] });
  const html = articlePage(article({ selected: [story] }));
  const order = ['class="standfirst"', 'id="edition-article"', 'id="edition-vulns"', 'id="edition-stories-h"', 'id="edition-sources"']
    .map((marker) => html.indexOf(marker));
  assert.ok(order.every((n) => n !== -1), 'every section is present');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(html, /<nav class="toc" aria-label="On this page">/);
  assert.match(html, /href="#edition-vulns">Vulnerability intelligence \(1\)/);
});

test('older editions say per-source status was not recorded', () => {
  const html = digestPage(digest());
  const sources = section(html, 'edition-sources');
  assert.match(sources, /Source-by-source status was not recorded for this edition/);
  assert.match(sources, /11 of 12 configured sources as OK; it does not say which sources those were/);
  assert.match(html, /<span class="warn">11 of 12 sources OK \(stored total\)<\/span>/);
});

test('recorded source status lists failures first and never equates a fetch with freshness', () => {
  const html = digestPage(digest({ collection: [
    { sourceId: 'krebs', attemptedAt: '2026-08-06T11:58:00.000Z', status: 'ok', items: 4, skipped: 0 },
    { sourceId: 'talos', attemptedAt: '2026-08-06T11:58:00.000Z', status: 'empty', items: 0, skipped: 0 },
    { sourceId: 'unit42', attemptedAt: '2026-08-04T09:00:00.000Z', status: 'failed', items: 0, skipped: 0 },
    { sourceId: 'odd<b>', attemptedAt: 'garbage', status: 'weird' as 'ok', items: 1, skipped: 0 },
  ] }));
  const sources = section(html, 'edition-sources');
  assert.match(sources, /4 of 12 configured sources have a recorded result: 1 with entries, 1 empty, 1 failed/);
  assert.match(sources, /does not establish that a source has new reporting/);
  assert.doesNotMatch(sources, /fresh|healthy|up to date|live/i);
  const failed = sources.indexOf('Unit 42: fetch failed');
  const empty = sources.indexOf('Cisco Talos: no usable entries');
  const ok = sources.indexOf('Krebs on Security: 4 entries collected');
  assert.ok(failed !== -1 && empty !== -1 && ok !== -1);
  assert.ok(failed < empty && empty < ok, 'failures then empties then successes');
  assert.match(sources, /<span class="tag">FETCHED<\/span> Krebs on Security/);
  assert.match(sources, /<span class="tag">FAILED<\/span> Unit 42/);
  assert.match(sources, /checked more than a day before this edition was generated/);
  // An unexpected stored status is neither trusted nor injected.
  assert.match(sources, /<span class="tag">UNKNOWN<\/span> odd&lt;b&gt;: unrecognised status &quot;weird&quot;; checked garbage \(unreadable check time\)/);
  assert.match(html, /feeds 1 with entries, <span class="warn">1 empty<\/span>, <span class="warn">1 failed<\/span>/);
});

test('normalization exclusions are summarised by recorded reason only', () => {
  const ex = (reason: 'invalid_date' | 'future_event') => ({
    sourceId: 'krebs', title: '<t>', url: 'https://example.test/x', publishedAt: 'x', observedAt: 'x', reason,
  });
  const html = digestPage(digest({ normalizationExclusions: [ex('invalid_date'), ex('invalid_date'), ex('future_event')] }));
  assert.match(section(html, 'edition-sources'), /Excluded during normalization: 2 entries with an invalid date, 1 future event listing\./);
  assert.match(section(digestPage(digest({ normalizationExclusions: [] })), 'edition-sources'), /No collected entries were excluded/);
  assert.doesNotMatch(section(digestPage(digest()), 'edition-sources'), /Excluded during normalization|No collected entries/);
});

test('filters are present but hidden without JS, and every story stays in the markup', () => {
  const html = digestPage(digest());
  assert.match(html, /<div class="filters" role="search" aria-label="Filter these stories" data-filters data-filter-target="edition-stories" hidden>/);
  assert.match(html, /<label for="edition-stories-q">Search text<\/label><input id="edition-stories-q" type="search"/);
  assert.match(html, /<label for="edition-stories-priority">Vulnerability priority<\/label>/);
  assert.match(html, /<option value="talos">Cisco Talos \(1\)<\/option>/);
  assert.match(html, /<button type="button" data-filter-reset>Reset filters<\/button>/);
  assert.match(html, /<p class="count" role="status" data-filter-count>Showing all 2 stories\.<\/p>/);
  assert.match(html, /<li id="s1" data-story data-source="krebs" data-priority="none">/);
  assert.match(html, /<li id="s2" data-story data-source="talos" data-priority="none">/);
  assert.doesNotMatch(html, /<li[^>]*data-story[^>]*hidden/);
});

test('untrusted ids and source ids are escaped wherever they reach attributes', () => {
  const html = digestPage(digest({ items: [item('s1"x', { sourceId: 'a"><i>' }), item('s2')] }));
  assert.match(html, /<li id="s1&quot;x" data-story data-source="a&quot;&gt;&lt;i&gt;"/);
  assert.match(html, /<option value="a&quot;&gt;&lt;i&gt;">a&quot;&gt;&lt;i&gt; \(1\)<\/option>/);
  assert.doesNotMatch(html, /<i>/);
});

test('story numbers are stable data, so filtering cannot renumber them', () => {
  const html = digestPage(digest());
  assert.match(html, /<p class="story-title" data-n="01">/);
  assert.match(html, /<p class="story-title" data-n="02">/);
});

test('story ages relative to the edition flag old and impossible dates', () => {
  const html = digestPage(digest({ items: [
    item('s1', { publishedAt: '2026-08-03T09:00:00.000Z' }),
    item('s2', { publishedAt: '2026-08-07T09:00:00.000Z' }),
    item('s3', { publishedAt: '2026-08-06T09:00:00.000Z' }),
  ] }));
  assert.match(html, /3 days before this edition/);
  assert.match(html, /dated after this edition was generated/);
  assert.equal(html.match(/before this edition/g)?.length, 1, 'same-day stories carry no note');
});

test('offset timestamps render the UTC date and the UTC time together', () => {
  assert.equal(
    timestamp('2026-08-06T23:30:00-05:00'),
    '<time datetime="2026-08-07T04:30:00.000Z">7 August 2026 04:30 UTC</time>',
  );
  assert.equal(timestamp('<bad>'), '&lt;bad&gt;');
});

test('an unreadable generation time is shown verbatim and never fed to the script', () => {
  const html = digestPage(digest({ generatedAt: 'soon<ish>' }));
  assert.match(html, /Generated soon&lt;ish&gt; \(this timestamp could not be read\)/);
  assert.doesNotMatch(markupOnly(html), /data-generated-at/);
});

test('prioritised vulnerabilities are ordered by KEV then score and linked to their stories', () => {
  const kevLow = vulnerability('CVE-2026-0003', { score: 5.0, severity: 'MEDIUM' });
  const high = vulnerability('CVE-2026-0001', { knownExploited: false, score: 7.5, severity: 'HIGH' });
  const critical = vulnerability('CVE-2026-0002', { knownExploited: false, score: 9.1, severity: 'CRITICAL' });
  const html = articlePage(article({
    selected: [selected('s1', { title: 'Router <flaw>', cves: [high, critical, kevLow] })],
  }));
  const vulns = section(html, 'edition-vulns');
  const at = (id: string) => vulns.indexOf(`>${id}</a>`);
  assert.ok(at('CVE-2026-0003') < at('CVE-2026-0002') && at('CVE-2026-0002') < at('CVE-2026-0001'));
  assert.match(vulns, /Mentioned in: <a href="https:\/\/example.test\/s1">Router &lt;flaw&gt;<\/a> \(Krebs on Security\)/);
  assert.match(vulns, /<li class="prio-known_exploited">/);
  // The CISA action is visible in the prioritised list, before the folded evidence.
  const kev = vulns.slice(vulns.indexOf('<li class="prio-known_exploited">'));
  assert.ok(kev.indexOf('CISA required action:') < kev.indexOf('<details'));
  assert.match(kev, /CISA catalog due date: 2026-08-22 \(not a universal deadline\)/);
  assert.match(kev, /Evidence was older than the refresh window when this edition was generated/);
  assert.doesNotMatch(vulns, /due date[^<]*(?:everyone|all organi[sz]ations)/i);
});

test('a CVE that is neither KEV nor High/Critical is not promoted into the priority list', () => {
  const low = vulnerability('CVE-2026-0009', { knownExploited: false, score: 4.3, severity: 'MEDIUM' });
  const html = digestPage(digest({ items: [item('s1', { cves: [low] }), item('s2')] }));
  assert.doesNotMatch(html, /id="edition-vulns"/);
  assert.match(html, /CVE-2026-0009/, 'still listed beside its story');
  assert.match(html, /data-priority="cve"/);
});

test('empty states explain what an empty list can mean', () => {
  const html = digestPage(digest({ items: [], stats: { ...digest().stats, published: 0 } }));
  assert.match(html, /No stories were published in this edition\. That can mean a quiet window or failed collection/);
  assert.doesNotMatch(markupOnly(html), /data-filters/);
  assert.match(archivePage([]), /No editions have been stored yet/);
  assert.match(articlePage(article({ alsoCollected: [] })), /Every story collected for this edition is written up above/);
});

test('the archive names its newest edition and its own rebuild time, not an edition generation', () => {
  const html = archivePage([
    { date: '2026-08-05', mode: 'digest', count: 2 },
    { date: '2026-08-06', mode: 'article', headline: 'Loud <week>', count: 5 },
  ], { builtAt: '2026-08-06T12:03:00.000Z' });
  assert.match(html, /Newest stored edition: <a href="2026-08-06.html">6 August 2026 — Loud &lt;week&gt;<\/a>/);
  assert.match(html, /data-role="archive" data-next-due="2026-08-07T12:00:00.000Z"/);
  assert.match(html, /Archive index rebuilt <time datetime="2026-08-06T12:03:00.000Z">/);
  assert.match(html, /Each edition page keeps its own original generation time/);
  assert.doesNotMatch(html, /Generated/);
  assert.match(html, /<a aria-current="page" href="archive.html">archive<\/a>/);
  assert.match(html, /aria-label="6 August 2026 — Loud &lt;week&gt; · 5 stories · newest stored edition"/);
});

test('layout pins the script by hash and can omit it entirely', () => {
  assert.match(CONTENT_SECURITY_POLICY, new RegExp(`script-src '${ENHANCE_SCRIPT_HASH.replace(/[+/=]/g, '\\$&')}'`));
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval|connect-src/);
  // Interpolated into an attribute unescaped, so it must be attribute-safe.
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /["<>&]/);
  const bare = layout({ title: 't', bodyHtml: '<p>x</p>', generatedAt: 'g', enhance: false });
  assert.doesNotMatch(bare, /<script|script-src/);
  const page = layout({ title: 't', bodyHtml: '<p>x</p>', generatedAt: 'g' });
  assert.ok(page.includes(`<script>${ENHANCE_SCRIPT}</script>`));
  assert.match(page, /<a class="skip" href="#main">Skip to content<\/a>/);
  assert.match(page, /<main id="main" tabindex="-1">/);
  assert.match(page, /<nav class="nav" aria-label="Site">/);
  assert.match(page, /<footer>Generated g<\/footer>/);
});

test('degraded editions link to the per-source record when one exists', () => {
  const html = digestPage(digest({
    degraded: [{ stage: 'collect', sourceId: 'unit42', message: 'Unit 42 <failed>' }],
    collection: [{ sourceId: 'unit42', attemptedAt: '2026-08-06T11:58:00.000Z', status: 'failed', items: 0, skipped: 0 }],
  }));
  assert.match(html, /<section class="degraded" aria-labelledby="edition-degraded-h">/);
  assert.match(html, /Unit 42 &lt;failed&gt;/);
  assert.match(html, /<a href="#edition-sources">Source status<\/a> lists each feed’s recorded result/);
});
