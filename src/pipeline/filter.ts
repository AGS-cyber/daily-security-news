import type { SeenStore } from '../store/seen.js';
import type { Cluster } from '../types.js';

/**
 * An item is eligible until it is 7 days old (design §3). There is no separate
 * 24-hour window: the seen store already drops anything covered by an earlier
 * edition, so "published in the last 24 hours" is a strict subset of "unseen
 * and under 7 days" and never decides an item's fate on its own.
 */
const ELIGIBILITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function filter(
  clusters: Cluster[],
  seen: SeenStore,
  now: Date,
): { kept: Cluster[]; droppedSeen: number; droppedOld: number } {
  const kept: Cluster[] = [];
  const date = now.toISOString().slice(0, 10);
  let droppedSeen = 0;
  let droppedOld = 0;

  for (const cluster of clusters) {
    if (seen.publishedBefore(cluster.canonicalUrl, date)) {
      droppedSeen++;
      continue;
    }
    const age = now.getTime() - new Date(cluster.publishedAt).getTime();
    if (age < ELIGIBILITY_WINDOW_MS) kept.push(cluster);
    else droppedOld++;
  }

  kept.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { kept, droppedSeen, droppedOld };
}
