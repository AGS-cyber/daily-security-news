package dev.dailysecuritynews.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Which of the site's two banner boxes this is. The web has exactly two —
 * `.degraded` and `.notice` — and the app has three call sites, which is why
 * the kind and the label are separate: an `error: Boolean` could not say that
 * "offline" and "degraded" are both `.degraded` boxes with different labels.
 */
enum class BannerKind { Warn, Note }

/**
 * A disclosure banner, shared by the edition and archive screens so a stale
 * archive and a stale edition cannot end up looking different from each other.
 *
 * Loud on purpose. `CLAUDE.md` ranks a disclosed fallback above a clean
 * failure only when the reader can actually see the disclosure.
 *
 * [label] is the site's literal bracket label — `[ !! DEGRADED ]`,
 * `[ NOTICE ]` — drawn as a letter-spaced block above the content, matching
 * `.degraded::before` / `.notice::before`. An outlined box, not a `Card`: the
 * site's banners are 1px borders, and Material's elevation has no counterpart
 * on a page that is flat by design.
 */
@Composable
fun Banner(
    label: String,
    kind: BannerKind,
    title: String,
    lines: List<String>,
) {
    val accent: Color
    val background: Color
    val content: Color
    when (kind) {
        BannerKind.Warn -> {
            accent = Terminal.warn
            background = Terminal.warnBg
            content = Terminal.warnFg
        }

        BannerKind.Note -> {
            accent = Terminal.note
            background = Terminal.noteBg
            content = Terminal.fg
        }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(BorderStroke(1.dp, accent))
            .background(background)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                color = accent,
                letterSpacing = 0.12.em,
                // `.72rem` against the site's 16px base.
                fontSize = 11.5.sp,
                textAlign = TextAlign.Start,
            ),
            modifier = Modifier.padding(bottom = 8.dp),
        )
        Text(title, style = MaterialTheme.typography.titleSmall, color = content)
        for (line in lines) {
            Text(
                text = line,
                style = MaterialTheme.typography.bodySmall,
                color = content,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
