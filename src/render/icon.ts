import { PALETTE } from './palette.js';

/**
 * The tab icon — the app's launcher mark, drawn again in SVG.
 *
 * `$_` in phosphor green on the site's background: `$` is the sigil before
 * every `h1` and the tail of `root@sec:~$`, so the mark is drawn from the
 * product rather than invented for it. It was drawn first for the app
 * (`app.md` §11) and this is the same glyph, not a second one.
 *
 * It mirrors the *legacy* launcher variant rather than the adaptive one. A
 * browser tab crops nothing, exactly like a pre-API-26 launcher, so the glyph
 * is scaled up the same 1.45× about the centre. At the adaptive scale — drawn
 * small because a launcher mask crops it — it would sit in a wide margin and
 * look shrunken.
 *
 * The path data is copied verbatim from
 * `app/androidApp/src/main/res/mipmap/ic_launcher.xml` so the two files can be
 * diffed by eye. Nothing ties them: the mark is hand-mirrored across
 * TypeScript and Android resources for the same reason the palette is
 * (`palette.ts`), so a change to the glyph has to be made in three files.
 *
 * **`fill="none"` is load-bearing.** An Android `<vector>` path defaults to no
 * fill; an SVG path defaults to *black*. Without it each stroke fills its own
 * outline and the `$` comes out a black blob on a black square — a mark that
 * renders, and is wrong.
 *
 * No scanlines, for the reason the launcher icon has none: one line every
 * three pixels is texture on a page and moiré at 16px.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">
<path d="M0,0h108v108h-108z" fill="${PALETTE.bg}"/>
<g fill="none" stroke="${PALETTE.bright}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" transform="translate(54 54) scale(1.45) translate(-54 -54)">
<path d="M 54 44 C 54 36 43 32.5 36 36 C 29.5 39.5 29.5 48 37.5 52 C 46 56 54 59.5 53 66.5 C 52 73.5 40.5 75.5 33 71"/>
<path d="M 41.5 27 L 41.5 80"/>
<path d="M 64.5 71.5 L 78.5 71.5"/>
</g>
</svg>`;

/**
 * The icon inlined into every document rather than served as `/favicon.svg`.
 *
 * The page already carries its whole stylesheet inline and makes no other
 * subresource request; half a kilobyte of mark is not the thing to break that
 * for. Inlining also means no file to write into `site/` and no path to
 * resolve, which matters because the pages are flat but the JSON records are a
 * directory deeper.
 *
 * `encodeURIComponent` rather than hand-escaping: the SVG carries `#`, `<`,
 * `>` and `"`, which end the URL or the attribute early.
 */
export const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(SVG)}`;
