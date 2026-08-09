/**
 * The green-phosphor palette (design.md §2). One definition, two consumers:
 * `html.ts` interpolates these into its `:root` custom properties, and
 * `email.ts` inlines them into `style` attributes because email clients have
 * no custom-property support worth relying on.
 *
 * This module exists to stop that second consumer becoming a second copy.
 * The palette is *still* hand-mirrored outside TypeScript — `ui/Theme.kt` and
 * `androidApp/res/values/colors.xml` in the app (app.md §11) — because no
 * compiler tie crosses TypeScript, Kotlin and Android resources. Three copies
 * rather than four; a colour changed here has to reach the other two by hand.
 */
export const PALETTE = {
  bg: '#080b08',
  fg: '#c9f5d5',
  bright: '#7dffa4',
  muted: '#6aa87f',
  dim: '#4a7f5e',
  rule: '#1e3327',
  link: '#79dfff',
  warn: '#ffb642',
  warnBg: '#1e1505',
  warnFg: '#ffdca6',
  note: '#79dfff',
  noteBg: '#06181f',
} as const;

/**
 * The monospace stack. `design.md` §2 says monospace throughout, and the list
 * is the same one both surfaces need — a font stack is a palette-shaped
 * constant even though it isn't a colour.
 *
 * **The family names are single-quoted, and that is load-bearing.** In
 * `html.ts` this lands inside a `<style>` block where either quote works, but
 * `email.ts` inlines it into a double-quoted `style="…"` attribute — where a
 * double quote closes the attribute at `"SF Mono"` and silently discards every
 * declaration after it. The page still renders; it just loses its font, size,
 * line height and colour, which is the "looks fine but is wrong" failure
 * CLAUDE.md ranks last. CSS accepts single quotes, so one form serves both.
 */
export const MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
