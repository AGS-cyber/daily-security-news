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
  stage: 'collect' | 'normalize' | 'filter' | 'select' | 'write';
  sourceId?: string;
  message: string;
}

export type Section =
  | 'exploited'
  | 'vulnerabilities'
  | 'breaches'
  | 'research'
  | 'industry';

/** LLM call 1 output, one entry per selected story. */
export interface Selection {
  id: string;
  section: Section;
  rank: number;
  angle: string;
}

export interface Usage {
  model: string;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

interface EditionBase {
  date: string;
  generatedAt: string;
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

export interface DigestEdition extends EditionBase {
  mode: 'digest';
  items: Item[];
}

export interface ArticleEdition extends EditionBase {
  mode: 'article';
  headline: string;
  standfirst: string;
  /** Cites stories as [[s7]]; render substitutes the real link. */
  bodyMarkdown: string;
  selected: (Item & Selection)[];
  alsoCollected: Item[];
  usage: Usage;
}

export type Edition = DigestEdition | ArticleEdition;
