package dev.dailysecuritynews.app.data

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

/**
 * Kotlin mirror of `src/types.ts`. There is no compiler tie between the two,
 * so `EditionParsingTest` decodes a captured production edition to catch drift.
 *
 * Only the fields TypeScript marks optional carry a default. A missing
 * required field is a broken contract and must throw — `CLAUDE.md`.
 */

@Serializable
data class Coverage(val sourceId: String, val name: String, val url: String)

interface Story {
    val id: String
    val sourceId: String
    val sourceKind: String
    val title: String
    val url: String
    val canonicalUrl: String
    val publishedAt: String
    val excerpt: String?
    val alsoCoveredBy: List<Coverage>
}

@Serializable
data class Item(
    override val id: String,
    override val sourceId: String,
    override val sourceKind: String,
    override val title: String,
    override val url: String,
    override val canonicalUrl: String,
    override val publishedAt: String,
    override val excerpt: String? = null,
    override val alsoCoveredBy: List<Coverage>,
) : Story

@Serializable
data class SelectedItem(
    override val id: String,
    override val sourceId: String,
    override val sourceKind: String,
    override val title: String,
    override val url: String,
    override val canonicalUrl: String,
    override val publishedAt: String,
    override val excerpt: String? = null,
    override val alsoCoveredBy: List<Coverage>,
    /**
     * A `String`, not an enum: `ignoreUnknownKeys` does not cover unknown enum
     * *values*, so a section added to the site would hard-fail an installed
     * app, and `coerceInputValues` would silently rewrite it to a default.
     * The display layer maps it. Same reasoning for [sourceKind] and
     * [DegradedNotice.stage]. `mode` is the deliberate exception — it selects
     * the renderer, so an unrecognised one must fail loudly.
     */
    val section: String,
    val rank: Int,
    val angle: String,
) : Story

@Serializable
data class DegradedNotice(
    val stage: String,
    val sourceId: String? = null,
    val message: String,
)

@Serializable
data class EditionStats(
    val sourcesConfigured: Int,
    val sourcesOk: Int,
    val collected: Int,
    val normalized: Int,
    val deduped: Int,
    val published: Int,
)

@Serializable
data class Usage(
    val model: String,
    val promptCacheHitTokens: Long,
    val promptCacheMissTokens: Long,
    val outputTokens: Long,
    val estimatedCostUsd: Double,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("mode")
sealed interface Edition {
    val date: String
    val generatedAt: String
    val degraded: List<DegradedNotice>
    val stats: EditionStats
}

@Serializable
@SerialName("article")
data class ArticleEdition(
    override val date: String,
    override val generatedAt: String,
    override val degraded: List<DegradedNotice>,
    override val stats: EditionStats,
    val headline: String,
    val standfirst: String,
    val bodyMarkdown: String,
    val selected: List<SelectedItem>,
    val alsoCollected: List<Item>,
    val usage: Usage,
) : Edition

@Serializable
@SerialName("digest")
data class DigestEdition(
    override val date: String,
    override val generatedAt: String,
    override val degraded: List<DegradedNotice>,
    override val stats: EditionStats,
    val items: List<Item>,
) : Edition

/** One row of `/editions/index.json`. */
@Serializable
data class EditionSummary(
    val date: String,
    val mode: String,
    val count: Int,
    val headline: String? = null,
)
