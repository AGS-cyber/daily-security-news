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
