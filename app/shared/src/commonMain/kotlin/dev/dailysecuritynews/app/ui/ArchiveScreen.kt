package dev.dailysecuritynews.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.dailysecuritynews.app.data.EditionSummary

/**
 * Every published edition, newest first — the same data `archive.html` shows.
 *
 * An empty archive is a sentence, not a blank screen, and a cached archive
 * says so above the rows.
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

        if (state.editions.isEmpty()) {
            item {
                Text(
                    text = "No editions have been published yet.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        } else {
            items(state.editions) { summary -> SummaryRow(summary, onSelect) }
        }
    }
}

@Composable
private fun SummaryRow(summary: EditionSummary, onSelect: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelect(summary.date) }
            .padding(vertical = 8.dp),
    ) {
        // `ul.archive li::before { content: "\203A"; color: var(--dim) }` —
        // decoration drawn here, never prepended to the edition's date.
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = Terminal.dim)) { append("› ") }
                append(summary.date)
            },
            style = MaterialTheme.typography.titleMedium,
        )
        // A digest edition has no headline; showing the date and count alone
        // beats an empty line pretending a headline exists.
        summary.headline?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        Text(
            text = "${summary.count} stories",
            style = MaterialTheme.typography.labelMedium,
            color = Terminal.muted,
            modifier = Modifier.padding(top = 2.dp),
        )
        HorizontalDivider(modifier = Modifier.padding(top = 8.dp), color = Terminal.rule)
    }
}
