import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NormalizedItem } from '../types.js';
import { dedupe } from './dedupe.js';

function item(o: {
  sourceId: string;
  title: string;
  url: string;
  canonicalUrl?: string;
  publishedAt: string;
}): NormalizedItem {
  return {
    sourceId: o.sourceId,
    sourceKind: 'rss',
    title: o.title,
    url: o.url,
    canonicalUrl: o.canonicalUrl ?? o.url,
    publishedAt: o.publishedAt,
  };
}

test('two items with the same canonical URL collapse to one cluster', () => {
  const clusters = dedupe([
    item({
      sourceId: 'krebs',
      title: 'Ransomware hits a hospital chain',
      url: 'https://krebsonsecurity.com/story?utm_source=rss',
      canonicalUrl: 'https://krebsonsecurity.com/story',
      publishedAt: '2026-08-05T09:00:00.000Z',
    }),
    item({
      sourceId: 'therecord',
      title: 'Completely different wording entirely',
      url: 'https://therecord.media/story',
      canonicalUrl: 'https://krebsonsecurity.com/story',
      publishedAt: '2026-08-05T10:00:00.000Z',
    }),
  ]);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.alsoCoveredBy.length, 1);
});

test('differently-worded headlines about the same story collapse', () => {
  const clusters = dedupe([
    item({
      sourceId: 'krebs',
      title: 'Attackers exploit critical Fortinet firewall vulnerability worldwide',
      url: 'https://krebsonsecurity.com/fortinet',
      publishedAt: '2026-08-05T09:00:00.000Z',
    }),
    item({
      sourceId: 'bleepingcomputer',
      title: 'Critical Fortinet firewall vulnerability exploited worldwide, attackers warn',
      url: 'https://www.bleepingcomputer.com/fortinet',
      publishedAt: '2026-08-05T11:00:00.000Z',
    }),
  ]);

  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0]?.alsoCoveredBy, [
    {
      sourceId: 'bleepingcomputer',
      name: 'BleepingComputer',
      url: 'https://www.bleepingcomputer.com/fortinet',
    },
  ]);
});

test('unrelated headlines stay as two clusters', () => {
  const clusters = dedupe([
    item({
      sourceId: 'krebs',
      title: 'Attackers exploit critical Fortinet firewall vulnerability',
      url: 'https://krebsonsecurity.com/fortinet',
      publishedAt: '2026-08-05T09:00:00.000Z',
    }),
    item({
      sourceId: 'talos',
      title: 'Analysing a novel Android banking trojan campaign',
      url: 'https://blog.talosintelligence.com/android',
      publishedAt: '2026-08-05T10:00:00.000Z',
    }),
  ]);

  assert.equal(clusters.length, 2);
});

test('the earliest published item is the cluster primary', () => {
  const clusters = dedupe([
    item({
      sourceId: 'bleepingcomputer',
      title: 'Critical Fortinet firewall vulnerability exploited worldwide',
      url: 'https://www.bleepingcomputer.com/fortinet',
      publishedAt: '2026-08-05T11:00:00.000Z',
    }),
    item({
      sourceId: 'krebs',
      title: 'Critical Fortinet firewall vulnerability exploited worldwide',
      url: 'https://krebsonsecurity.com/fortinet',
      publishedAt: '2026-08-05T09:00:00.000Z',
    }),
  ]);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.sourceId, 'krebs');
});

test('alsoCoveredBy never contains the primary own source', () => {
  const clusters = dedupe([
    item({
      sourceId: 'krebs',
      title: 'Critical Fortinet firewall vulnerability exploited worldwide',
      url: 'https://krebsonsecurity.com/fortinet-a',
      publishedAt: '2026-08-05T09:00:00.000Z',
    }),
    item({
      sourceId: 'krebs',
      title: 'Critical Fortinet firewall vulnerability exploited worldwide again',
      url: 'https://krebsonsecurity.com/fortinet-b',
      publishedAt: '2026-08-05T10:00:00.000Z',
    }),
  ]);

  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0]?.alsoCoveredBy, []);
});
