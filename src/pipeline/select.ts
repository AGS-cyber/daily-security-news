import { z } from 'zod';
import type { DeepSeekClient } from '../llm/client.js';
import type { Item, Selection, Usage } from '../types.js';

const SECTIONS = ['exploited', 'vulnerabilities', 'breaches', 'research', 'industry'] as const;

/** More than this means the model ignored the brief entirely. */
const MAX_SELECTIONS = 12;

const responseSchema = z.object({
  selections: z.array(
    z.object({
      id: z.string(),
      section: z.enum(SECTIONS),
      rank: z.number().int(),
      angle: z.string(),
    }),
  ),
});

/** Stable instruction block — goes first, per §6's cache ordering. */
const SYSTEM = `You are the editor of a daily security news briefing for a
security-literate readership. You are given the stories collected in the last
window and you decide which of them the briefing covers.

Choose 6 to 8 stories. This is a range, not a quota: on a quiet day choose
fewer rather than padding the briefing with stories that do not matter.
Everything you do not choose is still listed on the page, so nothing is lost
by leaving a story out.

Assign each chosen story exactly one section:
- "exploited"       — actively exploited in the wild
- "vulnerabilities" — newly disclosed flaws, patches, advisories
- "breaches"        — intrusions, data exposure, extortion
- "research"        — technique, tooling, malware and threat-actor analysis
- "industry"        — policy, regulation, business, law enforcement

Rank the stories, 1 being the lead story of the briefing, with no ties.
For each story write "angle": one line on why it matters today.

Refer to every story only by the id you were given. Never invent an id.

Reply with json only, no prose and no code fences, in exactly this shape:

{"selections":[{"id":"s7","section":"exploited","rank":1,"angle":"why this matters today"}]}`;

function promptFor(items: Item[]): string {
  const lines = items.map((item) =>
    JSON.stringify({
      id: item.id,
      title: item.title,
      sourceId: item.sourceId,
      publishedAt: item.publishedAt,
      excerpt: item.excerpt ?? '',
      alsoCoveredBy: item.alsoCoveredBy.length,
    }),
  );
  return `Candidate stories (one json object per line; "alsoCoveredBy" is how many other outlets carried the same story):\n\n${lines.join('\n')}`;
}

/** Validation failures are hard errors — the caller retries the stage or falls back (§8). */
export class SelectionInvalidError extends Error {
  override name = 'SelectionInvalidError';
}

export function parseSelections(text: string, items: Item[]): Selection[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new SelectionInvalidError(
      `select returned text that is not JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SelectionInvalidError(`select returned JSON of the wrong shape: ${parsed.error.message}`);
  }

  const { selections } = parsed.data;

  // Empty is a failure, never "nothing happened today" (§6).
  if (selections.length === 0) {
    throw new SelectionInvalidError('select returned an empty selections array');
  }
  if (selections.length > MAX_SELECTIONS) {
    throw new SelectionInvalidError(
      `select returned ${selections.length} stories, more than the ${MAX_SELECTIONS} allowed`,
    );
  }

  const known = new Set(items.map((item) => item.id));
  const seen = new Set<string>();
  for (const selection of selections) {
    if (!known.has(selection.id)) {
      throw new SelectionInvalidError(`select chose id "${selection.id}", which is not in this run`);
    }
    if (seen.has(selection.id)) {
      throw new SelectionInvalidError(`select chose id "${selection.id}" more than once`);
    }
    seen.add(selection.id);
  }

  return selections;
}

export async function select(
  items: Item[],
  client: DeepSeekClient,
): Promise<{ selections: Selection[]; usage: Usage }> {
  const user = promptFor(items);
  let lastError: SelectionInvalidError | undefined;

  // §8: an invalid response is retried exactly once before the stage gives up.
  // Transport and empty-content retries live in the client.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await client.complete({ system: SYSTEM, user, responseFormatJson: true });
    try {
      return { selections: parseSelections(result.text, items), usage: result.usage };
    } catch (err) {
      if (!(err instanceof SelectionInvalidError)) throw err;
      lastError = err;
    }
  }

  throw lastError ?? new SelectionInvalidError('select failed');
}
