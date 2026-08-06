import Parser from 'rss-parser';
import type { DegradedNotice, RawItem, Source } from '../types.js';

export interface CollectResult {
  items: RawItem[];
  degraded: DegradedNotice[];
  sourcesOk: number;
}

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'daily-security-news/0.1' },
  // `agent: false` gives each request a throwaway agent instead of Node's
  // global one. Since Node 19 the global agent sets `keepAlive: true` with no
  // idle timeout, so pooled sockets stay open and hold the event loop open
  // with them — the process finishes its work and then never exits. We fetch
  // each host exactly once per run, so there is no connection to reuse anyway.
  requestOptions: { agent: false },
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function collectRss(sources: Source[]): Promise<CollectResult> {
  const settled = await Promise.allSettled(
    sources.map((source) => parser.parseURL(source.feedUrl)),
  );

  const items: RawItem[] = [];
  const degraded: DegradedNotice[] = [];
  let sourcesOk = 0;

  for (const [index, source] of sources.entries()) {
    const result = settled[index];
    if (!result) continue;

    if (result.status === 'rejected') {
      degraded.push({
        stage: 'collect',
        sourceId: source.id,
        message: `${source.name} could not be fetched: ${errorMessage(result.reason)}`,
      });
      continue;
    }

    const before = items.length;
    for (const entry of result.value.items ?? []) {
      const title = (entry.title ?? '').trim();
      if (!title) continue;
      const url = (entry.link ?? '').trim();
      if (!url) continue;

      items.push({
        sourceId: source.id,
        sourceKind: source.kind,
        title,
        url,
        publishedAt: entry.isoDate ?? entry.pubDate ?? '',
        excerpt: entry.contentSnippet ?? entry.content ?? entry.summary,
      });
    }

    if (items.length === before) {
      degraded.push({
        stage: 'collect',
        sourceId: source.id,
        message: `${source.name} returned no items`,
      });
    } else {
      sourcesOk++;
    }
  }

  return { items, degraded, sourcesOk };
}
