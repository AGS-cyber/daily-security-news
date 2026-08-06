import { collectRss } from './collect/rss.js';
import { sources } from './config/sources.js';
import { createClient, sumUsage } from './llm/client.js';
import { dedupe } from './pipeline/dedupe.js';
import { filter } from './pipeline/filter.js';
import { normalize } from './pipeline/normalize.js';
import { select } from './pipeline/select.js';
import { write } from './pipeline/write.js';
import { writeEdition } from './render/edition.js';
import { writeSite } from './render/site.js';
import { loadSeen } from './store/seen.js';
import type {
  ArticleEdition,
  DegradedNotice,
  Edition,
  Item,
  Selection,
  Usage,
} from './types.js';

const SEEN_PATH = 'data/seen.json';
const EDITIONS_DIR = 'data/editions';
const SITE_DIR = 'site';

/** The article-only half of an ArticleEdition; the rest is common to both modes. */
type ArticleParts = Omit<
  ArticleEdition,
  'date' | 'generatedAt' | 'degraded' | 'stats' | 'mode'
>;

/**
 * Runs the two LLM stages. Returns null when the article could not be written,
 * having appended a disclosed degraded notice (§8) — the run still publishes,
 * as a digest edition.
 */
async function writeArticle(
  candidates: Item[],
  degraded: DegradedNotice[],
): Promise<ArticleParts | null> {
  function fallback(stage: 'select' | 'write', why: string): null {
    degraded.push({
      stage,
      message: `The written article could not be generated: ${stage} failed — ${why}. This page is the chronological digest of everything collected instead.`,
    });
    console.log(`${stage.padEnd(12)}FAILED (${why}) — falling back to digest`);
    return null;
  }

  const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

  const created = createClient();
  if (!created.ok) return fallback('select', created.reason);
  const { client } = created;
  if (candidates.length === 0) return fallback('select', 'there are no stories to select from');

  let selections: Selection[];
  let selectUsage: Usage;
  try {
    const result = await select(candidates, client);
    selections = result.selections;
    selectUsage = result.usage;
  } catch (err) {
    return fallback('select', reason(err));
  }
  console.log(
    `select      ${selections.length} stories · $${selectUsage.estimatedCostUsd.toFixed(4)}`,
  );

  const byId = new Map(candidates.map((item) => [item.id, item]));
  const selected = selections
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((selection) => ({ ...byId.get(selection.id)!, ...selection }));

  try {
    const written = await write(selected, client);
    const words = written.bodyMarkdown.split(/\s+/).filter(Boolean).length;
    console.log(`write       ${words} words · $${written.usage.estimatedCostUsd.toFixed(4)}`);

    const chosen = new Set(selected.map((story) => story.id));
    return {
      headline: written.headline,
      standfirst: written.standfirst,
      bodyMarkdown: written.bodyMarkdown,
      selected,
      alsoCollected: candidates.filter((item) => !chosen.has(item.id)),
      usage: sumUsage(selectUsage, written.usage),
    };
  } catch (err) {
    return fallback('write', reason(err));
  }
}

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

  const base = {
    date,
    generatedAt: now.toISOString(),
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

  const article = await writeArticle(items, degraded);
  const edition: Edition = article
    ? { ...base, mode: 'article', ...article }
    : { ...base, mode: 'digest', items };

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
