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
 * has no such escape hatch, so both the title and the destination are escaped
 * — docs/app.md §5. The destination is bare, not angle-bracketed: see
 * [escapeLinkDestination] for why the angle brackets had to go.
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
            "[${escapeLinkText(story.title)}](${escapeLinkDestination(story.url)})"
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
 * Escape a **bare** link destination — no angle brackets.
 *
 * The angle-bracketed form `[t](<url>)` that this used to emit is unusable:
 * `org.intellij.markdown`, the parser the app's Compose renderer runs on,
 * files an angle-bracketed destination under an `AUTOLINK` node instead of
 * `LINK_DESTINATION`, resolves the destination to `href=""`, and the citation
 * renders on the device as plain text with no link at all. That is precisely
 * the "looks fine but is wrong" failure docs/app.md §5 was written to prevent,
 * arriving through the renderer rather than through the escaping.
 *
 * So parentheses are escaped here now, and for their own reason rather than
 * because angle brackets covered them: an unbalanced `)` would end the
 * destination early and swallow the rest of the link. `\`, `<` and `>` stay
 * escaped as before.
 *
 * Characters at or below `0x20`, and `0x7F`, are **percent-encoded** rather
 * than backslash-escaped. A bare destination cannot contain a space, and
 * CommonMark has no backslash escape for one, so encoding is the only form
 * that survives.
 *
 * Single pass, for the same reason [escapeLinkText] is: there is no second
 * pass to re-process what the first one emitted.
 */
private fun escapeLinkDestination(url: String): String {
    val out = StringBuilder(url.length)
    for (ch in url) {
        when {
            ch == '\\' || ch == '(' || ch == ')' || ch == '<' || ch == '>' -> {
                out.append('\\').append(ch)
            }
            ch.code <= 0x20 || ch.code == 0x7F -> {
                out.append('%').append(HEX[ch.code shr 4]).append(HEX[ch.code and 0xF])
            }
            else -> out.append(ch)
        }
    }
    return out.toString()
}

private const val HEX = "0123456789ABCDEF"
