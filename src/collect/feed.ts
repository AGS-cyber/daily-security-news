import Parser from 'rss-parser';
import { httpUrl } from '../url.js';

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_RETRY_DELAY_MS = 60_000;

export interface FeedOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

class FeedResponseError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null) {
    super(`HTTP ${status}`);
  }
}

class FeedContentError extends Error {}

function retryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function boundedText(response: Response): Promise<string> {
  if (!response.body) throw new FeedContentError('Feed response has no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_FEED_BYTES) throw new FeedContentError('Feed exceeds the 2 MiB response limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(response.headers.get('content-type') ?? '')?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new FeedContentError('Feed has an unsupported or invalid text encoding');
  }
}

/** Bound the complete download, not just receipt of headers; abort closes stalled requests. */
export async function fetchFeed(url: string, options: FeedOptions = {}): Promise<Parser.Output<Parser.Item>> {
  const feedUrl = httpUrl(url);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let xml = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    let failure: unknown;
    try {
      const response = await fetchImpl(feedUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'daily-security-news/0.1', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new FeedResponseError(response.status, retryAfter(response.headers.get('retry-after')));
      }
      xml = await boundedText(response);
      break;
    } catch (err) {
      failure = controller.signal.aborted ? new Error('Feed download timed out') : err;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    const retryable = !(failure instanceof FeedContentError)
      && (!(failure instanceof FeedResponseError) || failure.status === 429 || failure.status >= 500);
    const delay = failure instanceof FeedResponseError ? failure.retryAfterMs ?? 1000 : 1000;
    // Do not retry sooner than requested when Retry-After exceeds this run's budget.
    if (attempt === 1 || !retryable || delay > MAX_RETRY_DELAY_MS) throw failure;
    await sleep(delay);
  }
  // Parsing is outside the transport retry: malformed XML/HTML will not improve on retry.
  return new Parser().parseString(xml);
}
