import { isPlaceholderHeadline } from './pipeline/write.js';
import type { Edition } from './types.js';

export interface HealthIssue { stage: string; sourceId?: string; message: string }

/** Operational health, separate from whether a useful partial edition may publish. */
export function editionHealth(edition: Edition): HealthIssue[] {
  const issues: HealthIssue[] = [...edition.degraded];
  const items = edition.mode === 'article' ? [...edition.selected, ...edition.alsoCollected] : edition.items;
  if (edition.stats.sourcesOk < edition.stats.sourcesConfigured && !issues.some((issue) => issue.stage === 'collect')) {
    issues.push({ stage: 'collect', message: `${edition.stats.sourcesOk}/${edition.stats.sourcesConfigured} sources succeeded without a recorded collection failure` });
  }
  if (edition.mode === 'digest' && items.length > 0 && !issues.some((issue) => ['select', 'write'].includes(issue.stage))) {
    issues.push({ stage: 'write', message: 'Stories were published as a digest without an editorial fallback reason' });
  }
  if (items.length !== edition.stats.published) {
    issues.push({ stage: 'record', message: `Published count ${edition.stats.published} differs from ${items.length} stored stories` });
  }
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    issues.push({ stage: 'record', message: 'Edition contains duplicate story IDs' });
  }
  if (edition.mode === 'article') {
    if (isPlaceholderHeadline(edition.headline)) issues.push({ stage: 'write', message: 'Article has a placeholder headline' });
    const known = new Set(edition.selected.map((item) => item.id));
    const cited = new Set([...edition.bodyMarkdown.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]!.trim()));
    if ([...known].some((id) => !cited.has(id)) || [...cited].some((id) => !known.has(id))) {
      issues.push({ stage: 'write', message: 'Body citations do not match selected stories' });
    }
  }
  return issues;
}

export function auditEditions(editions: Edition[]) {
  const ordered = editions.slice().sort((a, b) => a.date.localeCompare(b.date));
  const records = ordered.map((edition) => ({ date: edition.date, mode: edition.mode, issues: editionHealth(edition) }));
  const missingDates: string[] = [];
  const dates = new Set(ordered.map((edition) => edition.date));
  if (ordered.length > 0) {
    const last = ordered.at(-1)!.date;
    for (let day = new Date(`${ordered[0]!.date}T00:00:00Z`); day.toISOString().slice(0, 10) <= last; day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10);
      if (!dates.has(date)) missingDates.push(date);
    }
  }
  const recurring = new Map<string, { stage: string; sourceId?: string; dates: string[] }>();
  for (const record of records) {
    for (const issue of record.issues) {
      const key = `${issue.stage}/${issue.sourceId ?? ''}`;
      const group = recurring.get(key) ?? { stage: issue.stage, sourceId: issue.sourceId, dates: [] };
      if (!group.dates.includes(record.date)) group.dates.push(record.date);
      recurring.set(key, group);
    }
  }
  return { editions: records.length, first: ordered[0]?.date, last: ordered.at(-1)?.date,
    degradedEditions: records.filter((record) => record.issues.length > 0).length,
    digestEditions: records.filter((record) => record.mode === 'digest').length,
    missingDates, recurring: [...recurring.values()], records: records.filter((record) => record.issues.length > 0) };
}
