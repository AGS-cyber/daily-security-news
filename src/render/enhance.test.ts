import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  AGE_GRACE_MS,
  ENHANCE_SCRIPT,
  ENHANCE_SCRIPT_HASH,
  ENHANCE_SCRIPT_TAG,
  LOGIC_SOURCE,
  nextScheduledRun,
} from './enhance.js';

/**
 * The pure half of the shipped script, exercised as the browser receives it:
 * the exact source text is evaluated in a fresh VM context (a test-only
 * harness; the page itself never evaluates strings).
 */

interface AgeResult { state: string; ageMs: number }
interface Logic {
  parseTime(value: unknown): number;
  ageState(role: string, generatedMs: number, dueMs: number, nowMs: number): AgeResult;
  formatAge(ms: unknown): string;
  queryTokens(query: unknown): string[];
  storyMatches(
    story: { text: string; source: string; priority: string },
    filter: { tokens: string[]; priority: string; source: string },
  ): boolean;
  countText(shown: number, total: number): string;
}

function loadLogic(): Logic {
  return runInNewContext(`(function () { "use strict";${LOGIC_SOURCE} return logic; })()`, {}) as Logic;
}

const logic = loadLogic();
const H = 60 * 60 * 1000;
const GEN = Date.parse('2026-08-06T12:00:00.000Z');
const DUE = Date.parse('2026-08-07T12:00:00.000Z');

test('the script is one deterministic constant whose hash is computed by Node', () => {
  const expected = `sha256-${createHash('sha256').update(ENHANCE_SCRIPT, 'utf8').digest('base64')}`;
  assert.equal(ENHANCE_SCRIPT_HASH, expected);
  assert.equal(ENHANCE_SCRIPT_TAG, `<script>${ENHANCE_SCRIPT}</script>`);
  // Loading the module twice cannot change it: nothing time- or run-dependent.
  assert.doesNotMatch(ENHANCE_SCRIPT, /\d{4}-\d{2}-\d{2}T/);
});

test('the script avoids markup writes, dynamic code, network and early tag termination', () => {
  for (const banned of [
    /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\b/,
    /new Function/, /\bFunction\(/, /setTimeout\(\s*["']/, /\bfetch\b/, /XMLHttpRequest/,
    /WebSocket/, /sendBeacon/, /EventSource/, /importScripts|import\(/, /localStorage|sessionStorage|cookie/,
    /<\/script/i, /<!--/, /`/,
  ]) {
    assert.doesNotMatch(ENHANCE_SCRIPT, banned, `script contains ${banned}`);
  }
});

test('the script is a no-op where there is no document', () => {
  assert.doesNotThrow(() => runInNewContext(ENHANCE_SCRIPT, {}));
});

test('timestamps must be strict ISO; anything else is unreadable rather than guessed', () => {
  assert.equal(logic.parseTime('2026-08-06T12:00:00.000Z'), GEN);
  assert.equal(logic.parseTime('2026-08-06T07:00:00-05:00'), GEN);
  assert.equal(logic.parseTime('2026-08-06T12:00Z'), GEN);
  for (const bad of ['', 'yesterday', 'Thu, 06 Aug 2026 12:00:00 GMT', '2026-08-06', '2026-13-45T99:99:00Z', null, undefined, 42]) {
    assert.ok(Number.isNaN(logic.parseTime(bad)), `${String(bad)} should be unreadable`);
  }
});

test('latest pages move from current to due to stale around the next scheduled run', () => {
  assert.equal(logic.ageState('latest', GEN, DUE, GEN + 3 * H).state, 'current');
  assert.equal(logic.ageState('latest', GEN, DUE, GEN + 3 * H).ageMs, 3 * H);
  assert.equal(logic.ageState('latest', GEN, DUE, DUE).state, 'due');
  assert.equal(logic.ageState('latest', GEN, DUE, DUE + AGE_GRACE_MS - 1).state, 'due');
  assert.equal(logic.ageState('latest', GEN, DUE, DUE + AGE_GRACE_MS).state, 'stale');
  assert.equal(logic.ageState('latest', GEN, DUE, DUE + 30 * 24 * H).state, 'stale');
});

test('future, invalid and missing timestamps never produce a negative or invented age', () => {
  // Generated "later" than the device clock beyond the skew allowance.
  const future = logic.ageState('latest', GEN, DUE, GEN - H);
  assert.equal(future.state, 'future');
  assert.ok(Number.isNaN(future.ageMs));
  // Within a few minutes of skew is not an error, and the age is clamped at 0.
  const skew = logic.ageState('latest', GEN, DUE, GEN - 60 * 1000);
  assert.equal(skew.state, 'current');
  assert.equal(skew.ageMs, 0);
  // A device clock days before the edition date is a clock problem.
  assert.equal(logic.ageState('archive', NaN, DUE, DUE - 3 * 24 * H).state, 'future');
  // Unreadable generation time: permalinks say so; latest still checks schedule.
  assert.equal(logic.ageState('edition', NaN, NaN, GEN).state, 'invalid');
  assert.equal(logic.ageState('latest', NaN, DUE, DUE + 5 * H).state, 'stale');
  assert.equal(logic.ageState('latest', NaN, NaN, GEN).state, 'invalid');
  assert.equal(logic.ageState('latest', GEN, DUE, NaN).state, 'invalid');
});

test('permalink pages report only their age, never staleness against the schedule', () => {
  const r = logic.ageState('edition', GEN, DUE, DUE + 400 * 24 * H);
  assert.equal(r.state, 'ok');
  assert.equal(logic.formatAge(r.ageMs), '401 days ago');
});

test('archive status depends on the next scheduled run alone', () => {
  assert.equal(logic.ageState('archive', NaN, DUE, DUE - H).state, 'current');
  assert.equal(logic.ageState('archive', NaN, DUE, DUE + AGE_GRACE_MS + 1).state, 'stale');
  assert.equal(logic.ageState('archive', NaN, NaN, DUE).state, 'invalid');
});

test('relative ages are coarse, singular-aware and empty when unknown', () => {
  assert.equal(logic.formatAge(0), 'less than a minute ago');
  assert.equal(logic.formatAge(60 * 1000), '1 minute ago');
  assert.equal(logic.formatAge(59 * 60 * 1000), '59 minutes ago');
  assert.equal(logic.formatAge(H), '1 hour ago');
  assert.equal(logic.formatAge(47 * H), '47 hours ago');
  assert.equal(logic.formatAge(48 * H), '2 days ago');
  assert.equal(logic.formatAge(NaN), '');
  assert.equal(logic.formatAge(-1), '');
  assert.equal(logic.formatAge('5'), '');
});

test('search tokens are lower-cased, whitespace-split and bounded', () => {
  assert.deepEqual([...logic.queryTokens('  Router   CVE-2026 ')], ['router', 'cve-2026']);
  assert.deepEqual([...logic.queryTokens('')], []);
  assert.deepEqual([...logic.queryTokens(null)], []);
  assert.equal(logic.queryTokens(Array.from({ length: 50 }, (_, i) => `t${i}`).join(' ')).length, 20);
});

test('priority filters escalate, KEV is exact, and unknown values filter nothing', () => {
  const story = (priority: string, source = 'krebs', text = 'router flaw') => ({ text, source, priority });
  const f = (priority: string, source = '', tokens: string[] = []) => ({ tokens, priority, source });
  const all = ['none', 'cve', 'high', 'critical', 'known_exploited'].map((p) => story(p));
  const shown = (filter: ReturnType<typeof f>) => all.filter((s) => logic.storyMatches(s, filter)).map((s) => s.priority);

  assert.deepEqual(shown(f('')), ['none', 'cve', 'high', 'critical', 'known_exploited']);
  assert.deepEqual(shown(f('cve')), ['cve', 'high', 'critical', 'known_exploited']);
  assert.deepEqual(shown(f('high')), ['high', 'critical', 'known_exploited']);
  assert.deepEqual(shown(f('critical')), ['critical', 'known_exploited']);
  assert.deepEqual(shown(f('known_exploited')), ['known_exploited']);
  assert.deepEqual(shown(f('__proto__')), shown(f('')));
  assert.deepEqual(shown(f('constructor')), shown(f('')));
  // A story with an unrecognised priority ranks as none rather than throwing.
  assert.equal(logic.storyMatches(story('bogus'), f('cve')), false);
  assert.equal(logic.storyMatches(story('bogus'), f('')), true);
});

test('source and text filters combine with priority', () => {
  const s = { text: '[01] edge router flaw krebs on security', source: 'krebs', priority: 'high' };
  assert.equal(logic.storyMatches(s, { tokens: ['router', 'krebs'], priority: '', source: '' }), true);
  assert.equal(logic.storyMatches(s, { tokens: ['router', 'printer'], priority: '', source: '' }), false);
  assert.equal(logic.storyMatches(s, { tokens: [], priority: '', source: 'talos' }), false);
  assert.equal(logic.storyMatches(s, { tokens: [], priority: 'high', source: 'krebs' }), true);
  assert.equal(logic.storyMatches(s, { tokens: [], priority: 'critical', source: 'krebs' }), false);
});

test('filter counts describe all, some, none and an empty list', () => {
  assert.equal(logic.countText(3, 3), 'Showing all 3 stories.');
  assert.equal(logic.countText(1, 1), 'Showing all 1 story.');
  assert.equal(logic.countText(2, 5), 'Showing 2 of 5 stories.');
  assert.equal(logic.countText(0, 5), 'No stories match these filters (0 of 5).');
  assert.equal(logic.countText(0, 0), 'There are no stories in this list.');
});

test('the next scheduled run is 12:00 UTC the following day, and only for real dates', () => {
  assert.equal(nextScheduledRun('2026-08-06'), '2026-08-07T12:00:00.000Z');
  assert.equal(nextScheduledRun('2026-12-31'), '2027-01-01T12:00:00.000Z');
  assert.equal(nextScheduledRun('2024-02-28'), '2024-02-29T12:00:00.000Z');
  assert.equal(nextScheduledRun('2026-02-30'), null);
  assert.equal(nextScheduledRun('0026-08-06'), null);
  assert.equal(nextScheduledRun('6 August 2026'), null);
  assert.equal(nextScheduledRun(''), null);
});
