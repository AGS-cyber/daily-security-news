package dev.dailysecuritynews.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

/**
 * The green-phosphor terminal palette, transcribed from the `:root` custom
 * properties of the `CSS` constant in `src/render/html.ts`.
 *
 * **This is a hand-maintained mirror with no compiler tie to the CSS.** It is
 * the same drift risk `docs/app.md` §4 describes for the Kotlin models versus
 * `src/types.ts`: nothing here fails to build when the site's stylesheet
 * changes. A palette change on the site has to be repeated here by hand, or
 * the app quietly stops matching the product it is a second reader for.
 *
 * Dark only — `docs/design.md` §2. There is no light variant of a CRT, so
 * there is no light palette, no toggle, and no `isSystemInDarkTheme()`.
 */
internal object Terminal {
    /** `--bg` */
    val bg = Color(0xFF080B08)

    /** `--fg` */
    val fg = Color(0xFFC9F5D5)

    /** `--bright` */
    val bright = Color(0xFF7DFFA4)

    /** `--muted` */
    val muted = Color(0xFF6AA87F)

    /** `--dim` */
    val dim = Color(0xFF4A7F5E)

    /** `--rule` */
    val rule = Color(0xFF1E3327)

    /** `--link` */
    val link = Color(0xFF79DFFF)

    /** `--warn` */
    val warn = Color(0xFFFFB642)

    /** `--warn-bg` */
    val warnBg = Color(0xFF1E1505)

    /** `--warn-fg` */
    val warnFg = Color(0xFFFFDCA6)

    /** `--note` */
    val note = Color(0xFF79DFFF)

    /** `--note-bg` */
    val noteBg = Color(0xFF06181F)
}

/**
 * The site's `text-shadow: 0 0 12px rgba(125,255,164,.3)` — the phosphor glow
 * on `h1` and the brand lockup.
 */
internal val PhosphorGlow = Shadow(
    color = Terminal.bright.copy(alpha = 0.3f),
    offset = Offset.Zero,
    blurRadius = 12f,
)

private val TerminalColorScheme = darkColorScheme(
    background = Terminal.bg,
    onBackground = Terminal.fg,
    surface = Terminal.bg,
    onSurface = Terminal.fg,
    surfaceVariant = Terminal.bg,
    onSurfaceVariant = Terminal.muted,
    primary = Terminal.bright,
    onPrimary = Terminal.bg,
    secondary = Terminal.link,
    onSecondary = Terminal.bg,
    outline = Terminal.dim,
    outlineVariant = Terminal.rule,
    error = Terminal.warn,
    onError = Terminal.bg,
    errorContainer = Terminal.warnBg,
    onErrorContainer = Terminal.warnFg,
    tertiaryContainer = Terminal.noteBg,
    onTertiaryContainer = Terminal.note,
)

/**
 * Every style in [base], monospaced. `docs/design.md` §2 says "monospace
 * throughout", and a style missed here keeps the platform sans face silently —
 * which is why this is exhaustive rather than a subset of the styles the app
 * happens to use today.
 *
 * [FontFamily.Monospace] resolves to each platform's own monospace face. No
 * font file is bundled: that is a large binary for something both platforms
 * already ship.
 */
internal fun monospaceTypography(base: Typography = Typography()): Typography = base.copy(
    displayLarge = base.displayLarge.copy(fontFamily = FontFamily.Monospace),
    displayMedium = base.displayMedium.copy(fontFamily = FontFamily.Monospace),
    displaySmall = base.displaySmall.copy(fontFamily = FontFamily.Monospace),
    headlineLarge = base.headlineLarge.copy(fontFamily = FontFamily.Monospace),
    headlineMedium = base.headlineMedium.copy(fontFamily = FontFamily.Monospace),
    headlineSmall = base.headlineSmall.copy(fontFamily = FontFamily.Monospace),
    titleLarge = base.titleLarge.copy(fontFamily = FontFamily.Monospace),
    titleMedium = base.titleMedium.copy(fontFamily = FontFamily.Monospace),
    titleSmall = base.titleSmall.copy(fontFamily = FontFamily.Monospace),
    bodyLarge = base.bodyLarge.copy(fontFamily = FontFamily.Monospace),
    bodyMedium = base.bodyMedium.copy(fontFamily = FontFamily.Monospace),
    bodySmall = base.bodySmall.copy(fontFamily = FontFamily.Monospace),
    labelLarge = base.labelLarge.copy(fontFamily = FontFamily.Monospace),
    labelMedium = base.labelMedium.copy(fontFamily = FontFamily.Monospace),
    labelSmall = base.labelSmall.copy(fontFamily = FontFamily.Monospace),
)

@Composable
fun DailySecurityNewsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = TerminalColorScheme,
        typography = monospaceTypography(),
        content = content,
    )
}

/**
 * The site's fixed scanline overlay:
 *
 * ```
 * repeating-linear-gradient(to bottom, rgba(0,0,0,.20) 0 1px, transparent 1px 3px)
 * ```
 *
 * — a 1px black line at 20% opacity every 3px.
 *
 * Drawn with `drawWithContent` rather than an overlay `Box` because the site's
 * overlay is `pointer-events: none`: a `Box` would swallow every touch on the
 * screen underneath it, and a draw modifier cannot. Sizes are `dp`, so the
 * overlay scales with density the way CSS px does.
 */
fun Modifier.scanlines(): Modifier = drawWithContent {
    drawContent()
    val line = 1.dp.toPx()
    val period = 3.dp.toPx()
    if (period <= 0f) return@drawWithContent
    var y = 0f
    while (y < size.height) {
        drawRect(
            color = Color.Black,
            topLeft = Offset(0f, y),
            size = Size(size.width, line),
            alpha = 0.20f,
        )
        y += period
    }
}

/** The block cursor character, U+2588 — `h1::after { content: "\2588" }`. */
private const val CURSOR = "█"

/**
 * The current alpha of the blinking block cursor the site puts after `h1`:
 *
 * ```
 * h1::after { content: "\2588"; animation: blink 1.1s steps(1) infinite; }
 * ```
 *
 * `steps(1)` snaps rather than fades, so the alpha is held flat across each
 * half of the 1.1s period instead of tweened across it.
 *
 * Under reduce-motion the site sets `animation: none`, which leaves the block
 * showing — so this returns a constant, fully opaque alpha rather than hiding
 * the block.
 *
 * This returns a value rather than drawing anything, because the cursor is
 * `::after` on the site: it has to follow the *last character* of a wrapped
 * heading, which only text layout can place. A sibling composable renders
 * beside the heading's first line instead, at the far right of its box. So the
 * caller appends [appendCursor] into the heading's own [AnnotatedString] and
 * text layout does the placing.
 */
@Composable
fun cursorAlpha(): Float {
    if (prefersReducedMotion()) return 1f
    val transition = rememberInfiniteTransition(label = "cursor")
    val animated by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 1100
                // Held flat, then dropped in a single frame: `steps(1)`.
                1f at 0 using LinearEasing
                1f at 549 using LinearEasing
                0f at 550 using LinearEasing
                0f at 1099 using LinearEasing
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "cursorAlpha",
    )
    return animated
}

/**
 * Appends the block cursor as a trailing span at [alpha], from [cursorAlpha].
 *
 * No separating space: a space is a real character that takes part in
 * wrapping, and the site uses a `.15ch` margin rather than one. The blink is
 * the span's colour alpha, so the annotated string is rebuilt as the alpha
 * changes — the glyph keeps its place in the layout either way, which is what
 * makes it snap in and out where the text ends.
 */
fun AnnotatedString.Builder.appendCursor(alpha: Float) {
    withStyle(SpanStyle(color = Terminal.bright.copy(alpha = alpha))) {
        append(CURSOR)
    }
}
