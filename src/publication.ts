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
export async function verifyDeployment(baseUrl: string, expected: { date: string; generatedAt: string }, options: {
  fetchImpl?: typeof fetch;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  budgetMs?: number;
} = {}): Promise<void> {
  const base = httpUrl(baseUrl);
  const now = options.now ?? Date.now;
  const budget = options.budgetMs ?? 10 * 60_000;
  const attempts = options.attempts ?? 41;
  assert.ok(Number.isInteger(attempts) && attempts > 0, 'Verification attempts must be positive');
  assert.ok(Number.isFinite(budget) && budget > 0, 'Verification budget must be positive');
  const deadline = now() + budget;
  let failure: unknown;
  for (let attempt = 0; attempt < attempts && now() < deadline; attempt++) {
    async function get(path: string): Promise<Response> {
      const url = new URL(path, base);
      url.searchParams.set('verify', expected.generatedAt);
      // A cached 404 from an early poll must not poison every later poll.
      url.searchParams.set('attempt', String(attempt));
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error('Deployment verification time budget exhausted');
      const response = await (options.fetchImpl ?? fetch)(url, {
        signal: AbortSignal.timeout(Math.min(10_000, remaining)), cache: 'no-store',
      });
      assert.ok(response.ok, `Deployment ${path || '/'} returned HTTP ${response.status}`);
      return response;
    }
    try {
      const record = await (await get(`editions/${expected.date}.json`)).json();
      assertFreshPublication(record, expected.date, new Date(now()));
      assert.equal((record as Record<string, unknown>).generatedAt, expected.generatedAt, 'Deployment serves a previous generation');
      const [index, html] = await Promise.all([
        get('editions/index.json').then((response) => response.json()),
        get('').then((response) => response.text()),
      ]);
      assert.ok(Array.isArray(index) && index[0]?.date === expected.date, 'Deployment archive index is stale');
      const status = /<section\b[^>]*\bdata-age\b[^>]*>/.exec(html)?.[0] ?? '';
      assert.ok(status.includes('data-role="latest"') && status.includes(`data-generated-at="${new Date(expected.generatedAt).toISOString()}"`), 'Deployment homepage serves a previous generation');
      return;
    } catch (err) { failure = err; }
    if (attempt + 1 < attempts && now() < deadline) {
      await (options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(Math.min(15_000, deadline - now()));
    }
  }
  throw new Error(`Deployment was not confirmed within ${budget / 1000}s: ${failure instanceof Error ? failure.message : String(failure)}`, { cause: failure });
}
