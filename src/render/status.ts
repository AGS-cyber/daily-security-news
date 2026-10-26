import { sources } from '../config/sources.js';
import type { CollectionSource, Edition, NormalizationReason } from '../types.js';
import { CLOCK_SKEW_MS, nextScheduledRun } from './enhance.js';
import { escapeHtml } from './escape.js';
import { canonicalTime, formatDate, formatDateTime, plural, timestamp } from './format.js';

/**
 * Reader-facing status: when an edition was made, whether this copy may be
 * out of date, and what each source did. Everything here is derived from
 * fields the edition actually stores; nothing infers freshness or health that
 * the record does not state.
 */

const NAMES = new Map(sources.map((s) => [s.id, s.name]));
export function sourceLabel(sourceId: string): string {
  return NAMES.get(sourceId) ?? sourceId;
}

/**
 * `latest` is what `index.html` carries; `edition` is a dated permalink,
 * which must not claim to be current once a newer day exists.
 */
export type EditionRole = 'latest' | 'edition';

export const SOURCES_ID = 'edition-sources';

const DAY_MS = 24 * 60 * 60 * 1000;

function attr(name: string, value: string | null): string {
  return value === null ? '' : ` ${name}="${escapeHtml(value)}"`;
}

function line(state: string, html: string, warn = false): string {
  return `<p${warn ? ' class="warn-line"' : ''} data-age-when="${state}" hidden>${html}</p>`;
}

const CLOCK = line('future', '<strong>Clock mismatch.</strong> This page’s generation time is later than this device’s clock, so its age cannot be shown. Check the device’s date and time.', true);

export interface StatusLink { href: string; label: string }

/**
 * The block under the headline: counts, absolute UTC dates, latest-or-stored,
 * and the live age sentences the enhancement script chooses between.
 */
export function editionStatus(
  edition: Edition,
  role: EditionRole,
  summaryHtml: string,
  toc: StatusLink[],
): string {
  const generated = canonicalTime(edition.generatedAt);
  const due = role === 'latest' ? nextScheduledRun(edition.date) : null;
  const date = escapeHtml(formatDate(edition.date));
  const dueText = due ? escapeHtml(formatDateTime(due)) : '';
  const unreadable = generated ? '' : ' (this timestamp could not be read)';

  const kind = role === 'latest'
    ? `<strong>Latest edition</strong> when this page was published.${due ? ` Next edition scheduled for <time datetime="${escapeHtml(due)}">${dueText}</time>.` : ''}`
    : `<strong>Stored edition</strong>: the permanent page for ${date}. It is not updated after generation, so newer editions may exist; see <a href="index.html">latest</a> or the <a href="archive.html">archive</a>.`;

  const lines: string[] = [];
  if (role === 'latest' && due) {
    lines.push(`<p data-age-when="nojs">If that time has passed, this page may be out of date: reload it, or check the <a href="archive.html">archive</a>.</p>`);
    lines.push(line('current', 'The next edition is not due yet.'));
    lines.push(line('due', `<strong>Next edition due.</strong> It was scheduled for ${dueText}; publication can take a while. Reload later, or check the <a href="archive.html">archive</a>.`, true));
    lines.push(line('stale', `<strong>Warning: this page may be out of date.</strong> An edition was scheduled for ${dueText}, but this page still shows the ${date} edition. Publication may have been delayed or failed, or this may be a cached copy. Reload, or check the <a href="archive.html">archive</a>.`, true));
  }
  lines.push(CLOCK);
  lines.push(line('invalid', '<strong>Age unknown.</strong> The stored generation time could not be read.', true));

  const nav = toc.length
    ? `\n<nav class="toc" aria-label="On this page"><ul>${toc.map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`).join('')}</ul></nav>`
    : '';

  return `<section class="edition-status" aria-label="Edition date and status" data-age data-role="${role}"${attr('data-generated-at', generated)}${attr('data-next-due', due)}>
<p class="summary">${summaryHtml}</p>
<p><strong>Edition ${date}</strong> &middot; Generated ${timestamp(edition.generatedAt)}${unreadable}<span data-age-out hidden> (<span data-age-text></span>)</span>. Scheduled daily at 12:00 UTC; publication can be delayed.</p>
<p class="kind">${kind}</p>
<div class="age-status" role="status">${lines.join('')}</div>${nav}
</section>`;
}

/** Archive equivalent: is anything newer than the newest listed day overdue? */
export function archiveStatus(latestDate: string, latestLinkHtml: string): string {
  const due = nextScheduledRun(latestDate);
  const dueText = due ? escapeHtml(formatDateTime(due)) : '';
  const date = escapeHtml(formatDate(latestDate));
  const lines = due
    ? [
        `<p data-age-when="nojs">If that time has passed and no newer day is listed, publication may have been delayed or failed.</p>`,
        line('current', 'No newer edition is due yet.'),
        line('due', `<strong>Next edition due.</strong> It was scheduled for ${dueText} and may still be publishing.`, true),
        line('stale', `<strong>Warning: nothing newer than ${date} is listed</strong>, although an edition was scheduled for ${dueText}. Publication may have been delayed or failed, or this may be a cached copy of the archive.`, true),
        line('future', '<strong>Clock mismatch.</strong> This device’s clock is earlier than the newest edition’s date. Check the device’s date and time.', true),
      ]
    : [];
  return `<section class="edition-status" aria-label="Archive status" data-age data-role="archive"${attr('data-next-due', due)}>
<p>Newest stored edition: ${latestLinkHtml}.${due ? ` Editions are scheduled daily at 12:00 UTC; the next one after it is scheduled for <time datetime="${escapeHtml(due)}">${dueText}</time>.` : ''}</p>
<div class="age-status" role="status">${lines.join('')}</div>
</section>`;
}

function counts(rows: CollectionSource[]) {
  return {
    ok: rows.filter((r) => r.status === 'ok').length,
    empty: rows.filter((r) => r.status === 'empty').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  };
}

/** The source part of the one-line summary, linking to the full section. */
export function sourceSummary(edition: Edition): string {
  const link = `<a href="#${SOURCES_ID}">source status</a>`;
  const { stats } = edition;
  if (!edition.collection) {
    const text = `${stats.sourcesOk} of ${stats.sourcesConfigured} sources OK (stored total)`;
    const warn = stats.sourcesOk < stats.sourcesConfigured;
    return `${warn ? `<span class="warn">${escapeHtml(text)}</span>` : escapeHtml(text)} · ${link}`;
  }
  const c = counts(edition.collection);
  const parts = [`${c.ok} with entries`];
  if (c.empty) parts.push(`<span class="warn">${c.empty} empty</span>`);
  if (c.failed) parts.push(`<span class="warn">${c.failed} failed</span>`);
  return `${plural(stats.sourcesConfigured, 'source', 'sources')} configured; feeds ${parts.join(', ')} · ${link}`;
}

const SEVERITY: Record<CollectionSource['status'], number> = { failed: 0, empty: 1, ok: 2 };
// "Fetched", not "OK": a feed that answered may still carry nothing new.
const TAG: Record<CollectionSource['status'], string> = { failed: 'FAILED', empty: 'EMPTY', ok: 'FETCHED' };

function checkedNote(source: CollectionSource, generatedAt: string): string {
  const attempted = Date.parse(source.attemptedAt);
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(attempted)) return ' (unreadable check time)';
  if (!Number.isFinite(generated)) return '';
  if (attempted - generated > CLOCK_SKEW_MS) return '; check time is later than this edition’s generation time';
  if (generated - attempted > DAY_MS) return '; checked more than a day before this edition was generated';
  return '';
}

function known(status: string): status is CollectionSource['status'] {
  return status === 'ok' || status === 'empty' || status === 'failed';
}

function sourceRow(source: CollectionSource, generatedAt: string): string {
  // A stored record is data, not a promise: an unexpected status is shown as
  // unrecognised rather than read as a success.
  const raw = String(source.status);
  const status = !known(raw) ? `unrecognised status &quot;${escapeHtml(raw)}&quot;`
    : raw === 'ok' ? escapeHtml(`${plural(Number(source.items), 'entry', 'entries')} collected`)
    : raw === 'empty' ? 'no usable entries' : 'fetch failed';
  const skipped = Number(source.skipped) > 0
    ? `; ${escapeHtml(plural(Number(source.skipped), 'entry', 'entries'))} missing a title or link` : '';
  const kind = known(raw) ? raw : 'unknown';
  const tag = known(raw) ? TAG[raw] : 'UNKNOWN';
  return `<li class="src-${kind}"><span class="tag">${tag}</span> ${escapeHtml(sourceLabel(source.sourceId))}: ${status}; checked ${timestamp(source.attemptedAt)}${checkedNote(source, generatedAt)}${skipped}.</li>`;
}

const REASONS: Record<NormalizationReason, [one: string, many: string]> = {
  invalid_url: ['entry with an invalid link', 'entries with an invalid link'],
  invalid_date: ['entry with an invalid date', 'entries with an invalid date'],
  future_event: ['future event listing', 'future event listings'],
  future_timestamp: ['entry dated in the future', 'entries dated in the future'],
};

function exclusionSummary(edition: Edition): string {
  const exclusions = edition.normalizationExclusions;
  if (!exclusions) return '';
  if (exclusions.length === 0) return '<p>No collected entries were excluded during normalization.</p>';
  const parts = (Object.keys(REASONS) as NormalizationReason[]).flatMap((reason) => {
    const n = exclusions.filter((e) => e.reason === reason).length;
    const [one, many] = REASONS[reason];
    return n ? [plural(n, one, many)] : [];
  });
  return `<p>Excluded during normalization: ${escapeHtml(parts.join(', '))}.</p>`;
}

/** The full per-source record, or an explicit statement that there is none. */
export function sourceSection(edition: Edition): string {
  const { stats } = edition;
  let body: string;
  if (!edition.collection) {
    body = `<p><strong>Source-by-source status was not recorded for this edition.</strong> Its stored summary counts ${stats.sourcesOk} of ${stats.sourcesConfigured} configured sources as OK; it does not say which sources those were, or whether any had new reporting.</p>`;
  } else {
    const rows = edition.collection;
    const c = counts(rows);
    const recorded = rows.length === stats.sourcesConfigured
      ? `All ${stats.sourcesConfigured} configured sources have a recorded result`
      : `${rows.length} of ${stats.sourcesConfigured} configured sources have a recorded result`;
    const rank = (s: string) => (known(s) ? SEVERITY[s] : -1);
    const ordered = rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => rank(String(a.row.status)) - rank(String(b.row.status)) || a.index - b.index)
      .map(({ row }) => sourceRow(row, edition.generatedAt));
    body = `<p>${recorded}: ${c.ok} with entries, ${c.empty} empty, ${c.failed} failed. Failures are listed first.</p>
<p>Counts precede date validation, deduplication and the seven-day news window. A successful fetch does not establish that a source has new reporting.</p>
${rows.length ? `<ul>${ordered.join('')}</ul>` : '<p class="empty">No source results were recorded.</p>'}`;
  }
  return `<section class="block sources" id="${SOURCES_ID}" aria-labelledby="${SOURCES_ID}-h">
<h2 id="${SOURCES_ID}-h">Source status</h2>
${body}
${exclusionSummary(edition)}
</section>`;
}
