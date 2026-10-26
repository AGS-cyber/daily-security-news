import { MONO, PALETTE } from './palette.js';

/**
 * Green-phosphor terminal. Dark only — a light variant of a CRT is a
 * contradiction, so there isn't one (design.md §2).
 *
 * The decorative characters — the shell prompt, the `$` and `##` sigils, the
 * `[01]` story numbers — are CSS `content`, never markup. The document stays
 * readable prose when the stylesheet doesn't apply.
 *
 * Reading comes before atmosphere: no scanline overlay over the text, no
 * blinking cursor, no glow on headings, and nothing animates. Informative text
 * uses `--muted` (about 7:1 on the background); `--dim` (about 4.2:1) is kept
 * for decoration and borders only. Status is always spelled out in words, so
 * colour is never the only signal.
 *
 * The colours come from `palette.ts` rather than being written here, because
 * the palette is hand-mirrored into the app. This is the only place they
 * become CSS variables.
 */
export const CSS = `
:root { color-scheme: dark;
  --bg:${PALETTE.bg}; --fg:${PALETTE.fg}; --bright:${PALETTE.bright}; --muted:${PALETTE.muted}; --dim:${PALETTE.dim};
  --rule:${PALETTE.rule}; --link:${PALETTE.link}; --warn:${PALETTE.warn}; --warn-bg:${PALETTE.warnBg}; --warn-fg:${PALETTE.warnFg};
  --note:${PALETTE.note}; --note-bg:${PALETTE.noteBg};
  --mono: ${MONO}; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { background: var(--bg); scrollbar-color: var(--dim) var(--bg);
  -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { margin: 0; color: var(--fg); line-height: 1.6; font-family: var(--mono); font-size: 1rem;
  overflow-wrap: anywhere;
  background: radial-gradient(ellipse at 50% -10%, #0f1c13 0%, var(--bg) 60%) no-repeat; }
::selection { background: var(--bright); color: var(--bg); }
main, header, footer { max-width: 76ch; margin: 0 auto; padding: 0 1rem; }
main:focus { outline: none; }
.skip { position: absolute; left: .5rem; top: -4rem; z-index: 10; padding: .5rem .75rem;
  background: var(--bright); color: var(--bg); border: 0; }
.skip:focus { top: .5rem; }
header { display: flex; flex-wrap: wrap; gap: .4rem 1.25rem; align-items: baseline;
  border-bottom: 1px solid var(--rule); padding-top: 1.25rem; padding-bottom: .6rem; }
header .brand { color: var(--bright); font-weight: 700; }
header .brand::before { content: "root@sec:~$ "; color: var(--dim); font-weight: 400; }
.nav { display: flex; flex-wrap: wrap; gap: .25rem .9rem; }
.nav a { border-bottom: 0; padding: .15rem 0; }
.nav a::before { content: "["; color: var(--dim); }
.nav a::after { content: "]"; color: var(--dim); }
.nav a[aria-current="page"] { color: var(--bright); font-weight: 700; }
.nav a:hover::before, .nav a:hover::after, .nav a:focus-visible::before, .nav a:focus-visible::after {
  color: inherit; }
a { color: var(--link); text-decoration: none; border-bottom: 1px dotted currentColor; }
a:hover, a:focus-visible { background: var(--link); color: var(--bg); border-bottom-color: transparent; }
:focus-visible { outline: 2px solid var(--bright); outline-offset: 2px; }
h1 { font-size: 1.4rem; line-height: 1.35; margin: 1.5rem 0 .75rem; color: var(--bright); }
h1::before { content: "$ "; color: var(--dim); font-weight: 400; }
h2 { font-size: 1.05rem; line-height: 1.4; margin: 0 0 .5rem; color: var(--bright); }
strong { color: var(--bright); }
hr { border: 0; border-top: 1px dashed var(--rule); margin: 2rem 0; }
code { color: var(--warn); }
pre { border: 1px solid var(--rule); padding: .75rem; overflow-x: auto; }
.summary { color: var(--muted); font-size: .875rem; margin: 0 0 .5rem; }
.summary::before { content: "// "; color: var(--dim); }
.summary .warn { color: var(--warn); font-weight: 700; }
.edition-status { border-left: 2px solid var(--dim); padding: .1rem 0 .1rem .9rem; margin: 0 0 1.5rem;
  font-size: .875rem; color: var(--muted); }
.edition-status p { margin: 0 0 .35rem; }
.edition-status .kind { color: var(--fg); }
.edition-status[data-state="due"], .edition-status[data-state="stale"],
.edition-status[data-state="future"], .edition-status[data-state="invalid"] { border-left-color: var(--warn); }
.age-status p { margin: .35rem 0 0; }
.age-status .warn-line { color: var(--warn-fg); background: var(--warn-bg); border: 1px solid var(--warn);
  padding: .5rem .75rem; }
.age-status .warn-line strong { color: var(--warn); }
.toc { margin: .35rem 0 0; }
.toc ul { display: inline; list-style: none; margin: 0; padding: 0; }
.toc li { display: inline; }
.toc li + li::before { content: " \\00B7 "; color: var(--dim); }
.notice, .degraded { border: 1px solid; padding: .75rem 1rem; margin: 1.25rem 0; font-size: .9rem; }
.notice::before, .degraded::before { display: block; letter-spacing: .12em; font-size: .75rem;
  margin-bottom: .4rem; }
.notice { border-color: var(--note); background: var(--note-bg); }
.notice::before { content: "[ NOTICE ]"; color: var(--note); }
.notice h2 { color: var(--note); font-size: .95rem; }
.degraded { border-color: var(--warn); background: var(--warn-bg); color: var(--warn-fg); }
.degraded::before { content: "[ !! DEGRADED ]"; color: var(--warn); }
.degraded h2 { color: var(--warn); font-size: .95rem; letter-spacing: .04em; text-transform: uppercase; }
.degraded ul, .notice ul { list-style: none; margin: .5rem 0 0; padding: 0; }
.degraded li, .notice li { padding-left: 2ch; text-indent: -2ch; }
.degraded li::before { content: "! "; color: var(--warn); }
.notice li::before { content: "- "; color: var(--note); }
.standfirst { color: var(--fg); margin: 0 0 1.75rem; padding-left: 1rem; border-left: 2px solid var(--dim); }
.article h2 { margin: 2rem 0 .75rem; }
.article h2::before { content: "## "; color: var(--dim); }
.article p { margin: 0 0 1.1rem; }
.article ul, .article ol { padding-left: 2ch; }
.article li { margin: 0 0 .35rem; }
.article li::marker { color: var(--dim); }
.block { border-top: 1px solid var(--rule); margin-top: 2.5rem; padding-top: 1.25rem; }
.block > h2::before, .stories-block > h2::before { content: "## "; color: var(--dim); }
.stories-block { margin-top: 1.5rem; }
.block-intro { color: var(--muted); font-size: .875rem; margin: 0 0 1rem; }
ol.stories { list-style: none; margin: 0; padding: 0; }
ol.stories > li { border-top: 1px solid var(--rule); padding: 1rem 0; }
.story-title { font-size: 1rem; font-weight: 700; margin: 0 0 .3rem; }
.story-title::before { content: "[" attr(data-n) "] "; color: var(--dim); font-weight: 400; }
.meta { color: var(--muted); font-size: .875rem; margin: 0 0 .45rem; }
.excerpt { margin: .4rem 0 0; }
.also { font-size: .875rem; color: var(--muted); margin: .5rem 0 0; }
.filters { border: 1px solid var(--rule); padding: .75rem; margin: 0 0 1rem; font-size: .875rem; }
.filters .controls { display: flex; flex-wrap: wrap; gap: .6rem 1rem; align-items: flex-end; }
.filters .field { display: flex; flex-direction: column; gap: .2rem; min-width: 0; flex: 1 1 12rem; }
.filters label { color: var(--muted); }
.filters input, .filters select, .filters button { font: inherit; font-size: 1rem; color: var(--fg); background: #0d140e;
  border: 1px solid var(--dim); border-radius: 0; padding: .4rem .5rem; min-height: 2.75rem; max-width: 100%; }
.filters button { cursor: pointer; color: var(--link); border-color: var(--link); flex: 0 0 auto; }
.filters button:hover, .filters button:focus-visible { background: var(--link); color: var(--bg); }
.filters .count { margin: .6rem 0 0; color: var(--fg); }
.filters[data-active="true"] .count { color: var(--bright); }
.filters .empty { padding: .5rem 0 0; }
.vuln-list { list-style: none; margin: 0; padding: 0; }
.vuln-list > li { color: var(--muted); font-size: .875rem; padding: .2rem 0; }
.vuln-meta { margin: .35rem 0 0; }
.vuln-meta > li::before { content: "> "; color: var(--dim); }
.vuln-head span + span::before { content: " \\00B7 "; color: var(--dim); }
.vuln-summary .vuln-list > li { border-left: 2px solid var(--rule); padding: .5rem 0 .5rem .75rem; margin: 0 0 .75rem; }
.vuln-summary .vuln-list > li.prio-known_exploited { border-left-color: var(--warn); }
.vuln-summary .vuln-list > li.prio-critical { border-left-color: var(--bright); }
.vuln-summary p { margin: .25rem 0; }
.vuln-head { color: var(--fg); }
.vuln-action { color: var(--fg); }
.flag { color: var(--warn); }
.coverage, .vuln-evidence { margin: .5rem 0; font-size: .875rem; color: var(--muted); }
.coverage summary, .vuln-evidence summary { cursor: pointer; color: var(--link); padding: .2rem 0; }
.vuln-evidence p { margin: .4rem 0; }
.sources ul { list-style: none; margin: .5rem 0 0; padding: 0; font-size: .875rem; }
.sources li { padding: .3rem 0; border-top: 1px dashed var(--rule); color: var(--muted); }
.sources .tag { display: inline-block; min-width: 9ch; color: var(--fg); }
.sources .src-failed .tag, .sources .src-empty .tag, .sources .src-unknown .tag { color: var(--warn); }
.sources p { font-size: .875rem; color: var(--muted); margin: 0 0 .5rem; }
table.cal { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 0 0 2rem; }
table.cal caption { text-align: left; color: var(--bright); font-size: 1.05rem; padding: 1.5rem 0 .6rem; }
table.cal caption::before { content: "## "; color: var(--dim); }
table.cal caption .count { color: var(--muted); font-size: .875rem; }
table.cal th { font-weight: 400; font-size: .75rem; letter-spacing: .1em; color: var(--muted);
  padding: .35rem 0; text-align: center; }
table.cal th abbr { text-decoration: none; }
table.cal td { border: 1px solid var(--rule); padding: 0; text-align: center; font-size: .9rem; }
table.cal td.pad { border-color: transparent; }
table.cal td span, table.cal td a { display: block; padding: .6rem 0; }
table.cal td.off { border-style: dashed; }
table.cal td.off span { color: var(--muted); }
table.cal td a { border-bottom: 0; }
table.cal td a.article { color: var(--bright); font-weight: 700; }
table.cal td.latest { outline: 2px dashed var(--muted); outline-offset: -4px; }
table.cal td a:hover, table.cal td a:focus-visible { background: var(--link); color: var(--bg); }
table.cal td a.article:hover, table.cal td a.article:focus-visible { background: var(--bright); }
.legend { color: var(--muted); font-size: .875rem; margin: 0 0 .5rem; }
footer { border-top: 1px solid var(--rule); margin-top: 3rem; padding-top: 1rem;
  padding-bottom: 3rem; color: var(--muted); font-size: .875rem; }
footer::before { content: "// "; color: var(--dim); }
.empty { color: var(--muted); padding: 1rem 0; }
.empty::before { content: "# "; color: var(--dim); }
@media (max-width: 30rem) {
  body { font-size: .95rem; }
  h1 { font-size: 1.2rem; }
  main, header, footer { padding: 0 .75rem; }
  table.cal td { font-size: .85rem; }
}
@media print {
  .skip, .filters, .nav { display: none !important; }
  body { background: none; }
}
`;
