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

/** Returns null when DEEPSEEK_API_KEY is unset. Never throws at construction. */
export function createClient(): DeepSeekClient | null {
  const apiKey = process.env['DEEPSEEK_API_KEY']?.trim();
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey, baseURL: BASE_URL });

  return {
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
}
