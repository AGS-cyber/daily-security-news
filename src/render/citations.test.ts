import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item, Selection } from '../types.js';
import { substituteCitations } from './citations.js';

function story(id: string, title: string, url: string): Item & Selection {
  return {
    id,
    section: 'exploited',
    rank: 1,
    angle: 'why it matters',
    sourceId: 'krebs',
    sourceKind: 'rss',
    title,
    url,
    canonicalUrl: url,
    publishedAt: '2026-08-06T09:00:00.000Z',
    alsoCoveredBy: [],
  };
}

test('a citation becomes an anchor with the right href and title', () => {
  const selected = [story('s1', 'Edge appliance under attack', 'https://a.test/1')];

  assert.equal(
    substituteCitations('It is being exploited [[s1]].', selected),
    'It is being exploited <a href="https://a.test/1">Edge appliance under attack</a>.',
  );
});

test('escapes &, < and " in both the title and the url', () => {
  const selected = [
    story('s1', 'Ampersand & <script> and "quotes"', 'https://a.test/?a=1&b="2"<'),
  ];

  const html = substituteCitations('[[s1]]', selected);

  assert.equal(
    html,
    '<a href="https://a.test/?a=1&amp;b=&quot;2&quot;&lt;">Ampersand &amp; &lt;script&gt; and &quot;quotes&quot;</a>',
  );
  assert.ok(!html.includes('<script>'));
});

test('substitutes every occurrence of every id', () => {
  const selected = [story('s1', 'One', 'https://a.test/1'), story('s2', 'Two', 'https://a.test/2')];

  const html = substituteCitations('[[s1]] then [[s2]] then [[s1]] again', selected);

  assert.equal(html.match(/<a /g)?.length, 3);
});

test('an unknown id throws — a broken link must never ship', () => {
  const selected = [story('s1', 'One', 'https://a.test/1')];

  assert.throws(() => substituteCitations('Look at [[s9]].', selected), /\[\[s9\]\]/);
});
