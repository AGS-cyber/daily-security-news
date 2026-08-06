import type { NormalizedItem, RawItem } from '../types.js';

const TRACKING_PARAM = /^(utm_|ref$|ref_|fbclid$|gclid$|mc_cid$|mc_eid$|source$|amp$|si$)/i;

const MAX_EXCERPT = 400;
const MAX_FUTURE_MS = 2 * 24 * 60 * 60 * 1000;

/** Canonicalize a URL for dedupe. Throws on unparseable input. */
export function canonicalize(rawUrl: string): string {
  const url = new URL(rawUrl);

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

export function normalize(items: RawItem[]): { items: NormalizedItem[]; dropped: number } {
  const out: NormalizedItem[] = [];
  let dropped = 0;
  const now = Date.now();

  for (const item of items) {
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalize(item.url);
    } catch {
      dropped++;
      continue;
    }

    const date = new Date(item.publishedAt);
    if (Number.isNaN(date.getTime()) || date.getTime() - now > MAX_FUTURE_MS) {
      dropped++;
      continue;
    }

    out.push({
      ...item,
      canonicalUrl,
      publishedAt: date.toISOString(),
      excerpt: cleanExcerpt(item.excerpt),
    });
  }

  return { items: out, dropped };
}
