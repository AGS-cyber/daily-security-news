import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from './client.js';

/**
 * Guards the distinction that cost a run on 2026-08-06: a secret can exist and
 * still be unusable. `gh secret set` reads its value from a paste that echoes
 * nothing, so an empty DEEPSEEK_API_KEY is easy to create and invisible
 * afterwards — `gh secret list` proves only that the secret exists. Reporting
 * that as "is not set" sent the search to the workflow file instead of the
 * stored value. See operations.md §5.
 */

function withKey<T>(value: string | undefined, fn: () => T): T {
  const before = process.env['DEEPSEEK_API_KEY'];
  if (value === undefined) delete process.env['DEEPSEEK_API_KEY'];
  else process.env['DEEPSEEK_API_KEY'] = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env['DEEPSEEK_API_KEY'];
    else process.env['DEEPSEEK_API_KEY'] = before;
  }
}

test('an absent key reports as unset', () => {
  const result = withKey(undefined, createClient);
  if (result.ok) assert.fail('expected no client without a key');
  assert.match(result.reason, /is not set/);
});

test('an empty key reports as empty, never as unset', () => {
  const result = withKey('', createClient);
  if (result.ok) assert.fail('expected no client from an empty key');
  assert.match(result.reason, /set but its value is empty/);
  // The whole point: these two must not read the same.
  assert.doesNotMatch(result.reason, /is not set/);
});

test('a whitespace-only key counts as empty', () => {
  const result = withKey('  \n\t ', createClient);
  if (result.ok) assert.fail('expected no client from a blank key');
  assert.match(result.reason, /set but its value is empty/);
});

test('a present key produces a usable client', () => {
  const result = withKey('sk-not-a-real-key', createClient);
  if (!result.ok) assert.fail(`expected a client, got: ${result.reason}`);
  assert.equal(typeof result.client.complete, 'function');
});

test('the key is read at construction, not captured at import', () => {
  // The run sets the variable before calling createClient; a module-level read
  // would make the value at import time win and quietly ignore the real key.
  const first = withKey(undefined, createClient);
  const second = withKey('sk-not-a-real-key', createClient);
  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
});
