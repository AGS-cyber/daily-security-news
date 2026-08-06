import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenStore } from '../store/seen.js';
import type { Cluster } from '../types.js';
import { filter } from './filter.js';

const NOW = new Date('2026-08-06T12:00:00.000Z');
const TODAY = '2026-08-06';

function cluster(canonicalUrl: string, publishedAt: string): Cluster {
  return {
    sourceId: 'krebs',
    sourceKind: 'rss',
    title: canonicalUrl,
    url: canonicalUrl,
    canonicalUrl,
    publishedAt,
    alsoCoveredBy: [],
  };
}

/** Minimal store standing in for data/seen.json, keyed by URL for readability. */
function seenStore(covered: Record<string, string>): SeenStore {
  return {
    publishedBefore: (url, date) => covered[url] !== undefined && covered[url]! < date,
    add: (url, date) => {
      covered[url] = date;
    },
    save: async () => {},
    get size() {
      return Object.keys(covered).length;
    },
  };
}

function hoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000).toISOString();
}

test('drops an item an earlier edition already covered', () => {
  const clusters = [cluster('https://a.test/1', hoursAgo(2))];
  const result = filter(clusters, seenStore({ 'https://a.test/1': '2026-08-05' }), NOW);

  assert.equal(result.kept.length, 0);
  assert.equal(result.droppedSeen, 1);
});

test('keeps an item first covered today, so a same-day re-run rebuilds the edition', () => {
  // Regression: treating "seen at all" as a drop meant the second run of a day
  // published an empty edition over the first one, destroying that day's record.
  const clusters = [cluster('https://a.test/1', hoursAgo(2))];
  const result = filter(clusters, seenStore({ 'https://a.test/1': TODAY }), NOW);

  assert.equal(result.kept.length, 1);
  assert.equal(result.droppedSeen, 0);
});

test('keeps an unseen item inside the 7-day window', () => {
  const clusters = [cluster('https://a.test/1', hoursAgo(24 * 6))];
  const result = filter(clusters, seenStore({}), NOW);

  assert.equal(result.kept.length, 1);
  assert.equal(result.droppedOld, 0);
});

test('drops an unseen item older than 7 days', () => {
  const clusters = [cluster('https://a.test/1', hoursAgo(24 * 8))];
  const result = filter(clusters, seenStore({}), NOW);

  assert.equal(result.kept.length, 0);
  assert.equal(result.droppedOld, 1);
});

test('returns survivors newest first', () => {
  const clusters = [
    cluster('https://a.test/old', hoursAgo(20)),
    cluster('https://a.test/new', hoursAgo(1)),
    cluster('https://a.test/mid', hoursAgo(10)),
  ];
  const result = filter(clusters, seenStore({}), NOW);

  assert.deepEqual(
    result.kept.map((c) => c.canonicalUrl),
    ['https://a.test/new', 'https://a.test/mid', 'https://a.test/old'],
  );
});
