/**
 * The green-phosphor palette (design.md §2). `html.ts` interpolates these into
 * its `:root` custom properties, and since the email renderer was removed it
 * is the only consumer in TypeScript.
 *
 * The module stays a module anyway, because the palette is hand-mirrored
 * outside TypeScript — `ui/Theme.kt` and `androidApp/res/values/colors.xml` in
 * the app (app.md §11) — where no compiler tie reaches. A colour changed here
 * has to reach those two by hand.
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
 * The monospace stack. `design.md` §2 says monospace throughout; a font stack
 * is a palette-shaped constant even though it isn't a colour.
 *
 * **The family names stay single-quoted.** Inside `html.ts`'s `<style>` block
 * either quote works, so this no longer has teeth — but it did when the email
 * renderer inlined the stack into a double-quoted `style="…"` attribute, where
 * a double quote closed the attribute at `"SF Mono"` and silently discarded
 * every declaration after it (operations.md §5). Anything that inlines these
 * again inherits the safe form rather than rediscovering the bug.
 */
export const MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
