import { marked } from 'marked';
import { sources } from '../config/sources.js';
import type { ArticleEdition, DegradedNotice, DigestEdition, Item } from '../types.js';
import {
  calendarMonths,
  type ArchiveEntry,
  type CalendarDay,
  type CalendarMonth,
} from './calendar.js';
import { substituteCitations } from './citations.js';
import { escapeHtml } from './escape.js';
import { FAVICON_HREF } from './icon.js';
import { MONO, PALETTE } from './palette.js';
import { vulnerabilityDisplays } from './vulnerabilities.js';

export { escapeHtml };

const NAMES = new Map(sources.map((s) => [s.id, s.name]));
function sourceLabel(sourceId: string): string {
  return NAMES.get(sourceId) ?? sourceId;
}

/**
 * Green-phosphor terminal. Dark only — a light variant of a CRT is a
 * contradiction, so there isn't one (design.md §2).
 *
 * The decorative characters — the shell prompt, the `$` and `##` sigils, the
 * `[01]` story numbers — are CSS `content`, never markup. The document stays
 * readable prose when the stylesheet doesn't apply.
 *
 * The colours come from `palette.ts` rather than being written here, because
 * `email.ts` needs the same values and cannot use custom properties. This is
 * the only place they become CSS variables.
 */
const CSS = `
:root { color-scheme: dark;
  --bg:${PALETTE.bg}; --fg:${PALETTE.fg}; --bright:${PALETTE.bright}; --muted:${PALETTE.muted}; --dim:${PALETTE.dim};
  --rule:${PALETTE.rule}; --link:${PALETTE.link}; --warn:${PALETTE.warn}; --warn-bg:${PALETTE.warnBg}; --warn-fg:${PALETTE.warnFg};
  --note:${PALETTE.note}; --note-bg:${PALETTE.noteBg};
  --mono: ${MONO}; }
* { box-sizing: border-box; }
html { background: var(--bg); scrollbar-color: var(--dim) var(--bg); }
body { margin: 0; color: var(--fg); line-height: 1.6; font-family: var(--mono); font-size: 16px;
  overflow-wrap: break-word;
  background: radial-gradient(ellipse at 50% -10%, #0f1c13 0%, var(--bg) 65%) no-repeat fixed; }
/* Scanlines. Fixed, inert, and subtle enough to survive a full page of reading. */
body::before { content: ""; position: fixed; inset: 0; z-index: 9; pointer-events: none;
  background: repeating-linear-gradient(to bottom, rgba(0,0,0,.20) 0 1px, transparent 1px 3px); }
::selection { background: var(--bright); color: var(--bg); text-shadow: none; }
main, header, footer { max-width: 76ch; margin: 0 auto; padding: 0 1.25rem; }
header { display: flex; flex-wrap: wrap; gap: .4rem 1.25rem; align-items: baseline;
  border-bottom: 1px solid var(--rule); padding-top: 1.5rem; padding-bottom: .6rem; }
header .brand { color: var(--bright); font-weight: 700; text-shadow: 0 0 10px rgba(125,255,164,.35); }
header .brand::before { content: "root@sec:~$ "; color: var(--dim); font-weight: 400; }
.nav { display: flex; gap: .9rem; }
.nav a { text-decoration: none; border-bottom: 0; }
.nav a::before { content: "["; color: var(--dim); }
.nav a::after { content: "]"; color: var(--dim); }
.nav a:hover::before, .nav a:hover::after, .nav a:focus-visible::before, .nav a:focus-visible::after {
  color: inherit; }
a { color: var(--link); text-decoration: none; border-bottom: 1px dotted currentColor; }
a:hover, a:focus-visible { background: var(--link); color: var(--bg);
  border-bottom-color: transparent; text-shadow: none; }
a:focus-visible { outline: 1px solid var(--bright); outline-offset: 2px; }
h1 { font-size: 1.45rem; line-height: 1.35; margin: 1.75rem 0 .5rem; color: var(--bright);
  text-shadow: 0 0 12px rgba(125,255,164,.3); }
h1::before { content: "$ "; color: var(--dim); font-weight: 400; }
h1::after { content: "\\2588"; margin-left: .15ch; animation: blink 1.1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { h1::after { animation: none; } }
h2 { font-size: 1.05rem; margin: 0 0 .5rem; color: var(--bright); }
strong { color: var(--bright); }
hr { border: 0; border-top: 1px dashed var(--rule); margin: 2rem 0; }
code { color: var(--warn); }
pre { border: 1px solid var(--rule); padding: .75rem; overflow-x: auto; }
.summary { color: var(--muted); font-size: .82rem; margin: 0 0 1.5rem; }
.summary::before { content: "// "; color: var(--dim); }
.notice, .degraded { border: 1px solid; padding: .85rem 1rem; margin: 1.5rem 0; font-size: .9rem; }
.notice::before, .degraded::before { display: block; letter-spacing: .12em; font-size: .72rem;
  margin-bottom: .5rem; }
.notice { border-color: var(--note); background: var(--note-bg); }
.notice::before { content: "[ NOTICE ]"; color: var(--note); }
.degraded { border-color: var(--warn); background: var(--warn-bg); color: var(--warn-fg); }
.degraded::before { content: "[ !! DEGRADED ]"; color: var(--warn); }
.degraded h2 { color: var(--warn); font-size: .95rem; letter-spacing: .04em; text-transform: uppercase; }
.degraded ul { list-style: none; margin: .5rem 0 0; padding: 0; }
.degraded li { padding-left: 2ch; text-indent: -2ch; }
.degraded li::before { content: "! "; color: var(--warn); }
ol.stories { list-style: none; margin: 0; padding: 0; counter-reset: story; }
ol.stories > li { counter-increment: story; border-top: 1px solid var(--rule); padding: 1.1rem 0; }
.story-title { font-size: 1rem; font-weight: 700; margin: 0 0 .3rem; }
.story-title::before { content: "[" counter(story, decimal-leading-zero) "] ";
  color: var(--dim); font-weight: 400; }
.meta { color: var(--muted); font-size: .8rem; margin: 0 0 .45rem; }
.excerpt { margin: .4rem 0 0; }
.also { font-size: .82rem; color: var(--muted); margin: .5rem 0 0; }
.vuln-summary { border: 1px solid var(--rule); margin: 0 0 1.75rem; padding: .75rem 1rem; }
.vuln-summary h2 { margin: 0 0 .4rem; font-size: .9rem; }
.vuln-summary h2::before { content: "## "; color: var(--dim); }
.vuln-list { list-style: none; margin: 0; padding: 0; }
.vuln-list li { color: var(--muted); font-size: .82rem; padding: .15rem 0; }
.vuln-list li::before { content: "> "; color: var(--dim); }
.vuln-meta { margin: .35rem 0 0; }
.vuln-list span + span::before { content: " \\00B7 "; color: var(--dim); }
.standfirst { color: var(--fg); margin: 0 0 1.75rem; padding-left: 1rem;
  border-left: 2px solid var(--dim); }
.article h2 { margin: 2.25rem 0 .75rem; }
.article h2::before { content: "## "; color: var(--dim); }
.article p { margin: 0 0 1.1rem; }
.article ul, .article ol { padding-left: 2ch; }
.article li { margin: 0 0 .35rem; }
.article li::marker { color: var(--dim); }
.also-heading { border-top: 1px solid var(--rule); margin-top: 2.75rem; padding-top: 1.5rem; }
.also-heading::before { content: "## "; color: var(--dim); }
table.cal { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 0 0 2.25rem; }
table.cal caption { text-align: left; color: var(--bright); font-size: 1.05rem;
  padding: 1.5rem 0 .6rem; }
table.cal caption::before { content: "## "; color: var(--dim); }
table.cal caption .count { color: var(--muted); font-size: .82rem; }
table.cal th { font-weight: 400; font-size: .72rem; letter-spacing: .1em; color: var(--dim);
  padding: .35rem 0; text-align: center; }
table.cal th abbr { text-decoration: none; }
table.cal td { border: 1px solid var(--rule); padding: 0; text-align: center; font-size: .9rem; }
table.cal td.pad { border-color: transparent; }
table.cal td span, table.cal td a { display: block; padding: .55rem 0; }
table.cal td.off span { color: var(--dim); }
table.cal td a { border-bottom: 0; }
table.cal td a.article { color: var(--bright); font-weight: 700; }
table.cal td.latest { outline: 1px dashed var(--dim); outline-offset: -3px; }
table.cal td a:hover, table.cal td a:focus-visible { background: var(--link); color: var(--bg); }
table.cal td a.article:hover, table.cal td a.article:focus-visible { background: var(--bright); }
footer { border-top: 1px solid var(--rule); margin-top: 3rem; padding-top: 1rem;
  padding-bottom: 3rem; color: var(--muted); font-size: .8rem; }
footer::before { content: "// "; color: var(--dim); }
.empty { color: var(--muted); padding: 1.5rem 0; }
.empty::before { content: "# "; color: var(--dim); }
`;

export function layout(o: { title: string; bodyHtml: string; generatedAt: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${PALETTE.bg}">
<link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
<title>${escapeHtml(o.title)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
<span class="brand">daily-security-news</span>
<nav class="nav">
<a href="index.html">today</a>
<a href="archive.html">archive</a>
</nav>
</header>
<main>
${o.bodyHtml}
</main>
<footer>Generated ${escapeHtml(o.generatedAt)}</footer>
</body>
</html>
`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function degradedBanner(notices: DegradedNotice[]): string {
  if (notices.length === 0) return '';
  return `<div class="degraded">
<h2>This edition is incomplete</h2>
<ul>
${notices.map((n) => `<li>${escapeHtml(n.message)}</li>`).join('\n')}
</ul>
</div>`;
}

function vulnerabilityMetadata(items: Item[], summary = false): string {
  const rows = vulnerabilityDisplays(items);
  if (rows.length === 0) return '';
  const list = rows
    .map((row) => {
      const id = row.href
        ? `<a href="${escapeHtml(row.href)}">${escapeHtml(row.id)}</a>`
        : escapeHtml(row.id);
      return `<li>${[id, ...row.labels.map(escapeHtml)]
        .map((part) => `<span>${part}</span>`)
        .join('')}</li>`;
    })
    .join('\n');
  return summary
    ? `\n<aside class="vuln-summary"><h2>Vulnerability intelligence</h2><ul class="vuln-list">${list}</ul></aside>`
    : `\n<ul class="vuln-list vuln-meta">${list}</ul>`;
}

function storyList(items: Item[], emptyText: string): string {
  if (items.length === 0) return `<p class="empty">${escapeHtml(emptyText)}</p>`;

  return `<ol class="stories">
${items
  .map((item) => {
    const also = item.alsoCoveredBy.length
      ? `<p class="also">Also covered by: ${item.alsoCoveredBy
          .map((a) => `<a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a>`)
          .join(', ')}</p>`
      : '';
    const excerpt = item.excerpt ? `<p class="excerpt">${escapeHtml(item.excerpt)}</p>` : '';
    const vulnerabilities = vulnerabilityMetadata([item]);
    return `<li id="${escapeHtml(item.id)}">
<p class="story-title"><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></p>
<p class="meta">${escapeHtml(sourceLabel(item.sourceId))} · ${escapeHtml(formatTime(item.publishedAt))}</p>${vulnerabilities}
${excerpt}
${also}
</li>`;
  })
  .join('\n')}
</ol>`;
}

export function digestPage(edition: DigestEdition): string {
  const { stats } = edition;

  const disclosure = `<div class="notice">
<strong>This is an automated chronological digest, not a written article.</strong>
Every story collected in the window is listed below in the order it was published,
with no editorial selection, ranking, or summarising applied.
</div>`;

  const degraded = degradedBanner(edition.degraded);

  const body = storyList(edition.items, 'No new stories in this window.');

  const summary = `${stats.published} ${stats.published === 1 ? 'story' : 'stories'} · ${stats.sourcesOk} of ${stats.sourcesConfigured} sources · generated ${escapeHtml(formatTime(edition.generatedAt))}`;

  return layout({
    title: `Security digest — ${formatDate(edition.date)}`,
    generatedAt: edition.generatedAt,
    bodyHtml: `<h1>Security digest — ${escapeHtml(formatDate(edition.date))}</h1>
<p class="summary">${summary}</p>
${disclosure}
${degraded}
${body}`,
  });
}

export function articlePage(edition: ArticleEdition): string {
  const { stats } = edition;

  const degraded = degradedBanner(edition.degraded);

  const bodyHtml = marked.parse(substituteCitations(edition.bodyMarkdown, edition.selected), {
    async: false,
  });

  const also = `<h2 class="also-heading">Also collected today</h2>
${storyList(edition.alsoCollected, 'Every story collected today was written up above.')}`;

  const summary = `${edition.selected.length} of ${stats.published} ${stats.published === 1 ? 'story' : 'stories'} written up · ${stats.sourcesOk} of ${stats.sourcesConfigured} sources · generated ${escapeHtml(formatTime(edition.generatedAt))}`;

  return layout({
    title: `${edition.headline} — ${formatDate(edition.date)}`,
    generatedAt: edition.generatedAt,
    bodyHtml: `<h1>${escapeHtml(edition.headline)}</h1>
<p class="summary">${summary}</p>
${degraded}
<p class="standfirst">${escapeHtml(edition.standfirst)}</p>${vulnerabilityMetadata(edition.selected, true)}
<div class="article">
${bodyHtml}
</div>
${also}`,
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
function dayLabel(entry: ArchiveEntry): string {
  const stories = `${entry.count} ${entry.count === 1 ? 'story' : 'stories'}`;
  const what = entry.mode === 'article' ? entry.headline : 'Automated digest';
  return `${formatDate(entry.date)} — ${what} · ${stories}`;
}

function dayCell(cell: CalendarDay | null, latest: string): string {
  // Before the 1st or after the last: no day, so no number and no border.
  if (cell === null) return '<td class="pad"></td>';
  // A day that published nothing is drawn dim rather than omitted — a gap in
  // the record should look like a gap.
  if (cell.entry === null) return `<td class="off"><span>${cell.day}</span></td>`;

  const label = escapeHtml(dayLabel(cell.entry));
  const classes = ['on', cell.date === latest ? 'latest' : ''].filter(Boolean).join(' ');
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

export function archivePage(entries: ArchiveEntry[]): string {
  const months = calendarMonths(entries);
  const dates = entries.map((e) => e.date).sort();
  const latest = dates.at(-1) ?? '';

  // A month is only drawn because it holds an edition, so months and entries
  // are empty together and the summary line never has to describe nothing.
  const summary = `${dates.length} ${dates.length === 1 ? 'edition' : 'editions'} · ${escapeHtml(formatDate(dates[0] ?? ''))} to ${escapeHtml(formatDate(latest))} · a bright day is a written article, a plain one an automated digest`;

  const body = months.length
    ? [
        `<p class="summary">${summary}</p>`,
        ...months.map((month) => monthTable(month, latest)),
      ].join('\n')
    : `<p class="empty">No editions yet.</p>`;

  return layout({
    title: 'Archive — Daily Security News',
    generatedAt: new Date().toISOString(),
    bodyHtml: `<h1>Archive</h1>\n${body}`,
  });
}
