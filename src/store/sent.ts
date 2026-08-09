import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** What was mailed for one date, and the Buttondown email it became. */
export interface SentRecord {
  sentAt: string;
  emailId: string;
}

export interface SentStore {
  /** The record for [date], or undefined if that edition was never mailed. */
  sentOn(date: string): SentRecord | undefined;
  record(date: string, entry: SentRecord): void;
  save(): Promise<void>;
  size: number;
}

/**
 * The send ledger — the second piece of mutable state this project keeps, and
 * committed for the same reason as `seen.json` (design.md §3).
 *
 * It exists because a send is the one thing here that cannot be undone. Runs
 * are not once-per-day in practice: `workflow_dispatch` exists, publishes get
 * retried, and Actions cron can double-fire. Re-rendering a page twice is
 * invisible; mailing an edition twice is not, and the subscriber is the one
 * who notices. So the send is guarded by a record of what has already gone out.
 *
 * **Nothing is pruned.** `seen.json` drops entries after 30 days because its
 * job is a rolling window, but an expired entry here would let a months-old
 * edition be mailed a second time. One small object per day is a rounding
 * error next to that.
 */
export async function loadSent(filePath: string): Promise<SentStore> {
  let entries: Record<string, SentRecord>;
  try {
    entries = parseStore(await readFile(filePath, 'utf8'), filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`sent        ${filePath} not found — no edition has been mailed yet`);
      entries = {};
    } else {
      throw err;
    }
  }

  return {
    sentOn(date) {
      return entries[date];
    },
    record(date, entry) {
      entries[date] = entry;
    },
    get size() {
      return Object.keys(entries).length;
    },
    async save() {
      const sorted: Record<string, SentRecord> = {};
      for (const date of Object.keys(entries).sort()) sorted[date] = entries[date]!;
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
    },
  };
}

function parseStore(text: string, filePath: string): Record<string, SentRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `${filePath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object of dates to send records`);
  }

  // A malformed ledger throws rather than resetting. A store that quietly
  // came back empty would re-mail every edition it had forgotten.
  for (const [date, value] of Object.entries(parsed)) {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`${filePath} entry "${date}" is not an object`);
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry['sentAt'] !== 'string' || typeof entry['emailId'] !== 'string') {
      throw new Error(`${filePath} entry "${date}" needs string "sentAt" and "emailId" fields`);
    }
  }
  return parsed as Record<string, SentRecord>;
}
