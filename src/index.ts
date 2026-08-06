import { collectRss } from './collect/rss.js';
import { sources } from './config/sources.js';
import { dedupe } from './pipeline/dedupe.js';
import { filter } from './pipeline/filter.js';
import { normalize } from './pipeline/normalize.js';
import { writeEdition } from './render/edition.js';
import { writeSite } from './render/site.js';
import { loadSeen } from './store/seen.js';
import type { DegradedNotice, Edition, Item } from './types.js';

const SEEN_PATH = 'data/seen.json';
const EDITIONS_DIR = 'data/editions';
const SITE_DIR = 'site';

async function run(): Promise<void> {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);

  const seen = await loadSeen(SEEN_PATH);

  const collected = await collectRss(sources);
  const degraded: DegradedNotice[] = [...collected.degraded];
  console.log(
    `collect     ${collected.items.length} items · ${collected.sourcesOk}/${sources.length} sources ok`,
  );

  const normalized = normalize(collected.items);
  if (normalized.dropped > 0) {
    degraded.push({
      stage: 'normalize',
      message: `${normalized.dropped} items were dropped as unparseable`,
    });
  }
  console.log(`normalize   ${normalized.items.length} items · ${normalized.dropped} dropped`);

  const clusters = dedupe(normalized.items);
  console.log(`dedupe      ${clusters.length} clusters`);

  const filtered = filter(clusters, seen, now);
  console.log(
    `filter      ${filtered.kept.length} items · ${filtered.droppedSeen} seen · ${filtered.droppedOld} outside window`,
  );

  const items: Item[] = filtered.kept.map((cluster, i) => ({ ...cluster, id: `s${i + 1}` }));

  const edition: Edition = {
    date,
    generatedAt: now.toISOString(),
    mode: 'digest',
    items,
    degraded,
    stats: {
      sourcesConfigured: sources.length,
      sourcesOk: collected.sourcesOk,
      collected: collected.items.length,
      normalized: normalized.items.length,
      deduped: clusters.length,
      published: items.length,
    },
  };

  await writeEdition(edition, EDITIONS_DIR);
  const written = await writeSite(edition, { siteDir: SITE_DIR, editionsDir: EDITIONS_DIR });
  console.log(`render      ${written.join(' ')}`);

  // Only after both writes succeed: an unrendered item must never be marked seen.
  for (const item of items) seen.add(item.canonicalUrl, date);
  await seen.save();
  console.log(`seen        ${seen.size} entries saved`);
}

try {
  await run();
} catch (err) {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
}
