package dev.dailysecuritynews.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownColor
import com.mikepenz.markdown.m3.markdownTypography
import dev.dailysecuritynews.app.data.ArticleEdition
import dev.dailysecuritynews.app.data.DigestEdition
import dev.dailysecuritynews.app.data.Story
import dev.dailysecuritynews.app.render.CitationResult

/**
 * Renders one edition — today's or one opened from the archive.
 *
 * Every branch renders something. A blank screen is never an acceptable state
 * — `docs/app.md` §8 — and the three banners exist so a reader can tell a
 * partial or stale edition from a complete one without checking the site.
 *
 * [subscribe] is the sign-up block at the foot of the page, where the site's
 * `layout()` puts it. It appears only under a rendered edition: offering to
 * mail someone the daily edition on a screen that just failed to load one
 * reads as the app ignoring its own error.
 */
@Composable
fun EditionScreen(state: EditionState, onRetry: () -> Unit, subscribe: SubscribeSlot) {
    when (state) {
        is EditionState.Loading -> LoadingBody("Loading the edition")
        is EditionState.Error -> ErrorBody(state.message, onRetry)
        is EditionState.Ready -> ReadyBody(state, subscribe)
    }
}

@Composable
internal fun LoadingBody(label: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text(
            text = label,
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
internal fun ErrorBody(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Couldn't load the edition",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 12.dp),
        )
        Button(onClick = onRetry, modifier = Modifier.padding(top = 20.dp)) {
            Text("Retry")
        }
    }
}

@Composable
private fun ReadyBody(state: EditionState.Ready, subscribe: SubscribeSlot) {
    val edition = state.edition
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
                    title = "Offline — showing a saved copy of the ${edition.date} edition",
                    lines = listOfNotNull(state.cacheReason),
                )
            }
        }

        if (edition.degraded.isNotEmpty()) {
            item {
                Banner(
                    label = "[ !! DEGRADED ]",
                    kind = BannerKind.Warn,
                    title = "This edition is incomplete",
                    lines = edition.degraded.map { notice ->
                        val source = notice.sourceId?.let { " ($it)" } ?: ""
                        "${notice.stage}$source: ${notice.message}"
                    },
                )
            }
        }

        val unresolved = state.body?.unresolved.orEmpty()
        if (unresolved.isNotEmpty()) {
            item {
                Banner(
                    label = "[ NOTICE ]",
                    kind = BannerKind.Note,
                    title = "${unresolved.size} citations could not be resolved",
                    lines = listOf(unresolved.joinToString(", ")),
                )
            }
        }

        when (edition) {
            is ArticleEdition -> {
                item { Headline(edition.headline) }
                item { Standfirst(edition.standfirst) }
                val vulnerabilities = importantVulnerabilityLines(edition.selected)
                if (vulnerabilities.isNotEmpty()) {
                    item { VulnerabilityMetadata(vulnerabilities, heading = true) }
                }
                item { ArticleBody(state.body) }
                if (edition.alsoCollected.isNotEmpty()) {
                    item {
                        Text("Also collected", style = MaterialTheme.typography.titleMedium)
                    }
                    itemsIndexed(edition.alsoCollected) { index, story ->
                        StoryRow(index + 1, story)
                    }
                }
            }

            is DigestEdition -> {
                item { Headline(edition.date) }
                itemsIndexed(edition.items) { index, story -> StoryRow(index + 1, story) }
            }
        }

        item { SubscribeBlock(subscribe) }
    }
}

/**
 * The site's `h1`: a `$ ` prompt sigil in `dim`, the headline in `bright` with
 * the phosphor glow, then the blinking block cursor.
 *
 * The sigil is drawn here and is never concatenated onto the edition's data —
 * `docs/design.md` §2 keeps every decorative character out of the content.
 * Prefix and headline share one `AnnotatedString` so they wrap as a unit.
 *
 * The cursor is in that same string, as a trailing span. It is `h1::after` on
 * the site, so it has to follow the final character of the *wrapped* heading;
 * as a sibling composable it sat at the top right of the headline's box,
 * level with the first line. Inside the string, text layout places it.
 *
 * `headlineMedium` is unchanged: `docs/app.md` §10 records that the heading
 * hierarchy is load-bearing, so no type scale moves here.
 */
@Composable
private fun Headline(text: String) {
    val alpha = cursorAlpha()
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(color = Terminal.dim, fontWeight = FontWeight.Normal)) {
                append("$ ")
            }
            withStyle(SpanStyle(color = Terminal.bright, shadow = PhosphorGlow)) {
                append(text)
            }
            appendCursor(alpha)
        },
        style = MaterialTheme.typography.headlineMedium,
    )
}

/** `.standfirst { border-left: 2px solid var(--dim); padding-left: 1rem }`. */
@Composable
private fun Standfirst(text: String) {
    Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        Box(
            modifier = Modifier
                .width(2.dp)
                .fillMaxHeight()
                .background(Terminal.dim),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            color = Terminal.fg,
            modifier = Modifier.padding(start = 16.dp),
        )
    }
}

@Composable
private fun ArticleBody(body: CitationResult?) {
    if (body == null) return
    // The renderer's own CommonMark parser — the escaping in Citations.kt is
    // written against this parser, not against our reading of the spec.
    //
    // The typography override is load-bearing, not cosmetic: the renderer's
    // default maps `##` to a style larger than the `headlineMedium` used for
    // the edition's own headline above, so a section heading outranked the
    // article title. Capping headings at `titleLarge` puts them back underneath
    // it.
    Markdown(
        content = body.markdown,
        colors = markdownColor(
            text = Terminal.fg,
            dividerColor = Terminal.rule,
        ),
        typography = markdownTypography(
            h1 = MaterialTheme.typography.titleLarge,
            h2 = MaterialTheme.typography.titleLarge,
            h3 = MaterialTheme.typography.titleMedium,
            // `markdownColor` in 0.41.0 carries no link colour — its
            // `MarkdownColors` has only text, the two code backgrounds, the
            // divider and the table background. Links are styled through the
            // typography's `TextLinkStyles`, so that is where `--link` goes.
            // The three heading overrides above are untouched.
            textLink = TextLinkStyles(style = SpanStyle(color = Terminal.link)),
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

private data class VulnerabilityLine(val text: String, val href: String?)

private fun importantVulnerabilityLines(stories: List<Story>): List<VulnerabilityLine> {
    val byId = linkedMapOf<String, dev.dailysecuritynews.app.data.VulnerabilityIntelligence>()
    for (story in stories) {
        for (cve in story.cves) {
            val current = byId[cve.id]
            if (current == null || (current.nvd == null && cve.nvd != null) ||
                (current.kev == null && cve.kev != null)
            ) {
                byId[cve.id] = cve
            }
        }
    }

    return byId.values.mapNotNull { cve ->
        val metric = cve.nvd?.cvss
        val important = cve.knownExploited == true || metric?.severity == "CRITICAL" ||
            metric?.severity == "HIGH" || (metric?.score ?: -1.0) >= 7.0
        if (!important) return@mapNotNull null

        val labels = mutableListOf(cve.id)
        metric?.score?.let { score ->
            labels += "CVSS " + if (score % 1.0 == 0.0) "${score.toInt()}.0" else score.toString()
        }
        metric?.severity?.let { labels += it.lowercase().replaceFirstChar { first -> first.titlecase() } }
        if (cve.knownExploited == true) labels += "CISA KEV"
        if (cve.kev?.knownRansomwareCampaignUse?.lowercase() == "known") {
            labels += "CISA ransomware use: Known"
        }
        val href = when {
            cve.provenance.nvd.status == "found" -> cve.provenance.nvd.recordUrl
            cve.knownExploited == true -> cve.provenance.cisaKev.catalogUrl
            else -> null
        }
        VulnerabilityLine(labels.joinToString(" / "), href)
    }
}

@Composable
private fun VulnerabilityMetadata(lines: List<VulnerabilityLine>, heading: Boolean) {
    val uriHandler = LocalUriHandler.current
    Column(modifier = Modifier.fillMaxWidth()) {
        if (heading) {
            Text(
                text = "Vulnerability intelligence",
                style = MaterialTheme.typography.titleMedium,
                color = Terminal.bright,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }
        for (line in lines) {
            val href = line.href
            val modifier = if (href == null) {
                Modifier.fillMaxWidth()
            } else {
                Modifier.fillMaxWidth().clickable { uriHandler.openUri(href) }
            }
            Text(
                text = "> ${line.text}",
                style = MaterialTheme.typography.labelMedium,
                color = Terminal.muted,
                modifier = modifier.padding(vertical = 2.dp),
            )
        }
    }
}

/** One composable for both [dev.dailysecuritynews.app.data.SelectedItem] and
 * [dev.dailysecuritynews.app.data.Item] — that is what the `Story` interface
 * is for. */
@Composable
private fun StoryRow(number: Int, story: Story) {
    val uriHandler = LocalUriHandler.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { uriHandler.openUri(story.url) }
            .padding(vertical = 8.dp),
    ) {
        // `.story-title::before { content: "[" counter(story, decimal-leading-zero) "] " }`
        // — drawn here, never spliced into the story's own title. Zero-padded
        // to two digits and left to run past 99 naturally, as `counter` does.
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = Terminal.dim, fontWeight = FontWeight.Normal)) {
                    append("[${number.toString().padStart(2, '0')}] ")
                }
                withStyle(SpanStyle(color = Terminal.bright, fontWeight = FontWeight.Bold)) {
                    append(story.title)
                }
            },
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = story.sourceId,
            style = MaterialTheme.typography.labelMedium,
            color = Terminal.muted,
        )
        val vulnerabilities = importantVulnerabilityLines(listOf(story))
        if (vulnerabilities.isNotEmpty()) {
            VulnerabilityMetadata(vulnerabilities, heading = false)
        }
        HorizontalDivider(
            modifier = Modifier.padding(top = 8.dp),
            color = Terminal.rule,
        )
    }
}
