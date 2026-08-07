package dev.dailysecuritynews.app.render

import dev.dailysecuritynews.app.data.ArticleEdition
import dev.dailysecuritynews.app.data.Edition
import dev.dailysecuritynews.app.data.EditionJson
import dev.dailysecuritynews.app.fixtures.jsonFixture
import org.intellij.markdown.flavours.commonmark.CommonMarkFlavourDescriptor
import org.intellij.markdown.html.HtmlGenerator
import org.intellij.markdown.parser.MarkdownParser
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The test the citation design exists for.
 *
 * `CitationsTest` asserts exact escaped strings, which can only be as right as
 * our own reading of the CommonMark spec. This one runs the substituted body
 * through `org.intellij.markdown` — the parser the app's Compose renderer uses
 * — and reads the anchors back out. The web verifies the same seam through
 * `marked` (docs/app.md §5).
 *
 * **Assert on the generated HTML, and do not normalise it first.** An earlier
 * version of this test read destinations out of the parse tree and stripped
 * backslashes and angle brackets before comparing. It passed while the app on
 * a real device rendered every citation as plain unlinked text, because the
 * stripping removed exactly the thing under test: the angle-bracketed form
 * resolved to `href=""`, and normalising it away hid that. What the generator
 * emits is what the reader gets, so that is what is compared here.
 */
class CitationMarkdownTest {

    private val anchor = Regex("""<a href="([^"]*)"[^>]*>(.*?)</a>""", RegexOption.DOT_MATCHES_ALL)

    private fun decodeEntities(text: String): String = text
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        // Last: an ampersand this step produces must not be re-expanded above.
        .replace("&amp;", "&")

    @Test
    fun everyCitationRendersAsAnAnchorCarryingTheStoryTitleAndUrl() {
        val edition = EditionJson.decodeFromString<Edition>(jsonFixture("edition-2026-08-06.json"))
        val article = edition as ArticleEdition

        val result = substituteCitations(article.bodyMarkdown, article.selected)
        assertEquals(emptyList(), result.unresolved)

        val md = result.markdown
        val flavour = CommonMarkFlavourDescriptor()
        val tree = MarkdownParser(flavour).buildMarkdownTreeFromString(md)
        val html = HtmlGenerator(md, tree, flavour).generateHtml()

        val cited = Regex("""\[\[([^\]]+)\]\]""")
            .findAll(article.bodyMarkdown)
            .map { it.groupValues[1].trim() }
            .toList()
        assertEquals(8, cited.size, "the captured edition should cite 8 stories")

        val anchors = anchor.findAll(html).toList()
        assertEquals(8, anchors.size, "expected one anchor per citation")

        val byId = article.selected.associateBy { it.id }
        for (i in cited.indices) {
            val story = byId.getValue(cited[i])
            assertEquals(story.url, decodeEntities(anchors[i].groupValues[1]), "href $i")
            assertEquals(story.title, decodeEntities(anchors[i].groupValues[2]), "text $i")
        }
    }
}
