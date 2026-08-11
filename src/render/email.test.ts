import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArticleEdition, DigestEdition, Item, Selection } from '../types.js';
import { vulnerability } from '../test-helpers.js';
import { emailEdition } from './email.js';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 's1',
    sourceId: 'thehackernews',
    sourceKind: 'rss',
    title: 'Router <bug> & "chaos"',
    url: 'https://example.test/a',
    canonicalUrl: 'https://example.test/a',
    publishedAt: '2026-08-06T09:30:00.000Z',
    alsoCoveredBy: [],
    cves: [],
    ...over,
  };
}

function selected(over: Partial<Item & Selection> = {}): Item & Selection {
  return { ...item(), section: 'exploited', rank: 1, angle: 'why it matters', ...over };
}

function articleEdition(over: Partial<ArticleEdition> = {}): ArticleEdition {
  return {
    mode: 'article',
    date: '2026-08-06',
    generatedAt: '2026-08-06T12:00:00.000Z',
    degraded: [],
    stats: {
      sourcesConfigured: 12,
      sourcesOk: 12,
      collected: 40,
      normalized: 40,
      deduped: 30,
      published: 30,
    },
    headline: 'A quiet week ends loudly',
    standfirst: 'One paragraph of context.',
    bodyMarkdown: '## Actively exploited\n\nThe lead is [[s1]] and it matters.\n',
    selected: [selected()],
    alsoCollected: [item({ id: 's2', title: 'Second story', url: 'https://example.test/b' })],
    usage: {
      model: 'deepseek-v4-flash',
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.001,
    },
    ...over,
  };
}

function digestEdition(over: Partial<DigestEdition> = {}): DigestEdition {
  return {
    mode: 'digest',
    date: '2026-08-06',
    generatedAt: '2026-08-06T12:00:00.000Z',
    degraded: [],
    stats: {
      sourcesConfigured: 12,
      sourcesOk: 11,
      collected: 3,
      normalized: 3,
      deduped: 2,
      published: 2,
    },
    items: [item(), item({ id: 's2', title: 'Second story', url: 'https://example.test/b' })],
    ...over,
  };
}

test('an article email carries the headline, the prose and the also-collected list', () => {
  const { subject, html } = emailEdition(articleEdition());

  assert.match(subject, /A quiet week ends loudly/);
  assert.match(subject, /6 August 2026/);
  assert.match(html, /A quiet week ends loudly/);
  assert.match(html, /One paragraph of context\./);
  assert.match(html, /Actively exploited/);
  assert.match(html, /Also collected today/);
  assert.match(html, /Second story/);
});

test('citations resolve to styled links and no raw token survives', () => {
  const { html } = emailEdition(articleEdition());

  // The title is escaped, and the anchor carries an inline style — a citation
  // is raw HTML, so `marked` never routes it through the link renderer.
  assert.match(html, /<a href="https:\/\/example\.test\/a" style="color:#79dfff/);
  assert.match(html, /Router &lt;bug&gt; &amp; &quot;chaos&quot;/);
  assert.doesNotMatch(html, /\[\[s1\]\]/, 'no unresolved citation should survive');
});

test('every anchor is styled — an unstyled link is unreadable on a dark background', () => {
  const { html } = emailEdition(
    articleEdition({
      bodyMarkdown: '## Head\n\nA [markdown link](https://example.test/md) and [[s1]].\n',
      alsoCollected: [
        item({
          id: 's2',
          title: 'Second',
          url: 'https://example.test/b',
          alsoCoveredBy: [{ sourceId: 'x', name: 'Elsewhere', url: 'https://example.test/c' }],
        }),
      ],
    }),
  );

  const anchors = html.match(/<a [^>]*>/g) ?? [];
  assert.ok(anchors.length >= 4, `expected several anchors, found ${anchors.length}`);
  for (const anchor of anchors) {
    assert.match(anchor, /style="color:#79dfff/, `unstyled anchor: ${anchor}`);
  }
});

test('the terminal sigils are real markup, because email strips generated content', () => {
  const { html } = emailEdition(articleEdition());

  assert.match(html, /root@sec:~\$ /);
  assert.match(html, />\$ <\/span>/, 'the h1 sigil');
  assert.match(html, />## <\/span>/, 'the section-heading sigil');
  assert.match(html, />\[01\] <\/span>/, 'the story number');
  assert.match(html, />\/\/ <\/span>/, 'the summary and footer sigil');

  // The web mechanism must not leak in: none of these work in an email client.
  assert.doesNotMatch(html, /::before|::after|position:\s*fixed|var\(--/);
});

test('lists, bold and code in the prose all come out styled', () => {
  const { html } = emailEdition(
    articleEdition({
      bodyMarkdown:
        '## Head\n\nSome **bold** text and `CVE-2026-1234`.\n\n- First item\n- Second item\n\n1. Ordered one\n2. Ordered two\n',
    }),
  );

  assert.match(html, /<ul style="[^"]*padding-left:24px[^"]*">/);
  assert.match(html, /<ol style="[^"]*padding-left:24px[^"]*">/);
  assert.match(html, /<li style="margin:0 0 6px;">First item<\/li>/);
  assert.match(html, /<li style="margin:0 0 6px;">Ordered one<\/li>/);
  assert.match(html, /<strong style="color:#7dffa4;">bold<\/strong>/);
  assert.match(html, /<code style="color:#ffb642;">CVE-2026-1234<\/code>/);

  // A list item must not carry the paragraph's 18px bottom margin.
  assert.doesNotMatch(html, /<li style="[^"]*"><p /);
});

test('no style attribute contains a double quote', () => {
  // A double quote inside style="…" closes the attribute early and drops every
  // declaration after it. The page still renders, just without its font, size
  // and colour — so nothing fails, it is only wrong. The font stack quotes its
  // family names with apostrophes for exactly this reason (palette.ts).
  for (const edition of [articleEdition(), digestEdition()]) {
    const { html } = emailEdition(edition);
    for (const attr of html.match(/style="[^"]*"/g) ?? []) {
      assert.doesNotMatch(attr, /["'][^"']*"[^"']*["']/, `broken style attribute: ${attr}`);
    }
    // The one that actually carried the trap: the wrapper's font declaration.
    assert.match(html, /font-family:ui-monospace,[^"]*monospace;font-size:16px/);
  }
});

test('a degraded edition says so in the email too', () => {
  const { html } = emailEdition(
    articleEdition({
      degraded: [{ stage: 'collect', sourceId: 'krebs', message: 'krebs timed out' }],
    }),
  );

  assert.match(html, /\[ !! DEGRADED \]/);
  assert.match(html, /This edition is incomplete/);
  assert.match(html, /krebs timed out/);
});

test('a clean edition carries no degraded banner', () => {
  const { html } = emailEdition(articleEdition());
  assert.doesNotMatch(html, /DEGRADED/);
});

test('a digest email discloses that it is not a written article', () => {
  const { subject, html } = emailEdition(digestEdition());

  assert.match(subject, /Security digest — 6 August 2026/);
  assert.match(html, /\[ NOTICE \]/);
  assert.match(html, /automated chronological digest/);
  assert.match(html, /\[01\] /);
  assert.match(html, /\[02\] /);
});

test('an empty digest says the window was empty rather than rendering nothing', () => {
  const { html } = emailEdition(
    digestEdition({ items: [], stats: { ...digestEdition().stats, published: 0 } }),
  );
  assert.match(html, /No new stories in this window\./);
});

test('important vulnerability metadata is present without unknown placeholders', () => {
  const story = selected({ cves: [vulnerability()] });
  const { html } = emailEdition(articleEdition({ selected: [story] }));
  assert.match(html, /Vulnerability intelligence/);
  assert.match(html, /CVE-2026-12345/);
  assert.match(html, /CVSS 9\.8/);
  assert.match(html, /CISA KEV/);
  assert.doesNotMatch(html, /CVSS unknown|CVSS null/);
});

test('the email links back to its own permanent page', () => {
  const { html } = emailEdition(articleEdition());
  assert.match(html, /https:\/\/daily-security-news\.vercel\.app\/2026-08-06\.html/);
});

test('no unsubscribe link is written here — Buttondown appends its own', () => {
  const { html } = emailEdition(articleEdition());
  assert.doesNotMatch(html, /unsubscribe/i);
});

test('feed text is escaped on the way into the email', () => {
  const { html } = emailEdition(
    digestEdition({
      items: [item({ title: '<script>alert(1)</script>', excerpt: 'a & b' })],
    }),
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a &amp; b/);
});
