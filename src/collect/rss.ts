import { fetchFeed, type FeedOptions } from './feed.js';
import type { CollectionSource, DegradedNotice, RawItem, Source } from '../types.js';

export interface CollectResult {
  items: RawItem[];
  degraded: DegradedNotice[];
  sourcesOk: number;
  collection: CollectionSource[];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function collectRss(
  sources: Source[], options: FeedOptions & { now?: Date } = {},
): Promise<CollectResult> {
  const attemptedAt = (options.now ?? new Date()).toISOString();
  const settled = await Promise.allSettled(sources.map((source) => fetchFeed(source.feedUrl, options)));
  const items: RawItem[] = [];
  const degraded: DegradedNotice[] = [];
  const collection: CollectionSource[] = [];
  let sourcesOk = 0;

  for (const [index, source] of sources.entries()) {
    const result = settled[index]!;
    if (result.status === 'rejected') {
      degraded.push({ stage: 'collect', sourceId: source.id,
        message: `${source.name} could not be fetched: ${errorMessage(result.reason)}` });
      collection.push({ sourceId: source.id, attemptedAt, status: 'failed', items: 0, skipped: 0 });
      continue;
    }

    const before = items.length;
    let skipped = 0;
    for (const entry of result.value.items ?? []) {
      const title = typeof entry.title === 'string' ? entry.title.trim() : '';
      const url = typeof entry.link === 'string' ? entry.link.trim() : '';
      if (!title || !url) { skipped++; continue; }
      items.push({ sourceId: source.id, sourceKind: source.kind, title, url,
        publishedAt: entry.isoDate ?? entry.pubDate ?? '',
        excerpt: entry.contentSnippet ?? entry.content ?? entry.summary });
    }

    const count = items.length - before;
    collection.push({ sourceId: source.id, attemptedAt, status: count ? 'ok' : 'empty', items: count, skipped });
    if (count === 0) {
      degraded.push({ stage: 'collect', sourceId: source.id, message: `${source.name} returned no usable items` });
    } else {
      sourcesOk++;
    }
    if (skipped > 0) {
      degraded.push({ stage: 'collect', sourceId: source.id,
        message: `${source.name}: ${skipped} feed entries were excluded because their title or link was missing` });
    }
  }
  return { items, degraded, sourcesOk, collection };
}
