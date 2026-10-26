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

test('distinct posts from the same publisher remain separate even with similar titles', () => {
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

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters[0]?.alsoCoveredBy, []);
});

function advisory(sourceId: string, cve: string, hours = 0): NormalizedItem {
  return item({ sourceId, title: `Vendor patches critical remote execution vulnerability ${cve}`,
    url: `https://${sourceId}.test/${hours}/${cve || 'report'}`,
    publishedAt: new Date(Date.parse('2026-08-05T09:00:00Z') + hours * 3_600_000).toISOString() });
}

test('similar headlines referring to distinct CVEs are not conflated', () => {
  const a = advisory('one', 'CVE-2026-11111');
  const b = advisory('two', 'CVE-2026-22222', 1);
  assert.equal(dedupe([a, b]).length, 2);
  const mentionedInExcerpt = { ...b, title: a.title.replace('CVE-2026-11111', ''), excerpt: 'Tracked as CVE-2026-22222.' };
  assert.equal(dedupe([a, mentionedInExcerpt]).length, 2);
});

test('matching CVE evidence still requires related titles and recent cross-source reporting', () => {
  const a = advisory('one', 'CVE-2026-11111');
  const b = advisory('two', 'cve\u20112026\u201111111', 1);
  assert.equal(dedupe([a, b]).length, 1);
  assert.equal(dedupe([a, { ...b, title: 'Incident response lessons and forensic timeline' }]).length, 2);
  assert.equal(dedupe([a, advisory('three', 'CVE-2026-11111', 49)]).length, 2);
});

test('missing-CVE and multi-CVE bridge reports cannot merge incompatible advisories', () => {
  const a = advisory('one', 'CVE-2026-11111');
  const c = advisory('three', 'CVE-2026-22222', 2);
  for (const ids of ['', 'CVE-2026-11111 CVE-2026-22222']) {
    const b = advisory('two', ids, 1);
    const forward = dedupe([a, b, c]);
    assert.equal(forward.length, 2);
    assert.ok(forward.every(cluster => !(cluster.members.includes(a) && cluster.members.includes(c))));
    assert.deepEqual(dedupe([c, b, a]), forward, 'source completion/input order must not change clustering');
  }
});

test('exact URL identity retains all provenance even when reports mention different CVEs or dates', () => {
  const a = advisory('one', 'CVE-2026-11111');
  const b = { ...advisory('two', 'CVE-2026-22222', 72), canonicalUrl: a.canonicalUrl };
  const result = dedupe([b, a]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.members, [a, b]);
  assert.equal(result[0]?.alsoCoveredBy[0]?.url, b.url);
});
