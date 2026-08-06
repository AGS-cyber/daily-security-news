package dev.dailysecuritynews.app.render

import dev.dailysecuritynews.app.data.Story

/** Same pattern the web uses — `src/render/citations.ts`. */
private val CITATION = Regex("""\[\[([^\]]+)\]\]""")

/**
 * The result of substituting citations, including which ones could not be
 * resolved. [unresolved] is not an error to swallow — the screen shows it.
 */
data class CitationResult(
    val markdown: String,
    val unresolved: List<String>,
)

/**
 * Replace every `[[id]]` in [markdown] with a CommonMark link to the matching
 * story. The web emits a raw HTML anchor instead; a Compose Markdown renderer
 * has no such escape hatch, so the title is escaped and the destination is
 * angle-bracketed — docs/app.md §5.
 *
 * **An unresolved token does not throw, and must not be "fixed" into one.**
 * The web throws because it runs at publish time, where a throw stops a bad
 * page from ever existing. The app runs against an edition that is already
 * published, so a throw would blank an otherwise fine article over one bad
 * token. Per `CLAUDE.md`'s priority order that is worse than a visible
 * fallback: the literal `[[s7]]` reads as obviously broken, and [unresolved]
 * lets the screen show a banner.
 */
fun substituteCitations(markdown: String, stories: List<Story>): CitationResult {
    // First story wins on a duplicate id.
    val byId = LinkedHashMap<String, Story>()
    for (story in stories) if (story.id !in byId) byId[story.id] = story

    val unresolved = LinkedHashSet<String>()
    val substituted = CITATION.replace(markdown) { match ->
        val id = match.groupValues[1].trim()
        val story = byId[id]
        if (story == null) {
            unresolved.add(id)
            // Verbatim, untrimmed: visibly broken beats silently deleted.
            match.value
        } else {
            "[${escapeLinkText(story.title)}](<${escapeLinkDestination(story.url)}>)"
        }
    }
    return CitationResult(substituted, unresolved.toList())
}

/**
 * Backslash-escape every ASCII punctuation character. CommonMark guarantees a
 * backslash escape works for any of them, so escaping all of them is always
 * valid; a curated list of "the dangerous ones" rots silently the moment the
 * renderer changes.
 *
 * Single pass, deliberately: escaping `\` in a separate pass from the rest is
 * the trap docs/app.md §5 names, and one pass cannot re-process the
 * backslashes it just emitted. Do not rewrite this as `String.replace` calls.
 */
private fun escapeLinkText(text: String): String {
    val out = StringBuilder(text.length)
    for (ch in text) {
        if (ch in '!'..'/' || ch in ':'..'@' || ch in '['..'`' || ch in '{'..'~') {
            out.append('\\')
        }
        out.append(ch)
    }
    return out.toString()
}

/**
 * Backslash-escape `\`, `<` and `>` only. The caller wraps the result in
 * `<…>`, and inside angle brackets those are the only characters that need
 * escaping — which is why parentheses, common in news URLs, survive untouched
 * here while they *are* escaped in the link text.
 */
private fun escapeLinkDestination(url: String): String {
    val out = StringBuilder(url.length)
    for (ch in url) {
        if (ch == '\\' || ch == '<' || ch == '>') out.append('\\')
        out.append(ch)
    }
    return out.toString()
}
