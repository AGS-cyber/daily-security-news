export type SourceKind = 'rss';

export interface Source {
  id: string;
  kind: SourceKind;
  name: string;
  feedUrl: string;
}

export interface RawItem {
  sourceId: string;
  sourceKind: SourceKind;
  title: string;
  url: string;
  publishedAt: string;
  excerpt?: string;
}

/** A RawItem that survived normalize. */
export interface NormalizedItem extends RawItem {
  canonicalUrl: string;
  publishedAt: string;
  excerpt?: string;
}

/** One story, possibly reported by several sources. Output of dedupe. */
export interface Cluster extends NormalizedItem {
  alsoCoveredBy: { sourceId: string; name: string; url: string }[];
}

/** A Cluster with its run-stable id. Assigned last, after filter. */
export interface Item extends Cluster {
  id: string;
}

export interface DegradedNotice {
  stage: 'collect' | 'normalize' | 'filter';
  sourceId?: string;
  message: string;
}

export interface Edition {
  date: string;
  generatedAt: string;
  mode: 'digest';
  items: Item[];
  degraded: DegradedNotice[];
  stats: {
    sourcesConfigured: number;
    sourcesOk: number;
    collected: number;
    normalized: number;
    deduped: number;
    published: number;
  };
}
