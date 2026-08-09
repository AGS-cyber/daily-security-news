import { marked } from 'marked';
import { SUBSCRIBE_URL } from '../config/newsletter.js';
import { sources } from '../config/sources.js';
import type { ArticleEdition, DegradedNotice, DigestEdition, Item } from '../types.js';
import { substituteCitations } from './citations.js';
import { escapeHtml } from './escape.js';
import { FAVICON_HREF } from './icon.js';
import { MONO, PALETTE } from './palette.js';

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
main, header, footer, .subscribe { max-width: 76ch; margin: 0 auto; padding: 0 1.25rem; }
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
ul.archive { list-style: none; margin: 0; padding: 0; }
ul.archive li { border-top: 1px solid var(--rule); padding: .55rem 0;
  display: flex; flex-wrap: wrap; gap: 0 1ch; }
ul.archive li::before { content: "\\203A"; color: var(--dim); }
ul.archive .count { color: var(--muted); font-size: .9rem; }
footer { border-top: 1px solid var(--rule); margin-top: 3rem; padding-top: 1rem;
  padding-bottom: 3rem; color: var(--muted); font-size: .8rem; }
footer::before { content: "// "; color: var(--dim); }
.empty { color: var(--muted); padding: 1.5rem 0; }
.empty::before { content: "# "; color: var(--dim); }
.subscribe { border-top: 1px dashed var(--rule); margin-top: 3rem; padding-top: 1.5rem; }
.subscribe h2 { margin-bottom: .35rem; }
.subscribe h2::before { content: "## "; color: var(--dim); }
.subscribe p { color: var(--muted); font-size: .82rem; margin: 0 0 .9rem; }
.subscribe form { display: flex; flex-wrap: wrap; gap: .5rem .75rem; align-items: center; }
.subscribe label { color: var(--dim); }
.subscribe input { flex: 1 1 20ch; min-width: 0; font: inherit; padding: .45rem .6rem;
  background: var(--bg); color: var(--fg); border: 1px solid var(--dim); border-radius: 0; }
.subscribe input::placeholder { color: var(--dim); }
.subscribe input:focus-visible { border-color: var(--bright); outline: 1px solid var(--bright);
  outline-offset: 1px; }
.subscribe button { font: inherit; cursor: pointer; padding: .45rem .9rem;
  background: var(--bg); color: var(--link); border: 1px solid var(--dim); border-radius: 0; }
.subscribe button::before { content: "["; color: var(--dim); }
.subscribe button::after { content: "]"; color: var(--dim); }
.subscribe button:hover, .subscribe button:focus-visible { background: var(--link); color: var(--bg); }
.subscribe button:hover::before, .subscribe button:hover::after,
.subscribe button:focus-visible::before, .subscribe button:focus-visible::after { color: inherit; }
`;

/**
 * An ordinary form POST to Buttondown's keyless embed endpoint — no
 * JavaScript, and none needed. The site has never carried a `<script>` tag
 * (design.md §2, "no client-side framework"), the endpoint takes a normal
 * form submission, and Buttondown renders the response page. A `fetch` here
 * would buy an inline success message at the cost of the page failing shut
 * for anyone without JS.
 *
 * It lives in `layout()` rather than on one page, so it reaches today's
 * edition, every dated page and the archive from a single place. Changing it
 * therefore needs `npm run rerender` to reach past pages (operations.md §4).
 */
function subscribeForm(): string {
  return `<section class="subscribe">
<h2>Get it by email</h2>
<p>One edition a day, around 08:00 US Eastern. We send a confirmation link first, and every email carries an unsubscribe link.</p>
<form method="post" action="${escapeHtml(SUBSCRIBE_URL)}">
<input type="hidden" name="embed" value="1">
<label for="subscribe-email">email</label>
<input id="subscribe-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
<button type="submit">subscribe</button>
</form>
</section>`;
}

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
${subscribeForm()}
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
    return `<li id="${escapeHtml(item.id)}">
<p class="story-title"><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></p>
<p class="meta">${escapeHtml(sourceLabel(item.sourceId))} · ${escapeHtml(formatTime(item.publishedAt))}</p>
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
<p class="standfirst">${escapeHtml(edition.standfirst)}</p>
<div class="article">
${bodyHtml}
</div>
${also}`,
  });
}

export type ArchiveEntry = {
  date: string;
  count: number;
} & ({ mode: 'digest' } | { mode: 'article'; headline: string });

export function archivePage(entries: ArchiveEntry[]): string {
  const list = entries.length
    ? `<ul class="archive">
${entries
  .map((e) => {
    const label =
      e.mode === 'article'
        ? escapeHtml(e.headline)
        : `Daily digest — ${e.count} ${e.count === 1 ? 'story' : 'stories'}`;
    return `<li><a href="${escapeHtml(e.date)}.html">${escapeHtml(formatDate(e.date))}</a> <span class="count">${label}</span></li>`;
  })
  .join('\n')}
</ul>`
    : `<p class="empty">No editions yet.</p>`;

  return layout({
    title: 'Archive — Daily Security News',
    generatedAt: new Date().toISOString(),
    bodyHtml: `<h1>Archive</h1>\n${list}`,
  });
}
