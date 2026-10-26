import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { DigestEdition, Item } from '../types.js';
import { vulnerability } from '../test-helpers.js';
import { ENHANCE_SCRIPT } from './enhance.js';
import { archivePage, digestPage } from './html.js';

/**
 * Runs the shipped script against the renderer's real output, parsed into a
 * deliberately tiny DOM. It supports only what the script may use — simple
 * `tag[attr="value"]` selectors, attributes, `hidden`, `textContent`,
 * `value` and listeners — so the script reaching for anything else (for
 * instance `innerHTML`) fails here rather than in a browser.
 */

type Listener = () => void;

class Listeners {
  private map = new Map<string, Listener[]>();
  addEventListener(type: string, fn: Listener): void {
    this.map.set(type, [...(this.map.get(type) ?? []), fn]);
  }
  fire(type: string): void {
    for (const fn of this.map.get(type) ?? []) fn();
  }
}

class Text {
  data: string;
  constructor(data: string) { this.data = data; }
}

class El extends Listeners {
  tag: string;
  attrs = new Map<string, string>();
  children: (El | Text)[] = [];
  value = '';
  writes = 0;
  constructor(tag: string) {
    super();
    this.tag = tag;
  }
  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attrs.set(name, String(value)); }
  get hidden(): boolean { return this.attrs.has('hidden'); }
  set hidden(on: boolean) {
    this.writes += 1;
    if (on) this.attrs.set('hidden', '');
    else this.attrs.delete('hidden');
  }
  get textContent(): string {
    return this.children.map((c) => (c instanceof Text ? c.data : c.textContent)).join('');
  }
  set textContent(value: string) {
    this.writes += 1;
    this.children = [new Text(String(value))];
  }
  descendants(): El[] {
    return this.children.flatMap((c) => (c instanceof El ? [c, ...c.descendants()] : []));
  }
  querySelectorAll(selector: string): El[] {
    const match = compile(selector);
    return this.descendants().filter(match);
  }
  querySelector(selector: string): El | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  focus(): void {}
}

function compile(selector: string): (el: El) => boolean {
  const m = /^([a-z]+)?((?:\[[a-z-]+(?:="[^"]*")?\])*)$/.exec(selector);
  if (!m) throw new Error(`unsupported selector in script: ${selector}`);
  const tag = m[1];
  const conds = [...(m[2] ?? '').matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)].map((c) => [c[1]!, c[2]] as const);
  return (el) => (!tag || el.tag === tag)
    && conds.every(([name, value]) => (value === undefined ? el.attrs.has(name) : el.attrs.get(name) === value));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", middot: '·' };

function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|middot);/g, (all, e: string) => ENTITIES[e] ?? all);
}

const VOID = new Set(['meta', 'link', 'input', 'br', 'hr', 'img']);

/** Parses this renderer's own well-formed output; not a general HTML parser. */
function parse(html: string): El {
  const root = new El('#root');
  const stack: El[] = [root];
  const token = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>|([^<]+)/gi;
  let t: RegExpExecArray | null;
  while ((t = token.exec(html))) {
    const top = stack.at(-1)!;
    if (t[1]) {
      const name = t[1].toLowerCase();
      while (stack.length > 1 && stack.pop()!.tag !== name) { /* unwind */ }
    } else if (t[2]) {
      const el = new El(t[2].toLowerCase());
      for (const a of (t[3] ?? '').matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) el.attrs.set(a[1]!, decode(a[2] ?? ''));
      if (el.attrs.has('value')) el.value = el.attrs.get('value')!;
      top.children.push(el);
      if (el.tag === 'script' || el.tag === 'style') {
        const end = html.indexOf(`</${el.tag}>`, token.lastIndex);
        el.children.push(new Text(html.slice(token.lastIndex, end)));
        token.lastIndex = end + el.tag.length + 3;
      } else if (!VOID.has(el.tag)) {
        stack.push(el);
      }
    } else if (t[4]) {
      top.children.push(new Text(decode(t[4])));
    }
  }
  return root;
}

interface Page {
  root: El;
  doc: Listeners & { hidden: boolean };
  win: Listeners;
  clock: { now: number };
  ticks: Listener[];
  $: (selector: string) => El;
  $$: (selector: string) => El[];
}

/** Parse a page; run its script only if [run]. */
function load(html: string, now: string, run = true): Page {
  const root = parse(html);
  const clock = { now: Date.parse(now) };
  const ticks: Listener[] = [];
  const doc = Object.assign(new Listeners(), {
    hidden: false,
    querySelectorAll: (s: string) => root.querySelectorAll(s),
    getElementById: (id: string) => root.descendants().find((el) => el.attrs.get('id') === id) ?? null,
  });
  const win = new Listeners();
  const $ = (s: string) => {
    const el = root.querySelector(s);
    assert.ok(el, `missing ${s}`);
    return el;
  };
  const page = { root, doc, win, clock, ticks, $, $$: (s: string) => root.querySelectorAll(s) };
  if (run) {
    const script = $('script').textContent;
    assert.equal(script, ENHANCE_SCRIPT, 'the page carries the constant script verbatim');
    runInNewContext(script, {
      document: doc,
      window: win,
      Date: { now: () => clock.now, parse: Date.parse },
      setInterval: (fn: Listener) => { ticks.push(fn); return ticks.length; },
    });
  }
  return page;
}

function story(id: string, title: string, sourceId: string, cves: Item['cves'] = []): Item {
  return {
    id, sourceId, sourceKind: 'rss', title,
    url: `https://example.test/${id}`, canonicalUrl: `https://example.test/${id}`,
    publishedAt: '2026-08-06T09:00:00.000Z', alsoCoveredBy: [], cves,
  };
}

function digest(over: Partial<DigestEdition> = {}): DigestEdition {
  return {
    date: '2026-08-06',
    generatedAt: '2026-08-06T12:00:00.000Z',
    mode: 'digest',
    items: [
      story('s1', 'Edge router exploited', 'krebs', [vulnerability('CVE-2026-0001')]),
      story('s2', 'Printer driver bug', 'talos', [vulnerability('CVE-2026-0002', { knownExploited: false, score: 7.5, severity: 'HIGH' })]),
      story('s3', 'Phishing kit returns', 'krebs'),
    ],
    degraded: [],
    stats: { sourcesConfigured: 12, sourcesOk: 12, collected: 3, normalized: 3, deduped: 3, published: 3 },
    ...over,
  };
}

const visible = (p: Page) => p.$$('li[data-story]').filter((li) => !li.hidden).map((li) => li.attrs.get('id'));
const shownState = (p: Page) => p.$$('[data-age-when]').filter((el) => !el.hidden).map((el) => el.attrs.get('data-age-when'));

test('without the script every story is readable and no dead control is shown', () => {
  const p = load(digestPage(digest(), { role: 'latest' }), '2026-08-06T15:00:00.000Z', false);
  assert.deepEqual(visible(p), ['s1', 's2', 's3']);
  assert.equal(p.$('[data-filters]').hidden, true, 'filters stay hidden without JS');
  assert.deepEqual(shownState(p), ['nojs'], 'only the no-JS sentence is visible');
  assert.equal(p.$('[data-age-out]').hidden, true);
});

test('filters bind from data attributes, handle zero matches, switching and reset', () => {
  const p = load(digestPage(digest(), { role: 'latest' }), '2026-08-06T15:00:00.000Z');
  const box = p.$('[data-filters]');
  const q = p.$('[data-filter="q"]');
  const priority = p.$('[data-filter="priority"]');
  const source = p.$('[data-filter="source"]');
  const count = p.$('[data-filter-count]');
  const empty = p.$('[data-filter-empty]');
  assert.equal(box.hidden, false);
  assert.equal(count.textContent, 'Showing all 3 stories.');

  q.value = 'ROUTER';
  q.fire('input');
  assert.deepEqual(visible(p), ['s1']);
  assert.equal(count.textContent, 'Showing 1 of 3 stories.');
  assert.equal(box.attrs.get('data-active'), 'true');

  q.value = 'no such words';
  q.fire('input');
  assert.deepEqual(visible(p), []);
  assert.equal(empty.hidden, false, 'zero matches explain themselves');
  assert.equal(count.textContent, 'No stories match these filters (0 of 3).');

  q.value = '';
  q.fire('input');
  for (const [value, expected] of [
    ['known_exploited', ['s1']], ['high', ['s1', 's2']], ['cve', ['s1', 's2']], ['', ['s1', 's2', 's3']], ['known_exploited', ['s1']],
  ] as const) {
    priority.value = value;
    priority.fire('change');
    assert.deepEqual(visible(p), [...expected], `priority ${value || 'all'}`);
  }
  assert.equal(empty.hidden, true);

  source.value = 'talos';
  source.fire('change');
  assert.deepEqual(visible(p), [], 'KEV and Cisco Talos together match nothing');
  assert.equal(empty.hidden, false);

  p.$('[data-filter-reset]').fire('click');
  assert.deepEqual(visible(p), ['s1', 's2', 's3']);
  assert.equal(q.value + priority.value + source.value, '');
  assert.equal(empty.hidden, true);
  assert.equal(count.textContent, 'Showing all 3 stories.');
  assert.equal(box.attrs.get('data-active'), 'false');
});

test('restored form values are re-applied when the page is shown again', () => {
  const p = load(digestPage(digest(), { role: 'latest' }), '2026-08-06T15:00:00.000Z');
  // A back/forward cache restore can bring values back without input events.
  p.$('[data-filter="source"]').value = 'talos';
  p.win.fire('pageshow');
  assert.deepEqual(visible(p), ['s2']);
});

test('the latest page age updates on resume, focus and the interval, not just at load', () => {
  const p = load(digestPage(digest(), { role: 'latest' }), '2026-08-06T15:00:00.000Z');
  const status = p.$('[data-age]');
  const age = p.$('[data-age-text]');
  assert.equal(status.attrs.get('data-state'), 'current');
  assert.deepEqual(shownState(p), ['current']);
  assert.equal(age.textContent, '3 hours ago');
  assert.equal(p.$('[data-age-out]').hidden, false);

  // The tab sleeps in the background past the next scheduled run.
  p.doc.hidden = true;
  p.clock.now = Date.parse('2026-08-07T13:00:00.000Z');
  p.ticks.forEach((tick) => tick());
  assert.equal(status.attrs.get('data-state'), 'current', 'hidden tabs do not churn');
  p.doc.hidden = false;
  p.doc.fire('visibilitychange');
  assert.equal(status.attrs.get('data-state'), 'due');
  assert.equal(age.textContent, '25 hours ago');

  p.clock.now = Date.parse('2026-08-09T12:00:00.000Z');
  p.win.fire('focus');
  assert.equal(status.attrs.get('data-state'), 'stale');
  assert.deepEqual(shownState(p), ['stale']);
  assert.match(p.$('[data-age-when="stale"]').textContent, /may be out of date/);
  assert.equal(age.textContent, '3 days ago');

  p.clock.now = Date.parse('2026-08-12T12:00:00.000Z');
  p.ticks.forEach((tick) => tick());
  assert.equal(age.textContent, '6 days ago');
});

test('unchanged status is not rewritten, so the live region does not chatter', () => {
  const p = load(digestPage(digest(), { role: 'latest' }), '2026-08-06T15:00:00.000Z');
  const current = p.$('[data-age-when="current"]');
  const writes = current.writes;
  p.clock.now += 60 * 1000;
  p.ticks.forEach((tick) => tick());
  p.win.fire('focus');
  assert.equal(current.writes, writes);
});

test('a generation time ahead of the device clock is reported, not shown as a negative age', () => {
  const p = load(digestPage(digest(), { role: 'latest' }), '2026-08-05T09:00:00.000Z');
  assert.equal(p.$('[data-age]').attrs.get('data-state'), 'future');
  assert.deepEqual(shownState(p), ['future']);
  assert.equal(p.$('[data-age-out]').hidden, true);
});

test('an unreadable generation time says so on a permalink page', () => {
  const p = load(digestPage(digest({ generatedAt: 'not a time' })), '2026-08-06T15:00:00.000Z');
  assert.equal(p.$('[data-age]').attrs.get('data-state'), 'invalid');
  assert.deepEqual(shownState(p), ['invalid']);
});

test('a permalink page shows its age but never a staleness warning', () => {
  const p = load(digestPage(digest()), '2027-01-01T00:00:00.000Z');
  assert.equal(p.$('[data-age]').attrs.get('data-state'), 'ok');
  assert.deepEqual(shownState(p), []);
  assert.equal(p.$('[data-age-text]').textContent, '147 days ago');
});

test('the archive warns when nothing newer than its newest day has appeared', () => {
  const html = archivePage([{ date: '2026-08-06', mode: 'digest', count: 3 }], { builtAt: '2026-08-06T12:01:00.000Z' });
  assert.equal(load(html, '2026-08-07T09:00:00.000Z').$('[data-age]').attrs.get('data-state'), 'current');
  const late = load(html, '2026-08-08T09:00:00.000Z');
  assert.equal(late.$('[data-age]').attrs.get('data-state'), 'stale');
  assert.deepEqual(shownState(late), ['stale']);
});

test('a single-story list has no filter controls and the script tolerates their absence', () => {
  const p = load(digestPage(digest({ items: [story('s1', 'Only story', 'krebs')] })), '2026-08-06T15:00:00.000Z');
  assert.equal(p.$$('[data-filters]').length, 0);
  assert.deepEqual(visible(p), ['s1']);
});
