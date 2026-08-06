import { sources } from '../config/sources.js';
import type { Cluster, NormalizedItem } from '../types.js';

const SIMILARITY_THRESHOLD = 0.6;

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

function buildCluster(members: NormalizedItem[]): Cluster {
  const ordered = [...members].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
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

  return { ...primary, alsoCoveredBy };
}

export function dedupe(items: NormalizedItem[]): Cluster[] {
  // Pass 1 — exact canonical URL.
  const byUrl = new Map<string, NormalizedItem[]>();
  for (const item of items) {
    const group = byUrl.get(item.canonicalUrl);
    if (group) group.push(item);
    else byUrl.set(item.canonicalUrl, [item]);
  }

  // Pass 2 — title similarity across the URL groups.
  const groups: { tokens: Set<string>; members: NormalizedItem[] }[] = [];
  for (const members of byUrl.values()) {
    const tokens = tokenize(members[0]!.title);
    const match = groups.find((g) => jaccard(g.tokens, tokens) >= SIMILARITY_THRESHOLD);
    if (match) match.members.push(...members);
    else groups.push({ tokens, members: [...members] });
  }

  return groups.map((g) => buildCluster(g.members));
}
