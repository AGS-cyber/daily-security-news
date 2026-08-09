import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emailEdition } from './render/email.js';
import { loadSent } from './store/sent.js';
import type { Edition } from './types.js';

const EDITIONS_DIR = 'data/editions';
const SENT_PATH = 'data/sent.json';
const PREVIEW_PATH = 'email-preview.html';

const API = 'https://api.buttondown.com/v1/emails';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mail one edition to the newsletter.
 *
 * ```
 * npm run email                        today's edition
 * npm run email -- --date 2026-08-06   a specific one
 * npm run email -- --dry-run           render it, send nothing
 * ```
 *
 * **A failure here is red and that is the whole policy.** Unlike the LLM
 * stages, there is nothing to fall back to: either subscribers received the
 * edition or they did not, and there is no degraded version of a delivered
 * email. Because this runs *after* the publish commit, the site is already
 * live by the time it can fail — the reader on the web loses nothing, the
 * check goes red, and the failure is findable. That is CLAUDE.md's third tier,
 * "fails with a clear error message", which is the best available here.
 */

interface Args {
  date: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  let date = new Date().toISOString().slice(0, 10);
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--date') {
      const value = argv[++i];
      if (value === undefined) throw new Error('--date needs a YYYY-MM-DD value');
      date = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  // The date becomes a file path, and it arrives from a command line.
  if (!DATE.test(date)) throw new Error(`not an ISO date: ${date}`);
  return { date, dryRun };
}

/**
 * The key, or the reason there isn't one. Unset and empty are reported
 * separately for the same reason `createClient()` separates them — `gh secret
 * set` takes its value from a blind paste, so an empty secret is easy to
 * create and invisible afterwards (operations.md §5).
 */
function apiKey(): string {
  const raw = process.env['BUTTONDOWN_API_KEY'];
  if (raw === undefined) throw new Error('BUTTONDOWN_API_KEY is not set');
  const key = raw.trim();
  if (key === '') throw new Error('BUTTONDOWN_API_KEY is set but its value is empty');
  return key;
}

async function send(o: { subject: string; html: string; key: string }): Promise<string> {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${o.key}`,
      'Content-Type': 'application/json',
      // Pin the API version so a future default cannot change what this does.
      'X-API-Version': '2026-04-01',
      // Under 2026-04-01 a POST that asks to send is rejected
      // `sending_requires_confirmation` without this. Sending immediately is
      // exactly the intent: the workflow has already published the edition.
      'X-Buttondown-Live-Dangerously': 'true',
    },
    body: JSON.stringify({
      subject: o.subject,
      body: o.html,
      status: 'about_to_send',
    }),
  });

  // The body carries Buttondown's own error codes, and losing it would leave
  // nothing but a status to debug from.
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${API} failed: ${response.status} ${response.statusText} — ${text}`);
  }

  const parsed: unknown = JSON.parse(text);
  const id = (parsed as { id?: unknown }).id;
  if (typeof id !== 'string') {
    throw new Error(`POST ${API} returned no email id — the response was: ${text}`);
  }
  return id;
}

async function run(): Promise<void> {
  const { date, dryRun } = parseArgs(process.argv.slice(2));

  const editionPath = join(EDITIONS_DIR, `${date}.json`);
  const edition = JSON.parse(await readFile(editionPath, 'utf8')) as Edition;
  const { subject, html } = emailEdition(edition);
  console.log(`render      ${edition.mode} · ${html.length} bytes · "${subject}"`);

  if (dryRun) {
    await writeFile(PREVIEW_PATH, html, 'utf8');
    console.log(`dry-run     wrote ${PREVIEW_PATH} — nothing was sent`);
    return;
  }

  const sent = await loadSent(SENT_PATH);
  const already = sent.sentOn(date);
  if (already) {
    // Not an error: a re-run reaching here is the guard working. Deliberately
    // re-mailing a date means removing its entry from data/sent.json.
    console.log(`sent        ${date} already mailed at ${already.sentAt} (${already.emailId}) — skipping`);
    return;
  }

  const emailId = await send({ subject, html, key: apiKey() });
  sent.record(date, { sentAt: new Date().toISOString(), emailId });
  await sent.save();
  console.log(`sent        ${date} · ${emailId} · ${sent.size} editions mailed to date`);
}

try {
  await run();
} catch (err) {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
}
