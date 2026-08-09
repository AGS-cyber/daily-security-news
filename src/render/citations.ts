import type { Item, Selection } from '../types.js';
import { escapeHtml } from './escape.js';

const CITATION = /\[\[([^\]]+)\]\]/g;

/**
 * Replace every [[id]] with an HTML anchor. An anchor rather than a Markdown
 * link because titles routinely contain `]`, `)` and `*`, which would corrupt
 * Markdown link syntax; `marked` passes inline HTML through unchanged.
 *
 * That pass-through is exactly why [linkStyle] exists. Because the anchor is
 * raw HTML, `marked` never routes it through a custom `link` renderer — so the
 * email renderer, which styles every element inline, cannot reach these
 * anchors any other way. The page passes nothing and gets the same markup it
 * always did; email passes its inline style.
 */
export function substituteCitations(
  markdown: string,
  selected: (Item & Selection)[],
  linkStyle?: string,
): string {
  const byId = new Map(selected.map((story) => [story.id, story]));
  const style = linkStyle ? ` style="${escapeHtml(linkStyle)}"` : '';

  return markdown.replace(CITATION, (_match, rawId: string) => {
    const story = byId.get(rawId.trim());
    // Validation should have caught this upstream; reaching here is a bug.
    if (!story) {
      throw new Error(`citation [[${rawId}]] has no matching selected story`);
    }
    return `<a href="${escapeHtml(story.url)}"${style}>${escapeHtml(story.title)}</a>`;
  });
}
