import { httpUrl } from '../url.js';
import type { NormalizedItem, RawItem, NormalizationExclusion, DegradedNotice } from '../types.js';

const TRACKING_PARAM = /^(utm_|ref$|ref_|fbclid$|gclid$|mc_cid$|mc_eid$|source$|amp$|si$)/i;

const MAX_EXCERPT = 400;
const MAX_FUTURE_MS = 2 * 24 * 60 * 60 * 1000;

/** Canonicalize a URL for dedupe. Throws on unparseable input. */
export function canonicalize(rawUrl: string): string {
  const url = new URL(httpUrl(rawUrl));

  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }

  url.hash = '';

  let pathname = url.pathname.replace(/\/amp\/?$/, '');
  if (pathname.length > 1) pathname = pathname.replace(/\/$/, '');
  url.pathname = pathname === '' ? '/' : pathname;

  return url.toString();
}

function cleanExcerpt(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  let text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return undefined;

  if (text.length > MAX_EXCERPT) {
    const head = text.slice(0, MAX_EXCERPT);
    const lastSpace = head.lastIndexOf(' ');
    text = (lastSpace > 0 ? head.slice(0, lastSpace) : head) + '…';
  }

  return text;
}

/** A future event needs both an event URL and an explicit event label. */
function isEventListing(item: RawItem): boolean {
  return /\/events?\//i.test(new URL(item.url).pathname)
    && /\b(?:virtual event|webinar|conference|summit)\b/i.test(item.title);
}

export function normalize(items: RawItem[], now = new Date()): {
  items: NormalizedItem[];
  dropped: number;
  exclusions: NormalizationExclusion[];
} {
  const out: NormalizedItem[] = [];
  const exclusions: NormalizationExclusion[] = [];
  function exclude(item: RawItem, reason: NormalizationExclusion['reason']): void {
    exclusions.push({sourceId: item.sourceId, title: item.title, url: item.url,
      publishedAt: item.publishedAt, reason, observedAt: now.toISOString()});
  }
  for (const item of items) {
    let canonicalUrl: string;
    try { canonicalUrl = canonicalize(item.url); }
    catch { exclude(item, 'invalid_url'); continue; }
    const date = new Date(item.publishedAt);
    if (Number.isNaN(date.getTime())) { exclude(item, 'invalid_date'); continue; }
    if (date.getTime() - now.getTime() > MAX_FUTURE_MS) {
      exclude(item, isEventListing(item) ? 'future_event' : 'future_timestamp');
      continue;
    }
    out.push({...item, canonicalUrl, publishedAt: date.toISOString(), excerpt: cleanExcerpt(item.excerpt)});
  }
  return {items: out, dropped: exclusions.length, exclusions};
}

export function normalizationNotices(exclusions: NormalizationExclusion[]): DegradedNotice[] {
  const invalid = exclusions.filter((item) => item.reason !== 'future_event');
  if (invalid.length === 0) return [];
  const counts = new Map<NormalizationExclusion['reason'], number>();
  for (const item of invalid) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  const labels = {
    invalid_url: 'invalid or disallowed URL', invalid_date: 'invalid publication date',
    future_timestamp: 'unexplained publication date more than two days ahead',
    future_event: 'future event listing',
  };
  const details = [...counts].map(([reason, count]) => `${count} with ${labels[reason]}`).join('; ');
  return [{stage: 'normalize', message: `${invalid.length} collected ${invalid.length === 1 ? 'item was' : 'items were'} excluded: ${details}.`}];
}
