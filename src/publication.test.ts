import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertFreshPublication, verifyDeployment } from './publication.js';
import { canonicalize } from './pipeline/normalize.js';
test('rejects executable, local and credential-bearing article URLs', () => {
 for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/a', 'https://user:pass@example.com/']) assert.throws(() => canonicalize(url), /HTTP/);
});
test('freshness rejects old, wrong-day and future editions', () => {
 const now = new Date('2026-09-30T12:00:00Z');
 assertFreshPublication({date: '2026-09-30', generatedAt: now.toISOString(), mode: 'digest'}, '2026-09-30', now);
 for (const generatedAt of ['2026-08-18T12:00:00Z', '2026-10-01T12:00:00Z', 'invalid']) assert.throws(() => assertFreshPublication({date: '2026-09-30', generatedAt, mode: 'digest'}, '2026-09-30', now));
 assert.throws(() => assertFreshPublication({date: '2026-08-18'}, '2026-09-30', now));
});
test('deployment verification fails after bounded attempts and detects a prior generation', async () => {
 let calls = 0;
 const date = new Date().toISOString().slice(0, 10);
 await assert.rejects(verifyDeployment('https://example.test/', {date, generatedAt: new Date().toISOString()}, {attempts: 2, sleep: async () => {}, fetchImpl: async () => { calls++; return Response.json({date, mode: 'digest', generatedAt: new Date(Date.now()-1000).toISOString()}); }}), /previous generation/);
 assert.equal(calls, 2);
});

test('October 21 regression: a deployment taking nine minutes can recover within the bounded polling budget', async () => {
  const started = Date.now();
  let clock = started;
  const expected = { date: new Date(started).toISOString().slice(0, 10), generatedAt: new Date(started).toISOString() };
  const requests: string[] = [];
  await verifyDeployment('https://example.test/', expected, {
    now: () => clock, sleep: async (ms) => { clock += ms; },
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      requests.push(url.href);
      if (clock - started < 9 * 60_000) return new Response('', { status: 404 });
      if (url.pathname === '/editions/index.json') return Response.json([{ date: expected.date }]);
      if (url.pathname === '/') return new Response(`<section data-age data-role="latest" data-generated-at="${expected.generatedAt}">`);
      return Response.json({ ...expected, mode: 'article' });
    },
  });
  assert.equal(clock - started, 9 * 60_000);
  assert.notEqual(requests[0], requests[1]);
});

test('a fresh dated record cannot conceal a stale homepage or app archive index', async () => {
  const expected = { date: new Date().toISOString().slice(0, 10), generatedAt: new Date().toISOString() };
  for (const stale of ['homepage', 'index']) {
    await assert.rejects(verifyDeployment('https://example.test/', expected, { attempts: 1, fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/editions/index.json') return Response.json([{ date: stale === 'index' ? '2020-01-01' : expected.date }]);
      if (url.pathname === '/') return new Response('<section data-age data-role="latest" data-generated-at="2020-01-01T12:00:00.000Z">');
      return Response.json({ ...expected, mode: 'article' });
    } }), stale === 'index' ? /archive index is stale/ : /homepage serves a previous generation/);
  }
});

test('a persistent deployment failure stops at its wall-clock budget', async () => {
  let clock = Date.now();
  const start = clock;
  let calls = 0;
  const expected = { date: new Date(clock).toISOString().slice(0, 10), generatedAt: new Date(clock).toISOString() };
  await assert.rejects(verifyDeployment('https://example.test/', expected, {
    budgetMs: 20_000, now: () => clock, sleep: async (ms) => { clock += ms; },
    fetchImpl: async () => { calls++; return new Response('', { status: 404 }); },
  }), /not confirmed within 20s/);
  assert.equal(calls, 2);
  assert.equal(clock - start, 20_000);
});
