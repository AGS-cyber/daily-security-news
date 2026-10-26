import { createHash } from 'node:crypto';

/**
 * The one script the site ships: dependency-free progressive enhancement.
 *
 * Every page is complete without it. It only (a) turns absolute generation
 * times into a live "N hours ago" and picks which *server-rendered* status
 * sentence is visible, and (b) shows and runs the story filters, which are
 * `hidden` in the markup so a reader without JavaScript never meets a dead
 * control.
 *
 * Rules it keeps, because the CSP is a hash rather than `unsafe-inline`:
 *
 * - It is a constant. Nothing from an edition is interpolated into it; it
 *   reads `data-*` attributes and `textContent` from the escaped document, so
 *   the hash is the same on every page and every run.
 * - It never writes markup: only `textContent`, `hidden` and attributes.
 * - It never fetches, evaluates strings, or registers inline handlers.
 * - The sentences it reveals were rendered and escaped by Node; it composes
 *   only the relative age and the filter count itself.
 *
 * `LOGIC_SOURCE` is exported separately so tests can exercise the pure
 * functions shipped to the browser, not a TypeScript twin of them.
 */

/** Editions are scheduled for this UTC hour on their own date. */
export const SCHEDULE_UTC_HOUR = 12;
/** How long after the next scheduled run a page is "due" before "stale". */
export const AGE_GRACE_MS = 2 * 60 * 60 * 1000;
/** Clock disagreement tolerated before a timestamp counts as "future". */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** How often an open, visible tab re-evaluates its age. */
export const AGE_REFRESH_MS = 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure functions. Defines `logic` in the enclosing function scope. Written as
 * ES5 so it runs in old mobile browsers too, and kept free of backticks so it
 * can live in this template.
 */
export const LOGIC_SOURCE = String.raw`
var ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
var GRACE = ${AGE_GRACE_MS};
var SKEW = ${CLOCK_SKEW_MS};
var DAY = ${DAY_MS};
var RANK = { none: 0, cve: 1, high: 2, critical: 3, known_exploited: 4 };
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function parseTime(value) {
  if (typeof value !== "string" || !ISO.test(value)) return NaN;
  var ms = Date.parse(value);
  return isFinite(ms) ? ms : NaN;
}
function result(state, ageMs) { return { state: state, ageMs: ageMs }; }
function ageState(role, generatedMs, dueMs, nowMs) {
  var hasGen = isFinite(generatedMs);
  var hasDue = role !== "edition" && isFinite(dueMs);
  if (!isFinite(nowMs)) return result("invalid", NaN);
  if (hasGen && generatedMs - nowMs > SKEW) return result("future", NaN);
  if (hasDue && dueMs - nowMs > 1.5 * DAY) return result("future", NaN);
  var age = hasGen ? Math.max(0, nowMs - generatedMs) : NaN;
  if (!hasDue) return result(hasGen ? "ok" : "invalid", age);
  if (nowMs < dueMs) return result("current", age);
  if (nowMs < dueMs + GRACE) return result("due", age);
  return result("stale", age);
}
function plural(n, unit) { return n + " " + unit + (n === 1 ? "" : "s"); }
function formatAge(ms) {
  if (typeof ms !== "number" || !isFinite(ms) || ms < 0) return "";
  var minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return plural(minutes, "minute") + " ago";
  var hours = Math.floor(minutes / 60);
  if (hours < 48) return plural(hours, "hour") + " ago";
  return plural(Math.floor(hours / 24), "day") + " ago";
}
function queryTokens(query) {
  var parts = String(query == null ? "" : query).toLowerCase().split(/\s+/);
  var out = [];
  for (var i = 0; i < parts.length && out.length < 20; i++) if (parts[i]) out.push(parts[i]);
  return out;
}
function storyMatches(story, filter) {
  var want = filter.priority || "";
  if (want && own(RANK, want)) {
    var have = own(RANK, story.priority) ? RANK[story.priority] : 0;
    if (want === "known_exploited" ? story.priority !== "known_exploited" : have < RANK[want]) return false;
  }
  if (filter.source && story.source !== filter.source) return false;
  for (var i = 0; i < filter.tokens.length; i++) {
    if (story.text.indexOf(filter.tokens[i]) === -1) return false;
  }
  return true;
}
function countText(shown, total) {
  var noun = total === 1 ? " story." : " stories.";
  if (total === 0) return "There are no stories in this list.";
  if (shown === total) return "Showing all " + total + noun;
  if (shown === 0) return "No stories match these filters (0 of " + total + ").";
  return "Showing " + shown + " of " + total + noun;
}
var logic = {
  parseTime: parseTime, ageState: ageState, formatAge: formatAge,
  queryTokens: queryTokens, storyMatches: storyMatches, countText: countText
};
`;

/** DOM binding. Runs after `LOGIC_SOURCE` inside the same function. */
const DOM_SOURCE = String.raw`
if (typeof document === "undefined" || !document.querySelectorAll) return;
var ages = [];
var filters = [];
function each(list, fn) { for (var i = 0; i < list.length; i++) fn(list[i]); }
function show(el, on) { if (el && el.hidden === on) el.hidden = !on; }
function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function refreshAges() {
  var now = Date.now();
  each(ages, function (box) {
    var r = logic.ageState(
      box.getAttribute("data-role") || "edition",
      logic.parseTime(box.getAttribute("data-generated-at")),
      logic.parseTime(box.getAttribute("data-next-due")),
      now
    );
    if (box.getAttribute("data-state") !== r.state) box.setAttribute("data-state", r.state);
    var text = logic.formatAge(r.ageMs);
    each(box.querySelectorAll("[data-age-text]"), function (el) { setText(el, text); });
    each(box.querySelectorAll("[data-age-out]"), function (el) { show(el, text !== ""); });
    each(box.querySelectorAll("[data-age-when]"), function (el) {
      show(el, el.getAttribute("data-age-when") === r.state);
    });
  });
}
function bindFilters(box) {
  var list = document.getElementById(box.getAttribute("data-filter-target") || "");
  if (!list) return;
  var q = box.querySelector('[data-filter="q"]');
  var priority = box.querySelector('[data-filter="priority"]');
  var source = box.querySelector('[data-filter="source"]');
  var reset = box.querySelector("[data-filter-reset]");
  var count = box.querySelector("[data-filter-count]");
  var empty = box.querySelector("[data-filter-empty]");
  var stories = [];
  each(list.querySelectorAll("li[data-story]"), function (el) {
    stories.push({
      el: el,
      text: String(el.textContent || "").toLowerCase(),
      source: el.getAttribute("data-source") || "",
      priority: el.getAttribute("data-priority") || "none"
    });
  });
  function value(el) { return el ? String(el.value || "") : ""; }
  function apply() {
    var f = { tokens: logic.queryTokens(value(q)), priority: value(priority), source: value(source) };
    var shown = 0;
    each(stories, function (s) {
      var ok = logic.storyMatches(s, f);
      if (ok) shown++;
      show(s.el, ok);
    });
    setText(count, logic.countText(shown, stories.length));
    show(empty, shown === 0 && stories.length > 0);
    var active = f.tokens.length > 0 || f.priority !== "" || f.source !== "";
    box.setAttribute("data-active", active ? "true" : "false");
  }
  if (q) q.addEventListener("input", apply);
  each([priority, source], function (el) {
    if (!el) return;
    el.addEventListener("change", apply);
    el.addEventListener("input", apply);
  });
  if (reset) reset.addEventListener("click", function () {
    if (q) q.value = "";
    if (priority) priority.value = "";
    if (source) source.value = "";
    apply();
  });
  filters.push(apply);
  box.hidden = false;
  apply();
}
each(document.querySelectorAll("[data-age]"), function (el) { ages.push(el); });
each(document.querySelectorAll("[data-filters]"), bindFilters);
refreshAges();
function resume() {
  refreshAges();
  each(filters, function (apply) { apply(); });
}
document.addEventListener("visibilitychange", function () { if (!document.hidden) resume(); });
window.addEventListener("pageshow", resume);
window.addEventListener("focus", refreshAges);
if (ages.length) setInterval(function () { if (!document.hidden) refreshAges(); }, ${AGE_REFRESH_MS});
`;

/** The exact text placed between `<script>` and `</script>`. */
export const ENHANCE_SCRIPT = `(function () {\n"use strict";${LOGIC_SOURCE}${DOM_SOURCE}})();`;

/** CSP source expression for `ENHANCE_SCRIPT`, computed by Node at load. */
export const ENHANCE_SCRIPT_HASH = `sha256-${createHash('sha256')
  .update(ENHANCE_SCRIPT, 'utf8')
  .digest('base64')}`;

export const ENHANCE_SCRIPT_TAG = `<script>${ENHANCE_SCRIPT}</script>`;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The next scheduled run after the edition dated [date]: 12:00 UTC on the
 * following day, as ISO. null when the date is not a real calendar day.
 */
export function nextScheduledRun(date: string): string | null {
  const parts = DATE.exec(date);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const base = Date.UTC(year, month - 1, day);
  const check = new Date(base);
  if (
    year < 1000
    || check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) {
    return null;
  }
  return new Date(base + DAY_MS + SCHEDULE_UTC_HOUR * 60 * 60 * 1000).toISOString();
}

/** Priority filter options, in the order a reader escalates through them. */
export const PRIORITY_FILTERS: [value: string, label: string][] = [
  ['', 'All stories'],
  ['cve', 'Mentions any CVE'],
  ['high', 'High, Critical or CISA KEV'],
  ['critical', 'Critical or CISA KEV'],
  ['known_exploited', 'CISA KEV (known exploited)'],
];
