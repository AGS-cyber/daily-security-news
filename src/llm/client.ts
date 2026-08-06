import OpenAI from 'openai';
import type { Usage } from '../types.js';

const MODEL = 'deepseek-v4-flash';
const BASE_URL = 'https://api.deepseek.com';

/** USD per million tokens, design §6, deepseek-v4-flash. */
const PRICE_PER_MILLION = {
  cacheHit: 0.0028,
  cacheMiss: 0.14,
  output: 0.28,
};

export interface LlmResult {
  text: string;
  usage: Usage;
}

/** The LLM stage failed after its one retry. Callers fall back per §8. */
export class LlmUnavailableError extends Error {
  override name = 'LlmUnavailableError';
}

function readTokenCount(usage: unknown, field: string): number {
  if (typeof usage !== 'object' || usage === null) return 0;
  const value = (usage as Record<string, unknown>)[field];
  // Absent means unknown; record 0 rather than guessing.
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function accountUsage(rawUsage: unknown): Usage {
  const promptCacheHitTokens = readTokenCount(rawUsage, 'prompt_cache_hit_tokens');
  const promptCacheMissTokens = readTokenCount(rawUsage, 'prompt_cache_miss_tokens');
  const outputTokens = readTokenCount(rawUsage, 'completion_tokens');

  const estimatedCostUsd =
    (promptCacheHitTokens * PRICE_PER_MILLION.cacheHit +
      promptCacheMissTokens * PRICE_PER_MILLION.cacheMiss +
      outputTokens * PRICE_PER_MILLION.output) /
    1_000_000;

  return {
    model: MODEL,
    promptCacheHitTokens,
    promptCacheMissTokens,
    outputTokens,
    estimatedCostUsd,
  };
}

export function sumUsage(a: Usage, b: Usage): Usage {
  return {
    model: a.model,
    promptCacheHitTokens: a.promptCacheHitTokens + b.promptCacheHitTokens,
    promptCacheMissTokens: a.promptCacheMissTokens + b.promptCacheMissTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
  };
}

export interface DeepSeekClient {
  /**
   * The stable instruction block belongs in `system` and the volatile per-run
   * data in `user` — §6's prompt-cache ordering.
   */
  complete(o: {
    system: string;
    user: string;
    responseFormatJson?: boolean;
  }): Promise<LlmResult>;
}

/** The client, or the reason there is not one. */
export type ClientOrReason =
  | { ok: true; client: DeepSeekClient }
  | { ok: false; reason: string };

/**
 * Never throws at construction — an unusable credential is a disclosed
 * fallback (§8), not a crash.
 *
 * **Unset and empty are reported separately on purpose.** They produce the
 * same outcome but are different mistakes, and `gh secret set` takes its value
 * from a blind paste, so an empty secret is easy to create and invisible
 * afterwards. Collapsing the two once cost a run: the banner read "is not set"
 * while the secret plainly existed, which sent the search to the workflow file
 * instead of the stored value. See operations.md §5.
 */
export function createClient(): ClientOrReason {
  const raw = process.env['DEEPSEEK_API_KEY'];
  if (raw === undefined) return { ok: false, reason: 'DEEPSEEK_API_KEY is not set' };

  const apiKey = raw.trim();
  if (apiKey === '') {
    return { ok: false, reason: 'DEEPSEEK_API_KEY is set but its value is empty' };
  }

  const openai = new OpenAI({ apiKey, baseURL: BASE_URL });

  const client: DeepSeekClient = {
    async complete(o) {
      let lastError = '';

      // One attempt, then exactly one retry (§8).
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await openai.chat.completions.create({
            model: MODEL,
            messages: [
              { role: 'system', content: o.system },
              { role: 'user', content: o.user },
            ],
            ...(o.responseFormatJson ? { response_format: { type: 'json_object' as const } } : {}),
          });

          const text = response.choices[0]?.message?.content ?? '';
          // §6: DeepSeek may return empty content. Never read that as "no news".
          if (text.trim() === '') {
            lastError = 'the API returned empty content';
            continue;
          }

          return { text, usage: accountUsage(response.usage) };
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      throw new LlmUnavailableError(`DeepSeek request failed twice: ${lastError}`);
    },
  };

  return { ok: true, client };
}
