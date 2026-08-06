package dev.dailysecuritynews.app.render

import dev.dailysecuritynews.app.data.ArticleEdition
import dev.dailysecuritynews.app.data.Edition
import dev.dailysecuritynews.app.data.EditionJson
import dev.dailysecuritynews.app.data.Item
import dev.dailysecuritynews.app.fixtures.jsonFixture
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Every assertion here is on the exact output string. A `contains` check
 * cannot tell a correctly escaped link from a corrupted one, which is the
 * only thing this file exists to check — docs/app.md §5.
 */
class CitationsTest {

    private fun story(id: String, title: String, url: String): Item = Item(
        id = id,
        sourceId = "src",
        sourceKind = "rss",
        title = title,
        url = url,
        canonicalUrl = url,
        publishedAt = "2026-08-06T05:00:00.000Z",
        excerpt = null,
        alsoCoveredBy = emptyList(),
    )

    // --- the four cases docs/app.md §5 makes mandatory ----------------------

    @Test
    fun trailingBackslashInTitleIsEscaped() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(story("s1", "Windows path C:\\", "https://x.test/a")),
        )
        assertEquals("""[Windows path C\:\\](<https://x.test/a>)""", result.markdown)
        assertEquals(emptyList(), result.unresolved)
    }

    @Test
    fun nestedAndUnbalancedBracketsAreEscaped() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(story("s1", "A [nested] and ] alone", "https://x.test/b")),
        )
        assertEquals(
            """[A \[nested\] and \] alone](<https://x.test/b>)""",
            result.markdown,
        )
        assertEquals(emptyList(), result.unresolved)
    }

    @Test
    fun doubledEmphasisCharactersAreEscaped() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(story("s1", "**bold** and __under__", "https://x.test/c")),
        )
        assertEquals(
            """[\*\*bold\*\* and \_\_under\_\_](<https://x.test/c>)""",
            result.markdown,
        )
        assertEquals(emptyList(), result.unresolved)
    }

    @Test
    fun parenthesisedUrlSurvivesInsideAngleBrackets() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(story("s1", "Wiki", "https://x.test/a_(disambiguation)")),
        )
        assertEquals(
            """[Wiki](<https://x.test/a_(disambiguation)>)""",
            result.markdown,
        )
        assertEquals(emptyList(), result.unresolved)
    }

    /** The asymmetry: parens escaped in the text, untouched in the destination. */
    @Test
    fun parenthesesAreEscapedInTextButNotInDestination() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(story("s1", "Foo (bar)", "https://x.test/a(1)")),
        )
        assertEquals("""[Foo \(bar\)](<https://x.test/a(1)>)""", result.markdown)
    }

    @Test
    fun theThreeCharactersTheWebAvoidsMarkdownForAreEscaped() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(story("s1", "] ) *", "https://x.test/e")),
        )
        assertEquals("""[\] \) \*](<https://x.test/e>)""", result.markdown)
    }

    @Test
    fun angleBracketsInUrlAreEscaped() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(story("s1", "U", "https://x.test/a<b>c")),
        )
        assertEquals("""[U](<https://x.test/a\<b\>c>)""", result.markdown)
    }

    // --- resolution behaviour ----------------------------------------------

    @Test
    fun unresolvedTokenIsLeftVerbatimAndReported() {
        val result = substituteCitations("Before [[s99]] after.", emptyList())
        assertEquals("Before [[s99]] after.", result.markdown)
        assertEquals(listOf("s99"), result.unresolved)
    }

    @Test
    fun resolvableAndUnresolvableTokensCoexist() {
        val result = substituteCitations(
            "One [[s1]] two [[s99]].",
            listOf(story("s1", "T", "https://x.test/a")),
        )
        assertEquals(
            """One [T](<https://x.test/a>) two [[s99]].""",
            result.markdown,
        )
        assertEquals(listOf("s99"), result.unresolved)
    }

    @Test
    fun duplicateUnresolvedIdsAreCollapsed() {
        val result = substituteCitations("[[s99]] and [[s99]]", emptyList())
        assertEquals("[[s99]] and [[s99]]", result.markdown)
        assertEquals(listOf("s99"), result.unresolved)
    }

    @Test
    fun whitespaceInsideTheTokenIsTrimmed() {
        val result = substituteCitations(
            "[[ s1 ]]",
            listOf(story("s1", "T", "https://x.test/a")),
        )
        assertEquals("""[T](<https://x.test/a>)""", result.markdown)
        assertEquals(emptyList(), result.unresolved)
    }

    @Test
    fun markdownWithoutCitationsIsUnchanged() {
        val body = "Just **prose** with [a link](https://x.test/) and no tokens."
        val result = substituteCitations(
            body,
            listOf(story("s1", "T", "https://x.test/a")),
        )
        assertEquals(body, result.markdown)
        assertEquals(emptyList(), result.unresolved)
    }

    @Test
    fun theSameIdCitedTwiceResolvesBothTimes() {
        val result = substituteCitations(
            "[[s1]] and again [[s1]]",
            listOf(story("s1", "T", "https://x.test/a")),
        )
        assertEquals(
            """[T](<https://x.test/a>) and again [T](<https://x.test/a>)""",
            result.markdown,
        )
        assertEquals(emptyList(), result.unresolved)
    }

    @Test
    fun nonAsciiCharactersPassThroughUnescaped() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(
                story(
                    "s1",
                    "Curly \u2019quote\u2019 and \u653b\u6483 \u2014 dash!",
                    "https://x.test/n",
                ),
            ),
        )
        assertEquals(
            "[Curly \u2019quote\u2019 and \u653b\u6483 \u2014 dash\\!]" +
                "(<https://x.test/n>)",
            result.markdown,
        )
    }

    @Test
    fun theFirstStoryWinsOnADuplicateId() {
        val result = substituteCitations(
            "[[s1]]",
            listOf(
                story("s1", "First", "https://x.test/1"),
                story("s1", "Second", "https://x.test/2"),
            ),
        )
        assertEquals("""[First](<https://x.test/1>)""", result.markdown)
    }

    // --- against the captured production edition ---------------------------

    @Test
    fun capturedEditionBodySubstitutesEveryCitation() {
        val edition = assertIs<ArticleEdition>(
            EditionJson.decodeFromString<Edition>(jsonFixture("edition-2026-08-06.json")),
        )
        val body = edition.bodyMarkdown
        val result = substituteCitations(body, edition.selected)

        assertEquals(emptyList(), result.unresolved)
        assertTrue("[[" !in result.markdown, "a citation token survived substitution")
        // Eight links actually emitted, rather than eight tokens deleted.
        assertEquals(
            occurrences(body, "](<") + 8,
            occurrences(result.markdown, "](<"),
        )
    }

    private fun occurrences(haystack: String, needle: String): Int {
        var count = 0
        var index = haystack.indexOf(needle)
        while (index >= 0) {
            count++
            index = haystack.indexOf(needle, index + needle.length)
        }
        return count
    }
}
