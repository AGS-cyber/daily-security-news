import { Marked } from 'marked';
import { httpUrl } from '../url.js';
const marked = new Marked({ renderer: {
 html({ text }) { return escapeHtml(text); },
 link({ href, tokens }) { const text = this.parser.parseInline(tokens); try { return `<a href="${escapeHtml(httpUrl(href))}">${text}</a>`; } catch { return text; } },
 image({ text }) { return escapeHtml(text); },
} });
import type { ArticleEdition, DegradedNotice, DigestEdition, Edition, Item, NormalizationExclusion } from '../types.js';
import { VULNERABILITY_CACHE_TTL_MS } from '../config/vulnerability.js';
import { vulnerabilityPriority } from '../vulnerability/priority.js';
import {
  calendarMonths,
  type ArchiveEntry,
  type CalendarDay,
  type CalendarMonth,
} from './calendar.js';
import { substituteCitations } from './citations.js';
import { CLOCK_SKEW_MS, ENHANCE_SCRIPT_HASH, ENHANCE_SCRIPT_TAG, PRIORITY_FILTERS } from './enhance.js';
import { escapeHtml } from './escape.js';
import { formatDate, formatTime, MONTHS, plural, spanText, timestamp } from './format.js';
import { FAVICON_HREF } from './icon.js';
import { PALETTE } from './palette.js';
import {
  archiveStatus,
  editionStatus,
  sourceLabel,
  sourceSection,
  sourceSummary,
  SOURCES_ID,
  type EditionRole,
  type StatusLink,
} from './status.js';
import { CSS } from './styles.js';
import { vulnerabilityDisplays } from './vulnerabilities.js';

export { escapeHtml };
export type { EditionRole };

/** Options for the edition pages. `role` defaults to the permalink wording. */
export interface PageOptions {
  role?: EditionRole;
}

const ARTICLE_ID = 'edition-article';
const STORIES_ID = 'edition-stories';
const VULNS_ID = 'edition-vulns';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The policy every page carries. Scripts are limited to the single hashed
 * enhancement constant; no `unsafe-inline` or `unsafe-eval` for scripts, no
 * network access of any kind (`connect-src` falls back to `none`).
 */
export const CONTENT_SECURITY_POLICY = `default-src 'none'; script-src '${ENHANCE_SCRIPT_HASH}'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'`;
const STATIC_POLICY = `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'`;

export interface LayoutOptions {
  title: string;
  bodyHtml: string;
  generatedAt: string;
  /** Trusted, already-escaped footer markup; defaults to "Generated …". */
  footerHtml?: string;
  /** Which site nav link is this page. */
  current?: 'latest' | 'archive';
  /** Include the hashed enhancement script (default true). */
  enhance?: boolean;
}

export function layout(o: LayoutOptions): string {
  const enhance = o.enhance !== false;
  const nav = (key: 'latest' | 'archive', href: string) =>
    `<a${o.current === key ? ' aria-current="page"' : ''} href="${href}">${key}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${enhance ? CONTENT_SECURITY_POLICY : STATIC_POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${PALETTE.bg}">
<link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
<title>${escapeHtml(o.title)}</title>
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header>
<span class="brand">daily-security-news</span>
<nav class="nav" aria-label="Site">
${nav('latest', 'index.html')}
${nav('archive', 'archive.html')}
</nav>
</header>
<main id="main" tabindex="-1">
${o.bodyHtml}
</main>
<footer>${o.footerHtml ?? `Generated ${escapeHtml(o.generatedAt)}`}</footer>
${enhance ? `${ENHANCE_SCRIPT_TAG}\n` : ''}</body>
</html>
`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function editionFooter(edition: Edition): string {
  const record = DATE.test(edition.date)
    ? ` Stored record: <a href="editions/${escapeHtml(edition.date)}.json">editions/${escapeHtml(edition.date)}.json</a>.`
    : '';
  return `Edition generated ${timestamp(edition.generatedAt)}; this page shows that run and is not regenerated with newer data.${record}`;
}

function degradedBanner(notices: DegradedNotice[], exclusions: NormalizationExclusion[] | undefined, hasCollection: boolean): string {
  const expected = exclusions?.filter((item) => item.reason === 'future_event') ?? [];
  const eventNotice = expected.length ? `<aside class="notice">${expected.length} future event ${expected.length === 1 ? 'listing was' : 'listings were'} excluded from the news collection.</aside>` : '';
  if (notices.length === 0) return eventNotice;
  // Old records did not distinguish malformed input from expected future events.
  // Preserve their recorded provenance without claiming a retrospective diagnosis.
  const legacy = (n: DegradedNotice) => exclusions === undefined && n.stage === 'normalize'
    && /^\d+ items were dropped as unparseable$/.test(n.message);
  const collectionOnly = notices.every(legacy);
  function message(n: DegradedNotice): string {
    if (!legacy(n)) return n.message;
    const count = Number(n.message.split(' ')[0]);
    return `${count} collected ${count === 1 ? 'item was' : 'items were'} excluded during normalization. The specific rejection reason was not recorded.`;
  }
  const more = hasCollection ? `\n<p><a href="#${SOURCES_ID}">Source status</a> lists each feed’s recorded result.</p>` : '';
  return `${eventNotice}<section class="${collectionOnly ? 'notice' : 'degraded'}" aria-labelledby="edition-degraded-h">
<h2 id="edition-degraded-h">${collectionOnly ? 'Collection notice' : 'This edition is incomplete'}</h2>
<ul>
${notices.map((n) => `<li>${escapeHtml(message(n))}</li>`).join('\n')}
</ul>${more}
</section>`;
}

type Row = ReturnType<typeof vulnerabilityDisplays>[number];

function evidenceHtml(row: Row, generatedAt: string): string {
  const generated = Date.parse(generatedAt);
  return row.evidence.map((source) => {
    const status = source.status === 'found' ? 'record found'
      : source.status === 'not_found' ? 'not in retrieved source' : 'unavailable';
    const retrieved = source.retrievedAt ? Date.parse(source.retrievedAt) : NaN;
    const stale = Number.isFinite(retrieved) && generated - retrieved > VULNERABILITY_CACHE_TTL_MS;
    const later = Number.isFinite(retrieved) && retrieved - generated > CLOCK_SKEW_MS;
    return `<p><a href="${escapeHtml(httpUrl(source.href))}">${escapeHtml(source.name)}</a>: ${status}${source.retrievedAt ? `; retrieved ${timestamp(source.retrievedAt)}` : ''}${stale ? '; older than the refresh window at generation' : ''}${later ? '; recorded as retrieved after generation' : ''}.</p>`;
  }).join('');
}

function staleEvidence(row: Row, generatedAt: string): boolean {
  const generated = Date.parse(generatedAt);
  return row.evidence.some((source) => {
    const retrieved = source.retrievedAt ? Date.parse(source.retrievedAt) : NaN;
    return Number.isFinite(retrieved) && generated - retrieved > VULNERABILITY_CACHE_TTL_MS;
  });
}

function idHtml(row: Row): string {
  return row.href ? `<a href="${escapeHtml(httpUrl(row.href))}">${escapeHtml(row.id)}</a>` : escapeHtml(row.id);
}

function headSpans(row: Row): string {
  return [idHtml(row), ...row.labels.map(escapeHtml)].map((part) => `<span>${part}</span>`).join('');
}

function actionHtml(row: Row): string {
  if (!row.action) return '';
  return `<p class="vuln-action"><strong>CISA required action:</strong> ${escapeHtml(row.action.text)}</p>${row.action.dueDate ? `<p>CISA catalog due date: ${escapeHtml(row.action.dueDate)} (not a universal deadline).</p>` : ''}`;
}

const ABSENCE = '<p>Absence from KEV does not establish absence of exploitation.</p>';

/** Every CVE beside one story, compact, evidence folded away. */
function storyVulnerabilities(item: Item, generatedAt: string): string {
  const rows = vulnerabilityDisplays([item], false);
  if (rows.length === 0) return '';
  const list = rows.map((row) => `<li><span class="vuln-head">${headSpans(row)}</span><details class="vuln-evidence"><summary>Sources${row.action ? ' and required action' : ''}</summary>${evidenceHtml(row, generatedAt)}${actionHtml(row)}${ABSENCE}</details></li>`);
  return `\n<ul class="vuln-list vuln-meta">${list.join('\n')}</ul>`;
}

/**
 * The prioritised list: only CVEs that are in CISA KEV or rated High/Critical,
 * each tied back to the stories that named it, with the CISA action shown
 * rather than folded away.
 */
function vulnerabilitySummary(items: Item[], generatedAt: string, scope: string): { html: string; count: number } {
  const rows = vulnerabilityDisplays(items, true);
  if (rows.length === 0) return { html: '', count: 0 };
  const list = rows.map((row) => {
    const mentions = items.filter((item) => (item.cves ?? []).some((cve) => cve.id === row.id))
      .map((item) => `<a href="${escapeHtml(httpUrl(item.url))}">${escapeHtml(item.title)}</a> (${escapeHtml(sourceLabel(item.sourceId))})`);
    const flag = staleEvidence(row, generatedAt)
      ? '<p class="flag">Evidence was older than the refresh window when this edition was generated.</p>' : '';
    return `<li class="prio-${escapeHtml(row.priority)}"><p class="vuln-head">${headSpans(row)}</p>${mentions.length ? `<p>Mentioned in: ${mentions.join('; ')}</p>` : ''}${flag}${actionHtml(row)}<details class="vuln-evidence"><summary>Sources</summary>${evidenceHtml(row, generatedAt)}${ABSENCE}</details></li>`;
  });
  const html = `<section class="block vuln-summary" id="${VULNS_ID}" aria-labelledby="${VULNS_ID}-h">
<h2 id="${VULNS_ID}-h">Vulnerability intelligence</h2>
<p class="block-intro">CVEs named in ${escapeHtml(scope)} that CISA lists as known exploited (KEV) or NVD rates High or Critical: KEV listings first, then by NVD CVSS score. Each source is shown as retrieved at the time given, not live.</p>
<ul class="vuln-list">${list.join('\n')}</ul>
</section>`;
  return { html, count: rows.length };
}

function storyAge(publishedAt: string, generatedAt: string): string {
  const published = Date.parse(publishedAt);
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(published) || !Number.isFinite(generated)) return '';
  if (published - generated > CLOCK_SKEW_MS) return ' · <span class="flag">dated after this edition was generated</span>';
  if (generated - published >= DAY_MS) return ` · ${escapeHtml(spanText(publishedAt, generatedAt))} before this edition`;
  return '';
}

function option(value: string, label: string, n: number): string {
  return `<option value="${escapeHtml(value)}">${escapeHtml(`${label} (${n})`)}</option>`;
}

/** Hidden until the script binds it, so a reader without JS meets no dead control. */
function filterControls(items: Item[], listId: string): string {
  if (items.length < 2) return '';
  const priorities = items.map((item) => vulnerabilityPriority(item));
  const rank = { none: 0, cve: 1, high: 2, critical: 3, known_exploited: 4 } as const;
  const priorityOptions = PRIORITY_FILTERS.map(([value, label]) => {
    const n = value === '' ? items.length
      : value === 'known_exploited' ? priorities.filter((p) => p === 'known_exploited').length
      : priorities.filter((p) => rank[p] >= rank[value as keyof typeof rank]).length;
    return option(value, label, n);
  }).join('');
  const bySource = new Map<string, number>();
  for (const item of items) bySource.set(item.sourceId, (bySource.get(item.sourceId) ?? 0) + 1);
  const sourceField = bySource.size > 1
    ? `<div class="field"><label for="${listId}-source">Source</label><select id="${listId}-source" data-filter="source">${option('', 'All sources', items.length)}${[...bySource.entries()]
        .sort(([a], [b]) => sourceLabel(a).localeCompare(sourceLabel(b)))
        .map(([id, n]) => option(id, sourceLabel(id), n)).join('')}</select></div>`
    : '';
  const total = plural(items.length, 'story', 'stories');
  return `<div class="filters" role="search" aria-label="Filter these stories" data-filters data-filter-target="${listId}" hidden>
<div class="controls">
<div class="field"><label for="${listId}-q">Search text</label><input id="${listId}-q" type="search" data-filter="q" autocomplete="off" spellcheck="false"></div>
<div class="field"><label for="${listId}-priority">Vulnerability priority</label><select id="${listId}-priority" data-filter="priority">${priorityOptions}</select></div>
${sourceField}<button type="button" data-filter-reset>Reset filters</button>
</div>
<p class="count" role="status" data-filter-count>Showing all ${total}.</p>
<p class="empty" data-filter-empty hidden>No stories match. Choose “Reset filters” to show all ${total} again.</p>
</div>`;
}

function storyList(items: Item[], emptyHtml: string, generatedAt: string, listId: string): string {
  if (items.length === 0) return `<p class="empty">${emptyHtml}</p>`;
  const width = Math.max(2, String(items.length).length);
  const stories = items.map((item, index) => {
    const also = item.alsoCoveredBy.length
      ? `<p class="also">Also covered by: ${item.alsoCoveredBy
          .map((a) => `<a href="${escapeHtml(httpUrl(a.url))}">${escapeHtml(a.name)}</a>`)
          .join(', ')}</p>`
      : '';
    const excerpt = item.excerpt ? `<p class="excerpt">${escapeHtml(item.excerpt)}</p>` : '';
    const n = String(index + 1).padStart(width, '0');
    return `<li id="${escapeHtml(item.id)}" data-story data-source="${escapeHtml(item.sourceId)}" data-priority="${vulnerabilityPriority(item)}">
<p class="story-title" data-n="${n}"><a href="${escapeHtml(httpUrl(item.url))}">${escapeHtml(item.title)}</a></p>
<p class="meta">${escapeHtml(sourceLabel(item.sourceId))} · ${timestamp(item.publishedAt)}${storyAge(item.publishedAt, generatedAt)}</p>
${excerpt}${storyVulnerabilities(item, generatedAt)}
${also}
</li>`;
  });
  return `${filterControls(items, listId)}
<ol class="stories" id="${listId}">
${stories.join('\n')}
</ol>`;
}

function summaryLine(lead: string, edition: Edition): string {
  return `${escapeHtml(lead)} · ${sourceSummary(edition)} · generated ${escapeHtml(formatTime(edition.generatedAt))}`;
}

export function digestPage(edition: DigestEdition, o: PageOptions = {}): string {
  const role = o.role ?? 'edition';
  const { stats } = edition;

  const disclosure = `<div class="notice">
<strong>This is an automated chronological digest, not a written article.</strong>
Every story collected in the window is listed below in the order it was published,
with no editorial selection, ranking, or summarising applied.
</div>`;

  const vulns = vulnerabilitySummary(edition.items, edition.generatedAt, 'these stories');
  const toc: StatusLink[] = [{ href: `#${STORIES_ID}-h`, label: `Stories (${edition.items.length})` }];
  if (vulns.count) toc.push({ href: `#${VULNS_ID}`, label: `Vulnerability intelligence (${vulns.count})` });
  toc.push({ href: `#${SOURCES_ID}`, label: 'Source status' });

  const lead = `${stats.published} ${stats.published === 1 ? 'story' : 'stories'}`;
  const empty = `No stories were published in this edition. That can mean a quiet window or failed collection; <a href="#${SOURCES_ID}">source status</a> shows what each feed returned.`;

  return layout({
    title: `Security digest — ${formatDate(edition.date)}`,
    generatedAt: edition.generatedAt,
    footerHtml: editionFooter(edition),
    ...(role === 'latest' ? { current: 'latest' as const } : {}),
    bodyHtml: `<h1>Security digest — ${escapeHtml(formatDate(edition.date))}</h1>
${editionStatus(edition, role, summaryLine(lead, edition), toc)}
${disclosure}
${degradedBanner(edition.degraded, edition.normalizationExclusions, Boolean(edition.collection))}
<section class="stories-block" aria-labelledby="${STORIES_ID}-h">
<h2 id="${STORIES_ID}-h">Stories</h2>
${storyList(edition.items, empty, edition.generatedAt, STORIES_ID)}
</section>
${vulns.html}
${sourceSection(edition)}`,
  });
}

export function articlePage(edition: ArticleEdition, o: PageOptions = {}): string {
  const role = o.role ?? 'edition';
  const { stats } = edition;

  // Render untrusted Markdown with raw HTML escaped, then insert trusted citations.
  const bodyHtml = substituteCitations(marked.parse(edition.bodyMarkdown, {
    async: false,
  }), edition.selected);

  const vulns = vulnerabilitySummary(edition.selected, edition.generatedAt, 'the stories this article covers');
  const toc: StatusLink[] = [{ href: `#${ARTICLE_ID}`, label: 'Article' }];
  if (vulns.count) toc.push({ href: `#${VULNS_ID}`, label: `Vulnerability intelligence (${vulns.count})` });
  toc.push({ href: `#${STORIES_ID}-h`, label: `Also collected (${edition.alsoCollected.length})` });
  toc.push({ href: `#${SOURCES_ID}`, label: 'Source status' });

  const also = `<section class="block" aria-labelledby="${STORIES_ID}-h">
<h2 id="${STORIES_ID}-h">Also collected in this edition</h2>
${storyList(edition.alsoCollected, 'Every story collected for this edition is written up above.', edition.generatedAt, STORIES_ID)}
</section>`;

  const lead = `${edition.selected.length} of ${stats.published} ${stats.published === 1 ? 'story' : 'stories'} written up`;

  return layout({
    title: `${edition.headline} — ${formatDate(edition.date)}`,
    generatedAt: edition.generatedAt,
    footerHtml: editionFooter(edition),
    ...(role === 'latest' ? { current: 'latest' as const } : {}),
    bodyHtml: `<h1>${escapeHtml(edition.headline)}</h1>
${editionStatus(edition, role, summaryLine(lead, edition), toc)}
${degradedBanner(edition.degraded, edition.normalizationExclusions, Boolean(edition.collection))}
<p class="standfirst">${escapeHtml(edition.standfirst)}</p>
<div class="article" id="${ARTICLE_ID}">
${bodyHtml}
</div>
${vulns.html}
${also}
${sourceSection(edition)}`,
  });
}

/**
 * Monday first: these dates are UTC and the publication is a technical one,
 * so the week runs the ISO way rather than the American one.
 */
const WEEKDAYS: [short: string, long: string][] = [
  ['Mo', 'Monday'],
  ['Tu', 'Tuesday'],
  ['We', 'Wednesday'],
  ['Th', 'Thursday'],
  ['Fr', 'Friday'],
  ['Sa', 'Saturday'],
  ['Su', 'Sunday'],
];

/**
 * What a day's link says when it is hovered or read aloud.
 *
 * A grid of numbers is a worse index than a list of headlines unless the
 * headline is still reachable, so it lives on the link itself rather than
 * being dropped.
 */
function dayLabel(entry: ArchiveEntry, newest: boolean): string {
  const stories = `${entry.count} ${entry.count === 1 ? 'story' : 'stories'}`;
  const what = entry.mode === 'article' ? entry.headline : 'Automated digest';
  return `${formatDate(entry.date)} — ${what} · ${stories}${newest ? ' · newest stored edition' : ''}`;
}

function dayCell(cell: CalendarDay | null, latest: string): string {
  // Before the 1st or after the last: no day, so no number and no border.
  if (cell === null) return '<td class="pad"></td>';
  // A day that published nothing is drawn dim rather than omitted — a gap in
  // the record should look like a gap.
  if (cell.entry === null) return `<td class="off"><span>${cell.day}</span></td>`;

  const newest = cell.date === latest;
  const label = escapeHtml(dayLabel(cell.entry, newest));
  const classes = ['on', newest ? 'latest' : ''].filter(Boolean).join(' ');
  return `<td class="${classes}"><a class="${cell.entry.mode}" href="${escapeHtml(cell.date)}.html" title="${label}" aria-label="${label}">${cell.day}</a></td>`;
}

/**
 * One month as a table, because a calendar is tabular data: with the
 * stylesheet off it is still a grid of days under weekday headings, which a
 * `div` soup or a bare `ol` would not be.
 */
function monthTable(month: CalendarMonth, latest: string): string {
  const head = WEEKDAYS.map(
    ([short, long]) => `<th scope="col"><abbr title="${long}">${short}</abbr></th>`,
  ).join('');
  const rows = month.weeks
    .map((week) => `<tr>${week.map((cell) => dayCell(cell, latest)).join('')}</tr>`)
    .join('\n');
  const editions = `${month.count} ${month.count === 1 ? 'edition' : 'editions'}`;

  return `<table class="cal">
<caption>${escapeHtml(MONTHS[month.month - 1]!)} ${month.year} <span class="count">${editions}</span></caption>
<thead><tr>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

export interface ArchiveOptions {
  /** When this index was rebuilt; defaults to now. Never an edition's time. */
  builtAt?: string;
}

export function archivePage(entries: ArchiveEntry[], o: ArchiveOptions = {}): string {
  const months = calendarMonths(entries);
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map((e) => e.date);
  const latest = dates.at(-1) ?? '';
  const newest = sorted.at(-1);
  const builtAt = o.builtAt ?? new Date().toISOString();

  let body: string;
  if (months.length && newest) {
    const what = newest.mode === 'article' ? newest.headline : 'Automated digest';
    const link = `<a href="${escapeHtml(newest.date)}.html">${escapeHtml(`${formatDate(newest.date)} — ${what}`)}</a>`;
    // A month is only drawn because it holds an edition, so months and entries
    // are empty together and the summary line never has to describe nothing.
    const summary = `${dates.length} ${dates.length === 1 ? 'edition' : 'editions'} · ${escapeHtml(formatDate(dates[0] ?? ''))} to ${escapeHtml(formatDate(latest))}`;
    body = [
      archiveStatus(newest.date, link),
      `<p class="summary">${summary}</p>`,
      '<p class="legend">Bright bold day: written article · plain day: automated digest · dashed outline: newest stored edition · dashed muted cell: no edition stored for that day. Dates are UTC.</p>',
      ...months.map((month) => monthTable(month, latest)),
    ].join('\n');
  } else {
    body = '<p class="empty">No editions have been stored yet, so there is nothing to list.</p>';
  }

  return layout({
    title: 'Archive — Daily Security News',
    generatedAt: builtAt,
    current: 'archive',
    footerHtml: `Archive index rebuilt ${timestamp(builtAt)}. Each edition page keeps its own original generation time.`,
    bodyHtml: `<h1>Archive</h1>\n${body}`,
  });
}
