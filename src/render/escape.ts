/**
 * Its own module because both `html.ts` and `citations.ts` need it, and
 * `html.ts` imports `citations.ts`. Leaving it in `html.ts` made those two
 * files a cycle — it happened to resolve, but a leaf utility that everything
 * depends on should not sit inside the module with the most dependencies.
 *
 * Every string that reaches a page from a feed goes through here. Feed titles
 * and excerpts routinely contain `&`, `<`, and quotes.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
