import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeepSeekClient, LlmResult } from '../llm/client.js';
import type { Item, Usage } from '../types.js';
import { select } from './select.js';

const USAGE: Usage = {
  model: 'deepseek-v4-pro',
  promptCacheHitTokens: 0,
  promptCacheMissTokens: 100,
  outputTokens: 20,
  estimatedCostUsd: 0,
};

function item(id: string): Item {
  return {
    id,
    sourceId: 'krebs',
    sourceKind: 'rss',
    title: `Story ${id}`,
    url: `https://a.test/${id}`,
    canonicalUrl: `https://a.test/${id}`,
    publishedAt: '2026-08-06T09:00:00.000Z',
    alsoCoveredBy: [],
  };
}

const ITEMS = [item('s1'), item('s2'), item('s3')];

/** Stubbed client — the tests never touch the network. */
function client(...responses: string[]): DeepSeekClient {
  let call = 0;
  return {
    async complete(): Promise<LlmResult> {
      const text = responses[Math.min(call, responses.length - 1)]!;
      call++;
      return { text, usage: USAGE };
    },
  };
}

function body(selections: unknown): string {
  return JSON.stringify({ selections });
}

test('a well-formed response parses to the expected selections', async () => {
  const result = await select(
    ITEMS,
    client(
      body([
        { id: 's2', section: 'exploited', rank: 1, angle: 'under attack now' },
        { id: 's1', section: 'industry', rank: 2, angle: 'sets a precedent' },
      ]),
    ),
  );

  assert.deepEqual(result.selections, [
    { id: 's2', section: 'exploited', rank: 1, angle: 'under attack now' },
    { id: 's1', section: 'industry', rank: 2, angle: 'sets a precedent' },
  ]);
  assert.equal(result.usage.model, 'deepseek-v4-pro');
});

test('rejects an id that is not in this run', async () => {
  await assert.rejects(
    select(ITEMS, client(body([{ id: 's9', section: 'research', rank: 1, angle: 'x' }]))),
    /s9/,
  );
});

test('rejects a duplicate id', async () => {
  await assert.rejects(
    select(
      ITEMS,
      client(
        body([
          { id: 's1', section: 'research', rank: 1, angle: 'x' },
          { id: 's1', section: 'breaches', rank: 2, angle: 'y' },
        ]),
      ),
    ),
    /more than once/,
  );
});

test('rejects an empty selections array — never "nothing happened today"', async () => {
  await assert.rejects(select(ITEMS, client(body([]))), /empty selections/);
});

test('rejects more than 12 selections', async () => {
  const many = Array.from({ length: 13 }, (_, i) => ({
    id: `s${i + 1}`,
    section: 'research',
    rank: i + 1,
    angle: 'x',
  }));
  const items = Array.from({ length: 13 }, (_, i) => item(`s${i + 1}`));

  await assert.rejects(select(items, client(body(many))), /more than the 12 allowed/);
});

test('rejects an invalid section', async () => {
  await assert.rejects(
    select(ITEMS, client(body([{ id: 's1', section: 'gossip', rank: 1, angle: 'x' }]))),
    /wrong shape/,
  );
});

test('rejects a response that is not JSON', async () => {
  await assert.rejects(select(ITEMS, client('I could not decide.')), /not JSON/);
});

test('retries once, and a valid second response succeeds', async () => {
  const result = await select(
    ITEMS,
    client(body([]), body([{ id: 's3', section: 'breaches', rank: 1, angle: 'x' }])),
  );

  assert.deepEqual(
    result.selections.map((s) => s.id),
    ['s3'],
  );
});
