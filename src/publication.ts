import assert from 'node:assert/strict';
import { httpUrl } from './url.js';
export function assertFreshPublication(record: unknown, expectedDate: string, now: Date): void {
 assert.ok(typeof record === 'object' && record !== null, 'Missing edition');
 const edition = record as Record<string, unknown>;
 assert.equal(edition.date, expectedDate, 'Published edition date does not match');
 const generated = Date.parse(String(edition.generatedAt));
 assert.ok(Number.isFinite(generated) && generated <= now.getTime() + 60_000 && now.getTime() - generated <= 36 * 60 * 60 * 1000, 'Published edition is stale or has an invalid timestamp');
 assert.ok(edition.mode === 'article' || edition.mode === 'digest', 'Invalid publication mode');
}
export async function verifyDeployment(baseUrl: string, expected: {date: string; generatedAt: string}, options: {fetchImpl?: typeof fetch; attempts?: number; sleep?: (ms: number) => Promise<void>} = {}): Promise<void> {
 const base = httpUrl(baseUrl);
 let failure: unknown;
 for (let attempt = 0; attempt < (options.attempts ?? 12); attempt++) {
  try {
   const response = await (options.fetchImpl ?? fetch)(new URL(`editions/${expected.date}.json?verify=${encodeURIComponent(expected.generatedAt)}`, base), {signal: AbortSignal.timeout(10_000), cache: 'no-store'});
   assert.ok(response.ok, `Deployment returned HTTP ${response.status}`);
   const record = await response.json();
   assertFreshPublication(record, expected.date, new Date());
   assert.equal((record as Record<string, unknown>).generatedAt, expected.generatedAt, 'Deployment serves a previous generation');
   return;
  } catch (err) { failure = err; }
  if (attempt + 1 < (options.attempts ?? 12)) await (options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(15_000);
 }
 throw failure;
}
