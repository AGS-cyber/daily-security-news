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
  /** Kept in memory until CVE extraction so secondary reports are inspected too. */
  members: NormalizedItem[];
}

export type CveTextField = 'title' | 'excerpt' | 'url';

export interface CveMention {
  sourceId: string;
  url: string;
  field: CveTextField;
}

/** Intermediate deterministic output, removed after authoritative enrichment. */
export interface CveReference {
  id: string;
  mentions: CveMention[];
}

export type ReferencedCluster = Omit<Cluster, 'members'> & {
  cveReferences: CveReference[];
};

export type EnrichmentStatus = 'found' | 'not_found' | 'unavailable';

export interface KevEnrichment {
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string | null;
  notes: string | null;
  cwes: string[];
}

export interface CvssMetric {
  version: string;
  score: number | null;
  severity: string | null;
  vector: string | null;
  source: string | null;
  type: string | null;
}

export interface NvdReference {
  url: string;
  source: string | null;
  tags: string[];
}

export interface AffectedConfiguration {
  criteria: string;
  vulnerable: boolean | null;
  matchCriteriaId: string | null;
  versionStartIncluding: string | null;
  versionStartExcluding: string | null;
  versionEndIncluding: string | null;
  versionEndExcluding: string | null;
}

export interface NvdEnrichment {
  description: string | null;
  cvss: CvssMetric | null;
  cwes: string[];
  published: string | null;
  lastModified: string | null;
  vulnStatus: string | null;
  references: NvdReference[];
  affectedConfigurations: AffectedConfiguration[];
}

export interface VulnerabilityProvenance {
  news: CveMention[];
  cisaKev: {
    status: EnrichmentStatus;
    catalogUrl: string;
    dataUrl: string;
    catalogVersion: string | null;
    dateReleased: string | null;
    retrievedAt: string | null;
  };
  nvd: {
    status: EnrichmentStatus;
    apiUrl: string;
    recordUrl: string;
    retrievedAt: string | null;
  };
}

export interface VulnerabilityIntelligence {
  id: string;
  /** null means KEV was unavailable; false is a confirmed catalog miss. */
  knownExploited: boolean | null;
  kev: KevEnrichment | null;
  nvd: NvdEnrichment | null;
  provenance: VulnerabilityProvenance;
}

export type VulnerabilityPriority =
  | 'known_exploited'
  | 'critical'
  | 'high'
  | 'cve'
  | 'none';

export type EnrichedCluster = Omit<ReferencedCluster, 'cveReferences'> & {
  cves: VulnerabilityIntelligence[];
};

/** An enriched story with its run-stable id. Assigned last, after filter. */
export interface Item extends EnrichedCluster {
  id: string;
}

export interface DegradedNotice {
  stage: 'collect' | 'normalize' | 'filter' | 'enrich' | 'select' | 'write';
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
