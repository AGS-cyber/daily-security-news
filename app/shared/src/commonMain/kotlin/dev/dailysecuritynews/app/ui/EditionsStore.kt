package dev.dailysecuritynews.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.dailysecuritynews.app.data.ArticleEdition
import dev.dailysecuritynews.app.data.Edition
import dev.dailysecuritynews.app.net.EditionRepository
import dev.dailysecuritynews.app.net.Load
import dev.dailysecuritynews.app.render.CitationResult
import dev.dailysecuritynews.app.render.substituteCitations

/**
 * What the Today screen can be showing. There is no fourth "blank" case:
 * `docs/design.md` §8 and `CLAUDE.md` both require a degraded mode to be
 * visible, so every path out of [EditionsStore.loadToday] lands on one of
 * these three and each of them renders something a reader can act on.
 */
sealed interface TodayState {
    data object Loading : TodayState

    data class Ready(
        val edition: Edition,
        /** Citation-substituted body; null for a digest edition, which has none. */
        val body: CitationResult?,
        /** True when any part of this came off disk instead of the network. */
        val fromCache: Boolean,
        /** Why we fell back. Non-null exactly when [fromCache] is true. */
        val cacheReason: String?,
    ) : TodayState

    data class Error(val message: String) : TodayState
}

/**
 * Loads the newest edition into [today].
 *
 * A plain class holding a Compose `mutableStateOf` — no ViewModel, no
 * lifecycle dependency, no `StateFlow`. `CLAUDE.md` asks for the simplest
 * thing that works, and this one is directly readable from a `runTest` block
 * with no test dispatcher plumbing.
 */
class EditionsStore(private val repository: EditionRepository) {
    var today: TodayState by mutableStateOf(TodayState.Loading)
        private set

    suspend fun loadToday() {
        today = TodayState.Loading

        val indexLoad = repository.loadIndex()
        val index = when (indexLoad) {
            is Load.Failed -> {
                today = TodayState.Error(
                    "Couldn't load the edition index: ${describe(indexLoad.cause)}",
                )
                return
            }
            is Load.Fresh -> indexLoad.value
            is Load.Cached -> indexLoad.value
        }

        val summary = index.firstOrNull()
        if (summary == null) {
            today = TodayState.Error("No editions have been published yet.")
            return
        }

        val editionLoad = repository.loadEdition(summary.date)
        val edition = when (editionLoad) {
            is Load.Failed -> {
                today = TodayState.Error(
                    "Couldn't load the ${summary.date} edition: ${describe(editionLoad.cause)}",
                )
                return
            }
            is Load.Fresh -> editionLoad.value
            is Load.Cached -> editionLoad.value
        }

        // The first cached cause, index before edition — whichever fell back
        // first is the failure worth showing.
        val cacheCause = loadCause(indexLoad) ?: loadCause(editionLoad)

        today = TodayState.Ready(
            edition = edition,
            body = when (edition) {
                is ArticleEdition ->
                    substituteCitations(edition.bodyMarkdown, edition.selected)
                else -> null
            },
            fromCache = cacheCause != null,
            cacheReason = cacheCause,
        )
    }

    private fun <T> loadCause(load: Load<T>): String? =
        (load as? Load.Cached)?.let { describe(it.cause) }

    /** The real error text, never a euphemism — `CLAUDE.md`'s fail-loud rule. */
    private fun describe(t: Throwable): String =
        t.message?.takeIf { it.isNotBlank() } ?: t.toString()
}
