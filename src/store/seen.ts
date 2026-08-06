import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const RETENTION_DAYS = 30;

export interface SeenStore {
  /**
   * True when an *earlier* edition already covered this URL.
   *
   * Deliberately not "have we ever seen this". An item first covered today is
   * still part of today's edition, so a second run on the same date rebuilds
   * that edition instead of finding nothing and rendering an empty page over
   * it. Re-runs — a hand-triggered dispatch, a retry after a failed publish, a
   * cron double-fire — are therefore idempotent within a day.
   */
  publishedBefore(canonicalUrl: string, date: string): boolean;
  add(canonicalUrl: string, date: string): void;
  save(): Promise<void>;
  size: number;
}

function key(canonicalUrl: string): string {
  return createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 16);
}

function parseStore(text: string, filePath: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `${filePath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object of string keys to string dates`);
  }
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string') {
      throw new Error(`${filePath} entry "${k}" is not a string date`);
    }
  }
  return parsed as Record<string, string>;
}

export async function loadSeen(filePath: string): Promise<SeenStore> {
  let entries: Record<string, string>;
  try {
    entries = parseStore(await readFile(filePath, 'utf8'), filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`seen        ${filePath} not found — starting with an empty store (first run)`);
      entries = {};
    } else {
      throw err;
    }
  }

  return {
    publishedBefore(canonicalUrl, date) {
      const covered = entries[key(canonicalUrl)];
      return covered !== undefined && covered < date;
    },
    add(canonicalUrl, date) {
      entries[key(canonicalUrl)] = date;
    },
    get size() {
      return Object.keys(entries).length;
    },
    async save() {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const pruned: Record<string, string> = {};
      for (const k of Object.keys(entries).sort()) {
        const date = entries[k]!;
        if (date >= cutoff) pruned[k] = date;
      }
      entries = pruned;
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(pruned, null, 2) + '\n', 'utf8');
    },
  };
}
