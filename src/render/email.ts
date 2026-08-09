import { Marked, type RendererObject } from 'marked';
import { SITE_URL } from '../config/newsletter.js';
import { sources } from '../config/sources.js';
import type { ArticleEdition, DegradedNotice, DigestEdition, Edition, Item } from '../types.js';
import { substituteCitations } from './citations.js';
import { escapeHtml } from './escape.js';
import { MONO, PALETTE as P } from './palette.js';

/**
 * The edition as an HTML email — the same terminal the site wears, rebuilt
 * with the only tools email clients agree on.
 *
 * **This module inverts design.md §2's rule about decorative characters, and
 * the inversion is the point.** On the page the shell prompt, the `$` sigil,
 * the `[01]` numbers and the `## ` marks are CSS `content` and never markup,
 * so the document reads as plain prose with the stylesheet off. An email has
 * no stylesheet to speak of: Gmail and Outlook strip `::before`/`::after`
 * outright, along with custom properties, counters, flexbox and
 * `position: fixed`. So here the same characters are real text. Same rule
 * underneath — the reader gets the terminal — reached the opposite way,
 * because the medium is different.
 *
 * Consequently: no scanline overlay (it is the one `position: fixed` selector
 * on the site and has nowhere to live), no blinking cursor, and every element
 * carries an inline `style`. Colours come from `palette.ts` so they cannot
 * drift from the page's.
 *
 * Sizes are px, not rem. Email clients are unreliable about inherited root
 * font sizes, and the site's own base is 16px, so the conversions are exact.
 */

const NAMES = new Map(sources.map((s) => [s.id, s.name]));
function sourceLabel(sourceId: string): string {
  return NAMES.get(sourceId) ?? sourceId;
}

const WIDTH = 640;

const S = {
  link: `color:${P.link};text-decoration:underline;`,
  dim: `color:${P.dim};`,
  muted: `color:${P.muted};`,
  /** `.summary`, `.meta`, `.also`, `footer` — the site's .8/.82rem tier. */
  small: `margin:0;font-size:13px;line-height:1.55;color:${P.muted};`,
  h1: `margin:0 0 8px;font-size:23px;line-height:1.35;font-weight:700;color:${P.bright};`,
  h2: `margin:0 0 8px;font-size:17px;line-height:1.4;font-weight:700;color:${P.bright};`,
  p: `margin:0 0 18px;`,
  rule: `border-top:1px solid ${P.rule};`,
} as const;

/** A decorative sigil: real text here, `content` on the page. */
function sigil(text: string, color: string = P.dim): string {
  return `<span style="color:${color};font-weight:400;">${escapeHtml(text)}</span>`;
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

/**
 * `marked` with every tag styled as it is emitted. The alternative — parsing
 * normally and regexing inline styles into the result afterwards — would mean
 * a second HTML parser written in regex, which is the kind of thing CLAUDE.md
 * says to lean on an existing dependency for instead.
 *
 * A dedicated `Marked` instance, not `marked.use(...)`: `use` mutates the
 * shared singleton that `html.ts` renders the *page* with, so configuring it
 * here would quietly restyle the website from the email module.
 */
const emailRenderer: RendererObject = {
  heading(token) {
    // `.article h2::before { content: "## " }`, as markup.
    const marks = '#'.repeat(Math.max(2, token.depth));
    return `<h2 style="${S.h2}margin-top:28px;">${sigil(`${marks} `)}${this.parser.parseInline(token.tokens)}</h2>\n`;
  },
  paragraph(token) {
    return `<p style="${S.p}">${this.parser.parseInline(token.tokens)}</p>\n`;
  },
  link(token) {
    const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
    return `<a href="${escapeHtml(token.href)}"${title} style="${S.link}">${this.parser.parseInline(token.tokens)}</a>`;
  },
  strong(token) {
    return `<strong style="color:${P.bright};">${this.parser.parseInline(token.tokens)}</strong>`;
  },
  codespan(token) {
    return `<code style="color:${P.warn};">${escapeHtml(token.text)}</code>`;
  },
  list(token) {
    const tag = token.ordered ? 'ol' : 'ul';
    const items = token.items.map((item) => this.listitem(item)).join('');
    return `<${tag} style="margin:0 0 18px;padding-left:24px;">${items}</${tag}>\n`;
  },
  listitem(item) {
    // The item's tokens are block-level, so most items come back wrapped in a
    // styled <p> carrying 18px of bottom margin. Unwrap that one paragraph so
    // list items sit tight against each other, as they do on the page.
    const inner = this.parser
      .parse(item.tokens)
      .replace(/^<p style="[^"]*">/, '')
      .replace(/<\/p>\n?$/, '');
    return `<li style="margin:0 0 6px;">${inner}</li>`;
  },
};

const emailMarked = new Marked({ renderer: emailRenderer });

function articleBody(edition: ArticleEdition): string {
  const substituted = substituteCitations(edition.bodyMarkdown, edition.selected, S.link);
  return emailMarked.parse(substituted, { async: false });
}

function degradedBanner(notices: DegradedNotice[]): string {
  if (notices.length === 0) return '';
  const lines = notices
    .map(
      (n) =>
        `<p style="margin:6px 0 0;font-size:14px;color:${P.warnFg};">${sigil('! ', P.warn)}${escapeHtml(n.message)}</p>`,
    )
    .join('\n');
  return `<div style="border:1px solid ${P.warn};background-color:${P.warnBg};padding:14px 16px;margin:0 0 24px;">
<p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;color:${P.warn};">[ !! DEGRADED ]</p>
<p style="margin:0;font-size:15px;font-weight:700;color:${P.warn};text-transform:uppercase;">This edition is incomplete</p>
${lines}
</div>`;
}

function noticeBox(html: string): string {
  return `<div style="border:1px solid ${P.note};background-color:${P.noteBg};padding:14px 16px;margin:0 0 24px;">
<p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;color:${P.note};">[ NOTICE ]</p>
<p style="margin:0;font-size:14px;">${html}</p>
</div>`;
}

function storyList(items: Item[], emptyText: string): string {
  if (items.length === 0) {
    return `<p style="${S.small}margin:24px 0;">${sigil('# ')}${escapeHtml(emptyText)}</p>`;
  }

  return items
    .map((item, i) => {
      // `counter(story, decimal-leading-zero)`, as markup.
      const n = String(i + 1).padStart(2, '0');
      const also = item.alsoCoveredBy.length
        ? `<p style="${S.small}margin-top:6px;">Also covered by: ${item.alsoCoveredBy
            .map((a) => `<a href="${escapeHtml(a.url)}" style="${S.link}">${escapeHtml(a.name)}</a>`)
            .join(', ')}</p>`
        : '';
      const excerpt = item.excerpt
        ? `<p style="margin:6px 0 0;font-size:15px;">${escapeHtml(item.excerpt)}</p>`
        : '';
      return `<div style="${S.rule}padding:16px 0;">
<p style="margin:0 0 4px;font-size:16px;font-weight:700;">${sigil(`[${n}] `)}<a href="${escapeHtml(item.url)}" style="${S.link}">${escapeHtml(item.title)}</a></p>
<p style="${S.small}">${escapeHtml(sourceLabel(item.sourceId))} · ${escapeHtml(formatTime(item.publishedAt))}</p>
${excerpt}
${also}
</div>`;
    })
    .join('\n');
}

function shell(o: { subject: string; date: string; bodyHtml: string; generatedAt: string }): string {
  const webUrl = `${SITE_URL}/${o.date}.html`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(o.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${P.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${P.bg}" style="width:100%;border-collapse:collapse;background-color:${P.bg};">
<tr>
<td align="center" style="padding:24px 12px;background-color:${P.bg};">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;border-collapse:collapse;font-family:${MONO};font-size:16px;line-height:1.6;color:${P.fg};">
<tr>
<td style="padding:0 0 10px;border-bottom:1px solid ${P.rule};">
${sigil('root@sec:~$ ')}<span style="color:${P.bright};font-weight:700;">daily-security-news</span>
<span style="${S.dim}"> · </span><a href="${escapeHtml(webUrl)}" style="${S.link}">read on the web</a>
</td>
</tr>
<tr>
<td style="padding:24px 0 32px;">
${o.bodyHtml}
</td>
</tr>
<tr>
<!-- The gap above this rule is the previous cell's padding-bottom: margins do
     not apply to table cells, so the page's footer margin-top has no
     equivalent here. -->
<td style="${S.rule}padding:16px 0 0;">
<p style="${S.small}">${sigil('// ')}Generated ${escapeHtml(o.generatedAt)}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`;
}

/**
 * The edition as a subject line and an HTML body, ready to hand to Buttondown.
 *
 * No unsubscribe link is written here: Buttondown appends its own, and a
 * second one that this repository would have to keep working is a liability,
 * not a courtesy.
 */
export function emailEdition(edition: Edition): { subject: string; html: string } {
  return edition.mode === 'article' ? articleEmail(edition) : digestEmail(edition);
}

function articleEmail(edition: ArticleEdition): { subject: string; html: string } {
  const { stats } = edition;
  const summary = `${edition.selected.length} of ${stats.published} ${stats.published === 1 ? 'story' : 'stories'} written up · ${stats.sourcesOk} of ${stats.sourcesConfigured} sources · generated ${formatTime(edition.generatedAt)}`;

  const bodyHtml = `<h1 style="${S.h1}">${sigil('$ ')}${escapeHtml(edition.headline)}</h1>
<p style="${S.small}margin-bottom:24px;">${sigil('// ')}${escapeHtml(summary)}</p>
${degradedBanner(edition.degraded)}
<p style="margin:0 0 28px;padding-left:16px;border-left:2px solid ${P.dim};">${escapeHtml(edition.standfirst)}</p>
${articleBody(edition)}
<h2 style="${S.h2}${S.rule}margin-top:36px;padding-top:24px;">${sigil('## ')}Also collected today</h2>
${storyList(edition.alsoCollected, 'Every story collected today was written up above.')}`;

  return {
    subject: `${edition.headline} — ${formatDate(edition.date)}`,
    html: shell({
      subject: edition.headline,
      date: edition.date,
      generatedAt: edition.generatedAt,
      bodyHtml,
    }),
  };
}

function digestEmail(edition: DigestEdition): { subject: string; html: string } {
  const { stats } = edition;
  const summary = `${stats.published} ${stats.published === 1 ? 'story' : 'stories'} · ${stats.sourcesOk} of ${stats.sourcesConfigured} sources · generated ${formatTime(edition.generatedAt)}`;
  const title = `Security digest — ${formatDate(edition.date)}`;

  const bodyHtml = `<h1 style="${S.h1}">${sigil('$ ')}${escapeHtml(title)}</h1>
<p style="${S.small}margin-bottom:24px;">${sigil('// ')}${escapeHtml(summary)}</p>
${noticeBox(
  `<strong style="color:${P.bright};">This is an automated chronological digest, not a written article.</strong> Every story collected in the window is listed below in the order it was published, with no editorial selection, ranking, or summarising applied.`,
)}
${degradedBanner(edition.degraded)}
${storyList(edition.items, 'No new stories in this window.')}`;

  return {
    subject: title,
    html: shell({
      subject: title,
      date: edition.date,
      generatedAt: edition.generatedAt,
      bodyHtml,
    }),
  };
}
