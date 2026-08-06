import { sources } from '../config/sources.js';
import type { Edition } from '../types.js';

const NAMES = new Map(sources.map((s) => [s.id, s.name]));
function sourceLabel(sourceId: string): string {
  return NAMES.get(sourceId) ?? sourceId;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
:root { color-scheme: light dark; --bg:#fff; --fg:#1a1a1a; --muted:#5b5b5b;
  --rule:#e2e2e2; --link:#0b57d0; --warn-bg:#fff6e5; --warn-edge:#c77700;
  --note-bg:#eef2f8; --note-edge:#5b7cb5; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#14161a; --fg:#e8e8e8; --muted:#a3a3a3; --rule:#2c2f36;
    --link:#8ab4f8; --warn-bg:#302407; --warn-edge:#d99b1c;
    --note-bg:#1b2230; --note-edge:#6f8fc4; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); line-height: 1.65;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 17px; }
main, header, footer { max-width: 42rem; margin: 0 auto; padding: 0 1.25rem; }
header { display: flex; gap: 1rem; align-items: baseline;
  border-bottom: 1px solid var(--rule); padding-top: 1.5rem; padding-bottom: .75rem; }
header .brand { font-weight: 700; }
a { color: var(--link); }
h1 { font-size: 1.7rem; line-height: 1.25; margin: 1.5rem 0 .5rem; }
h2 { font-size: 1.15rem; margin: 0 0 .5rem; }
.summary { color: var(--muted); font-size: .92rem; margin: 0 0 1.25rem; }
.notice { border-left: 4px solid var(--note-edge); background: var(--note-bg);
  padding: .75rem 1rem; border-radius: 4px; margin: 1.25rem 0; font-size: .95rem; }
.degraded { border-left: 4px solid var(--warn-edge); background: var(--warn-bg);
  padding: .75rem 1rem; border-radius: 4px; margin: 1.25rem 0; font-size: .95rem; }
.degraded ul { margin: .5rem 0 0; padding-left: 1.2rem; }
ol.stories { list-style: none; margin: 0; padding: 0; }
ol.stories > li { border-top: 1px solid var(--rule); padding: 1.25rem 0; }
.story-title { font-size: 1.12rem; font-weight: 650; margin: 0 0 .25rem; }
.meta { color: var(--muted); font-size: .85rem; margin: 0 0 .5rem; }
.excerpt { margin: .4rem 0 0; }
.also { font-size: .88rem; color: var(--muted); margin: .5rem 0 0; }
ul.archive { list-style: none; margin: 0; padding: 0; }
ul.archive li { border-top: 1px solid var(--rule); padding: .6rem 0; }
ul.archive .count { color: var(--muted); font-size: .9rem; }
footer { border-top: 1px solid var(--rule); margin-top: 2.5rem; padding-top: 1rem;
  padding-bottom: 2.5rem; color: var(--muted); font-size: .85rem; }
.empty { color: var(--muted); font-style: italic; padding: 1.5rem 0; }
`;

export function layout(o: { title: string; bodyHtml: string; generatedAt: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(o.title)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
<span class="brand">Daily Security News</span>
<a href="index.html">Today</a>
<a href="archive.html">Archive</a>
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

export function digestPage(edition: Edition): string {
  const { stats } = edition;

  const disclosure = `<div class="notice">
<strong>This is an automated chronological digest, not a written article.</strong>
Every story collected in the window is listed below in the order it was published,
with no editorial selection, ranking, or summarising applied.
</div>`;

  const degraded = edition.degraded.length
    ? `<div class="degraded">
<h2>This edition is incomplete</h2>
<ul>
${edition.degraded.map((n) => `<li>${escapeHtml(n.message)}</li>`).join('\n')}
</ul>
</div>`
    : '';

  const body = edition.items.length
    ? `<ol class="stories">
${edition.items
  .map((item) => {
    const also = item.alsoCoveredBy.length
      ? `<p class="also">Also covered by: ${item.alsoCoveredBy
          .map((a) => `<a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a>`)
          .join(', ')}</p>`
      : '';
    const excerpt = item.excerpt ? `<p class="excerpt">${escapeHtml(item.excerpt)}</p>` : '';
    return `<li id="${escapeHtml(item.id)}">
<p class="story-title"><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></p>
<p class="meta">${escapeHtml(sourceLabel(item.sourceId))} · ${escapeHtml(formatTime(item.publishedAt))}</p>
${excerpt}
${also}
</li>`;
  })
  .join('\n')}
</ol>`
    : `<p class="empty">No new stories in this window.</p>`;

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

export function archivePage(entries: { date: string; count: number }[]): string {
  const list = entries.length
    ? `<ul class="archive">
${entries
  .map(
    (e) =>
      `<li><a href="${escapeHtml(e.date)}.html">${escapeHtml(formatDate(e.date))}</a> <span class="count">${e.count} ${e.count === 1 ? 'story' : 'stories'}</span></li>`,
  )
  .join('\n')}
</ul>`
    : `<p class="empty">No editions yet.</p>`;

  return layout({
    title: 'Archive — Daily Security News',
    generatedAt: new Date().toISOString(),
    bodyHtml: `<h1>Archive</h1>\n${list}`,
  });
}
