import type { Item, Selection } from '../types.js';
import { escapeHtml } from './escape.js';

const CITATION = /\[\[([^\]]+)\]\]/g;

/**
 * Replace every [[id]] with an HTML anchor. An anchor rather than a Markdown
 * link because titles routinely contain `]`, `)` and `*`, which would corrupt
 * Markdown link syntax; `marked` passes inline HTML through unchanged.
 */
export function substituteCitations(markdown: string, selected: (Item & Selection)[]): string {
  const byId = new Map(selected.map((story) => [story.id, story]));

  return markdown.replace(CITATION, (_match, rawId: string) => {
    const story = byId.get(rawId.trim());
    // Validation should have caught this upstream; reaching here is a bug.
    if (!story) {
      throw new Error(`citation [[${rawId}]] has no matching selected story`);
    }
    return `<a href="${escapeHtml(story.url)}">${escapeHtml(story.title)}</a>`;
  });
}
