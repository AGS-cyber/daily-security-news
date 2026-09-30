import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RawItem } from '../types.js';
import { canonicalize, normalize, normalizationNotices } from './normalize.js';

test('strips tracking params but keeps meaningful ones', () => {
  assert.equal(
    canonicalize('https://example.com/post?id=7&utm_source=x&utm_medium=y&fbclid=z'),
    'https://example.com/post?id=7',
  );
});

test('strips the fragment', () => {
  assert.equal(canonicalize('https://example.com/post#section-2'), 'https://example.com/post');
});

test('lowercases the host and drops www.', () => {
  assert.equal(canonicalize('https://WWW.Example.COM/post'), 'https://example.com/post');
});

test('upgrades http: to https:', () => {
  assert.equal(canonicalize('http://example.com/post'), 'https://example.com/post');
});

test('strips a trailing slash but leaves the root path alone', () => {
  assert.equal(canonicalize('https://example.com/post/'), 'https://example.com/post');
  assert.equal(canonicalize('https://example.com/'), 'https://example.com/');
});

test('strips a trailing /amp/', () => {
  assert.equal(canonicalize('https://example.com/post/amp/'), 'https://example.com/post');
  assert.equal(canonicalize('https://example.com/post/amp'), 'https://example.com/post');
});

test('two URLs differing only in tracking params canonicalize equal', () => {
  assert.equal(
    canonicalize('https://example.com/post?utm_campaign=a&ref=twitter'),
    canonicalize('https://example.com/post?gclid=b'),
  );
});

test('throws on unparseable input', () => {
  assert.throws(() => canonicalize('not a url'));
});

const NOW = new Date('2026-09-29T17:29:47.241Z');
function raw(over: Partial<RawItem> = {}): RawItem {
 return {sourceId: 'darkreading', sourceKind: 'rss', title: 'Security news',
 url: 'https://example.test/story', publishedAt: NOW.toISOString(), ...over};
}
test('230 collected items yield 229 news items and one expected future event with provenance', () => {
 const future = raw({title: '[Virtual Event] Cybersecurity Outlook 2027',
 url: 'https://www.darkreading.com/events/virtual-event-cybersecurity-outlook-2027',
 publishedAt: '2026-12-03T16:00:00.000Z'});
 const result = normalize([...Array.from({length:229}, (_, i) => raw({url:`https://example.test/${i}`})), future], NOW);
 assert.equal(result.items.length, 229);
 assert.equal(result.dropped, 1);
 assert.deepEqual(normalizationNotices(result.exclusions), []);
 assert.deepEqual(result.exclusions, [{sourceId: future.sourceId, title: future.title, url: future.url,
 publishedAt: future.publishedAt, reason: 'future_event', observedAt: NOW.toISOString()}]);
});
test('invalid URLs, malformed dates and ambiguous future dates are data-quality failures', () => {
 const result = normalize([raw({url:'javascript:alert(1)'}), raw({publishedAt:''}),
 raw({publishedAt:'2026-12-03T16:00:00Z'}), raw({title:'Webinar security breach', publishedAt:'2026-12-03T16:00:00Z'})], NOW);
 assert.deepEqual(result.exclusions.map((item) => item.reason), ['invalid_url','invalid_date','future_timestamp','future_timestamp']);
 assert.match(normalizationNotices(result.exclusions)[0]!.message, /4 collected items were excluded: 1 with invalid or disallowed URL; 1 with invalid publication date; 2 with unexplained publication date/);
});
test('future-date boundary is deterministic and retains the two-day policy', () => {
 const date = (delta:number) => new Date(NOW.getTime()+delta).toISOString();
 const result = normalize([raw({publishedAt:date(2*86400000)}), raw({publishedAt:date(2*86400000+1)})],NOW);
 assert.equal(result.items.length,1);
 assert.equal(result.exclusions[0]?.reason,'future_timestamp');
});