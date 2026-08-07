package dev.dailysecuritynews.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.mikepenz.markdown.m3.Markdown
import dev.dailysecuritynews.app.data.ArticleEdition
import dev.dailysecuritynews.app.data.DigestEdition
import dev.dailysecuritynews.app.data.Story
import dev.dailysecuritynews.app.render.CitationResult

/**
 * The one screen. Archive and navigation are a later step.
 *
 * Every branch renders something. A blank screen is never an acceptable
 * state — `docs/app.md` §8 — and the three banners below exist so a reader
 * can tell a partial or stale edition from a complete one without having to
 * check the site.
 */
@Composable
fun TodayScreen(state: TodayState, onRetry: () -> Unit) {
    when (state) {
        is TodayState.Loading -> LoadingBody()
        is TodayState.Error -> ErrorBody(state, onRetry)
        is TodayState.Ready -> ReadyBody(state)
    }
}

@Composable
private fun LoadingBody() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text(
            text = "Loading today's edition",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 16.dp),
        )
    }
}

/**
 * The message is shown verbatim, never truncated or prettified: a reader who
 * can see the real error can report it, and a euphemism costs that.
 */
@Composable
private fun ErrorBody(state: TodayState.Error, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Couldn't load today's edition",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = state.message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 12.dp),
        )
        Button(onClick = onRetry, modifier = Modifier.padding(top = 20.dp)) {
            Text("Retry")
        }
    }
}

@Composable
private fun ReadyBody(state: TodayState.Ready) {
    val edition = state.edition
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (state.fromCache) {
            item {
                Banner(
                    title = "Offline — showing a saved copy of the ${edition.date} edition",
                    lines = listOfNotNull(state.cacheReason),
                    error = true,
                )
            }
        }

        if (edition.degraded.isNotEmpty()) {
            item {
                Banner(
                    title = "This edition is incomplete",
                    lines = edition.degraded.map { notice ->
                        val source = notice.sourceId?.let { " ($it)" } ?: ""
                        "${notice.stage}$source: ${notice.message}"
                    },
                    error = false,
                )
            }
        }

        val unresolved = state.body?.unresolved.orEmpty()
        if (unresolved.isNotEmpty()) {
            item {
                Banner(
                    title = "${unresolved.size} citations could not be resolved",
                    lines = listOf(unresolved.joinToString(", ")),
                    error = false,
                )
            }
        }

        when (edition) {
            is ArticleEdition -> {
                item {
                    Text(edition.headline, style = MaterialTheme.typography.headlineMedium)
                }
                item {
                    Text(
                        text = edition.standfirst,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                item { ArticleBody(state.body) }
                if (edition.alsoCollected.isNotEmpty()) {
                    item {
                        Text("Also collected", style = MaterialTheme.typography.titleMedium)
                    }
                    items(edition.alsoCollected) { StoryRow(it) }
                }
            }

            is DigestEdition -> {
                item { Text(edition.date, style = MaterialTheme.typography.headlineMedium) }
                items(edition.items) { StoryRow(it) }
            }
        }
    }
}

@Composable
private fun ArticleBody(body: CitationResult?) {
    if (body == null) return
    // The renderer's own CommonMark parser — the escaping in Citations.kt is
    // written against this parser, not against our reading of the spec.
    Markdown(content = body.markdown, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun Banner(title: String, lines: List<String>, error: Boolean) {
    val colors = if (error) {
        CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        )
    } else {
        CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
            contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
        )
    }
    Card(colors = colors, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            for (line in lines) {
                Text(
                    text = line,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

/** One composable for both [dev.dailysecuritynews.app.data.SelectedItem] and
 * [dev.dailysecuritynews.app.data.Item] — that is what the `Story` interface
 * is for. */
@Composable
private fun StoryRow(story: Story) {
    val uriHandler = LocalUriHandler.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { uriHandler.openUri(story.url) }
            .padding(vertical = 8.dp),
    ) {
        Text(story.title, style = MaterialTheme.typography.bodyLarge)
        Text(
            text = story.sourceId,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider(modifier = Modifier.padding(top = 8.dp))
    }
}
