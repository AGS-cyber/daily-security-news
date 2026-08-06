package dev.dailysecuritynews.app.data

import dev.dailysecuritynews.app.fixtures.jsonFixture
import kotlinx.serialization.SerializationException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Decodes the captured production edition and archive index. Every expected
 * value here was measured from the real files in
 * `src/commonTest/fixtures` — a failure means the model drifted from
 * `src/types.ts`, not that the number is stale.
 */
class EditionParsingTest {

    private fun capturedEdition(): ArticleEdition {
        val edition = EditionJson.decodeFromString<Edition>(
            jsonFixture("edition-2026-08-06.json"),
        )
        return assertIs<ArticleEdition>(edition)
    }

    @Test
    fun capturedEditionDecodesAsAnArticleEdition() {
        val edition = capturedEdition()
        assertEquals("2026-08-06", edition.date)
        assertEquals(
            "TeamCity Exploitation Leads a Day of Build-Server, CPU, and Database Attacks",
            edition.headline,
        )
        assertTrue(edition.standfirst.isNotBlank())
        assertTrue(edition.bodyMarkdown.isNotBlank())
        assertTrue(edition.degraded.isEmpty())
        assertEquals(
            EditionStats(
                sourcesConfigured = 12,
                sourcesOk = 12,
                collected = 230,
                normalized = 230,
                deduped = 227,
                published = 125,
            ),
            edition.stats,
        )
    }

    @Test
    fun capturedEditionHasTheExpectedStories() {
        val edition = capturedEdition()
        assertEquals(8, edition.selected.size)
        assertEquals(117, edition.alsoCollected.size)

        val first = edition.selected[0]
        assertEquals("s33", first.id)
        assertEquals("exploited", first.section)
        assertEquals(1, first.rank)
        assertEquals("thehackernews", first.sourceId)
        assertTrue(first.angle.isNotBlank())
    }

    @Test
    fun capturedEditionUsageDecodes() {
        val usage = capturedEdition().usage
        assertEquals("deepseek-v4-flash", usage.model)
        assertEquals(8337L, usage.outputTokens)
    }

    @Test
    fun everyStoryHasTheFieldsTheUiNeeds() {
        val edition = capturedEdition()
        val stories: List<Story> = edition.selected + edition.alsoCollected
        assertEquals(125, stories.size)
        for (story in stories) {
            assertTrue(story.title.isNotBlank(), "blank title on ${story.id}")
            assertTrue(story.url.isNotBlank(), "blank url on ${story.id}")
            assertTrue(
                story.canonicalUrl.isNotBlank(),
                "blank canonicalUrl on ${story.id}",
            )
        }
        assertEquals(125, stories.map { it.id }.toSet().size, "duplicate story ids")
    }

    @Test
    fun everyCitationNamesASelectedStory() {
        val edition = capturedEdition()
        val selectedIds = edition.selected.map { it.id }.toSet()
        val cited = Regex("""\[\[([^\]]+)\]\]""")
            .findAll(edition.bodyMarkdown)
            .map { it.groupValues[1] }
            .toList()
        // Asserted so a regex that silently matched nothing cannot pass.
        assertEquals(8, cited.size)
        for (id in cited) {
            assertTrue(id in selectedIds, "citation [[$id]] names no selected story")
        }
    }

    @Test
    fun capturedIndexDecodes() {
        val index = EditionJson.decodeFromString<List<EditionSummary>>(
            jsonFixture("editions-index.json"),
        )
        assertEquals(1, index.size)
        val row = index[0]
        assertEquals("2026-08-06", row.date)
        assertEquals("article", row.mode)
        assertEquals(125, row.count)
        assertNotNull(row.headline)
    }

    // --- parser policy -----------------------------------------------------
    // Hand-written JSON: these test the decoder's configuration, not the data
    // contract.

    @Test
    fun unknownKeysAreIgnored() {
        val json = """
            {
              "mode": "article",
              "date": "2026-08-07",
              "generatedAt": "2026-08-07T06:00:00.000Z",
              "degraded": [],
              "stats": $STATS_JSON,
              "headline": "H",
              "standfirst": "S",
              "bodyMarkdown": "B [[s1]]",
              "selected": [{$STORY_JSON, "section": "breaches", "rank": 1,
                            "angle": "A", "sentiment": "new field"}],
              "alsoCollected": [],
              "usage": $USAGE_JSON,
              "futureTopLevelKey": {"nested": true}
            }
        """.trimIndent()
        val edition = assertIs<ArticleEdition>(EditionJson.decodeFromString<Edition>(json))
        assertEquals(1, edition.selected.size)
        assertEquals("breaches", edition.selected[0].section)
    }

    @Test
    fun digestEditionDecodes() {
        val json = """
            {
              "mode": "digest",
              "date": "2026-08-07",
              "generatedAt": "2026-08-07T06:00:00.000Z",
              "degraded": [],
              "stats": $STATS_JSON,
              "items": [{$STORY_JSON}]
            }
        """.trimIndent()
        val edition = assertIs<DigestEdition>(EditionJson.decodeFromString<Edition>(json))
        assertEquals(1, edition.items.size)
        assertEquals("s1", edition.items[0].id)
    }

    @Test
    fun unknownModeThrows() {
        val json = """
            {
              "mode": "newsletter",
              "date": "2026-08-07",
              "generatedAt": "2026-08-07T06:00:00.000Z",
              "degraded": [],
              "stats": $STATS_JSON,
              "items": []
            }
        """.trimIndent()
        assertFailsWith<SerializationException> {
            EditionJson.decodeFromString<Edition>(json)
        }
    }

    @Test
    fun missingRequiredFieldThrows() {
        val json = """
            {
              "mode": "article",
              "date": "2026-08-07",
              "generatedAt": "2026-08-07T06:00:00.000Z",
              "degraded": [],
              "headline": "H",
              "standfirst": "S",
              "bodyMarkdown": "B",
              "selected": [],
              "alsoCollected": [],
              "usage": $USAGE_JSON
            }
        """.trimIndent()
        assertFailsWith<SerializationException> {
            EditionJson.decodeFromString<Edition>(json)
        }
    }

    private companion object {
        const val STATS_JSON = """
            {"sourcesConfigured": 1, "sourcesOk": 1, "collected": 1,
             "normalized": 1, "deduped": 1, "published": 1}
        """

        const val USAGE_JSON = """
            {"model": "m", "promptCacheHitTokens": 1, "promptCacheMissTokens": 2,
             "outputTokens": 3, "estimatedCostUsd": 0.5}
        """

        const val STORY_JSON = """
            "id": "s1", "sourceId": "src", "sourceKind": "rss",
            "title": "T", "url": "https://example.com/a",
            "canonicalUrl": "https://example.com/a",
            "publishedAt": "2026-08-07T05:00:00.000Z", "alsoCoveredBy": []
        """
    }
}
