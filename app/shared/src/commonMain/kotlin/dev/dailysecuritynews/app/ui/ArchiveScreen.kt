package dev.dailysecuritynews.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.dailysecuritynews.app.data.EditionSummary

/**
 * Every published edition as a calendar, newest month first — the same grid
 * `archive.html` draws, from the same `/editions/index.json`.
 *
 * A calendar rather than a list because the archive is a diary: which days
 * published and which did not is the shape a reader is looking for, and a date
 * list can only be read one row at a time. The cost is that a day is a number
 * instead of a headline, so the headline moves into the cell's accessibility
 * label — where the site puts it too, as `aria-label`.
 *
 * An empty archive is a sentence, not a blank screen, and a cached archive
 * says so above the grid.
 */
@Composable
fun ArchiveScreen(
    state: ArchiveState,
    onSelect: (String) -> Unit,
    onRetry: () -> Unit,
) {
    when (state) {
        is ArchiveState.Loading -> LoadingBody("Loading the archive")
        is ArchiveState.Error -> ErrorBody(state.message, onRetry)
        is ArchiveState.Ready -> ReadyBody(state, onSelect)
    }
}

@Composable
private fun ReadyBody(state: ArchiveState.Ready, onSelect: (String) -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (state.fromCache) {
            item {
                Banner(
                    label = "[ !! OFFLINE ]",
                    kind = BannerKind.Warn,
                    title = "Offline — showing a saved copy of the archive",
                    lines = listOfNotNull(state.cacheReason),
                )
            }
        }

        if (state.months.isEmpty()) {
            item {
                Text(
                    text = "No editions have been published yet.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        } else {
            // The site's `.summary` line, and the key to the two day colours.
            item {
                Text(
                    text = buildAnnotatedString {
                        withStyle(SpanStyle(color = Terminal.dim)) { append("// ") }
                        append(editionCount(state.editionCount))
                        append(" · a bright day is a written article, a plain one a digest")
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = Terminal.muted,
                )
            }
            items(state.months, key = { "${it.year}-${it.month}" }) { month ->
                MonthGrid(month, state.latest, onSelect)
            }
        }
    }
}

private fun editionCount(count: Int): String =
    "$count ${if (count == 1) "edition" else "editions"}"

/** `Mo Tu We …` — Monday first, matching `calendarMonths` and the site. */
private val WEEKDAYS = listOf("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")

@Composable
private fun MonthGrid(month: CalendarMonth, latest: String?, onSelect: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        // `table.cal caption::before { content: "## " }` — decoration drawn
        // here, never prepended to the month's name.
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = Terminal.dim)) { append("## ") }
                withStyle(SpanStyle(color = Terminal.bright, fontWeight = FontWeight.Bold)) {
                    append("${MONTH_NAMES[month.month - 1]} ${month.year}")
                }
            },
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = editionCount(month.count),
            style = MaterialTheme.typography.labelMedium,
            color = Terminal.muted,
            modifier = Modifier.padding(bottom = 6.dp),
        )

        Row(modifier = Modifier.fillMaxWidth()) {
            WEEKDAYS.forEach { day ->
                Text(
                    text = day,
                    style = MaterialTheme.typography.labelSmall,
                    color = Terminal.dim,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).padding(bottom = 4.dp),
                )
            }
        }

        month.weeks.forEach { week ->
            Row(modifier = Modifier.fillMaxWidth()) {
                week.forEach { cell -> DayCell(cell, latest, onSelect) }
            }
        }
    }
}

/**
 * One day. Square, so seven across any screen stay a grid rather than a row of
 * slots — and a square cell is a 40dp-plus touch target on the narrowest phone
 * this app supports.
 */
@Composable
private fun RowScope.DayCell(cell: CalendarDay?, latest: String?, onSelect: (String) -> Unit) {
    val box = Modifier.weight(1f).aspectRatio(1f)

    // Before the 1st or after the last: no day, so no number and no border.
    if (cell == null) {
        Box(box)
        return
    }

    val entry = cell.entry
    val bordered = box.drawBehind {
        drawRect(color = Terminal.rule, style = Stroke(width = 1.dp.toPx()))
        // `td.latest { outline: 1px dashed var(--dim) }` — the edition the
        // Today screen is showing, marked where a reader looks for it.
        if (cell.date == latest) {
            val inset = 3.dp.toPx()
            drawRect(
                color = Terminal.dim,
                topLeft = Offset(inset, inset),
                size = Size(size.width - inset * 2, size.height - inset * 2),
                style = Stroke(
                    width = 1.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(
                        floatArrayOf(3.dp.toPx(), 3.dp.toPx()),
                    ),
                ),
            )
        }
    }

    val modifier = if (entry == null) {
        bordered
    } else {
        bordered
            .clickable { onSelect(cell.date) }
            // A bare "6" tells a screen reader nothing. The headline the grid
            // cannot show goes here, exactly as the site's `aria-label`.
            .semantics { contentDescription = dayLabel(cell.date, entry) }
    }

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Text(
            text = cell.day.toString(),
            style = MaterialTheme.typography.bodyMedium,
            color = when {
                entry == null -> Terminal.dim
                entry.mode == "article" -> Terminal.bright
                else -> Terminal.link
            },
            fontWeight = if (entry?.mode == "article") FontWeight.Bold else FontWeight.Normal,
        )
    }
}

/**
 * What a day is called when it is read aloud — the site's `aria-label`.
 *
 * A digest edition has no headline, so it is named for what it is rather than
 * given an empty one: the same choice the row list made before the grid.
 */
internal fun dayLabel(date: String, entry: EditionSummary): String {
    val stories = "${entry.count} ${if (entry.count == 1) "story" else "stories"}"
    return "$date — ${entry.headline ?: "Automated digest"} · $stories"
}
