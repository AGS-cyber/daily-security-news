import { sources } from '../config/sources.js';
import type { Cluster, NormalizedItem } from '../types.js';
import { extractCveIds } from '../vulnerability/extract.js';

const SIMILARITY_THRESHOLD = 0.6;
const FUZZY_WINDOW_MS = 48 * 60 * 60 * 1000;

const STOPWORDS = new Set(
  'the a an and or of in on for to with new says after from that this is are as at by its it has have been was were be'.split(
    ' ',
  ),
);

const sourceNames = new Map(sources.map((s) => [s.id, s.name]));

function displayName(sourceId: string): string {
  return sourceNames.get(sourceId) ?? sourceId;
}

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, '-')
      .replace(/\bCVE-\d{4}-\d{4,19}\b/gi, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function compare(a: NormalizedItem, b: NormalizedItem): number {
  return a.publishedAt.localeCompare(b.publishedAt)
    || a.canonicalUrl.localeCompare(b.canonicalUrl)
    || a.sourceId.localeCompare(b.sourceId)
    || a.title.localeCompare(b.title);
}

function buildCluster(members: NormalizedItem[]): Cluster {
  const ordered = [...members].sort(compare);
  const primary = ordered[0]!;

  const alsoCoveredBy: Cluster['alsoCoveredBy'] = [];
  const seenSources = new Set([primary.sourceId]);
  for (const member of ordered.slice(1)) {
    if (seenSources.has(member.sourceId)) continue;
    seenSources.add(member.sourceId);
    alsoCoveredBy.push({
      sourceId: member.sourceId,
      name: displayName(member.sourceId),
      url: member.url,
    });
  }

  return { ...primary, alsoCoveredBy, members: ordered };
}

interface UrlGroup {
  members: NormalizedItem[];
  tokens: Set<string>;
  cves: Set<string>;
}

function urlGroup(members: NormalizedItem[]): UrlGroup {
  const cves = new Set<string>();
  for (const member of members) {
    let url = member.url;
    try { url = decodeURIComponent(url); } catch { /* Retain the original URL text. */ }
    for (const id of extractCveIds(`${member.title} ${member.excerpt ?? ''} ${url}`)) cves.add(id);
  }
  return { members, tokens: tokenize(members[0]!.title), cves };
}

function sameStory(a: UrlGroup, b: UrlGroup): boolean {
  // A publisher's separate posts can be follow-ups. Exact URLs already collapsed.
  if (a.members.some(left => b.members.some(right => left.sourceId === right.sourceId))) return false;
  const dates = [...a.members, ...b.members].map(member => Date.parse(member.publishedAt));
  if (Math.max(...dates) - Math.min(...dates) > FUZZY_WINDOW_MS) return false;
  // Contradictory CVE evidence wins over generic headline similarity. Missing IDs
  // are not evidence of agreement, so every URL group must pass this pairwise test.
  if (a.cves.size && b.cves.size && ![...a.cves].some(id => b.cves.has(id))) return false;
  return jaccard(a.tokens, b.tokens) >= SIMILARITY_THRESHOLD;
}

export function dedupe(items: NormalizedItem[]): Cluster[] {
  // Pass 1 — exact canonical URL.
  const byUrl = new Map<string, NormalizedItem[]>();
  for (const item of [...items].sort(compare)) {
    const group = byUrl.get(item.canonicalUrl);
    if (group) group.push(item);
    else byUrl.set(item.canonicalUrl, [item]);
  }

  // Pass 2 — title similarity across the URL groups.
  const groups: UrlGroup[][] = [];
  for (const members of byUrl.values()) {
    const candidate = urlGroup(members);
    const match = groups.find(group => group.every(existing => sameStory(existing, candidate)));
    if (match) match.push(candidate);
    else groups.push([candidate]);
  }

  return groups.map(group => buildCluster(group.flatMap(entry => entry.members)));
}
