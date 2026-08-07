package dev.dailysecuritynews.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.dailysecuritynews.app.data.ArticleEdition
import dev.dailysecuritynews.app.data.Edition
import dev.dailysecuritynews.app.data.EditionSummary
import dev.dailysecuritynews.app.net.EditionRepository
import dev.dailysecuritynews.app.net.Load
import dev.dailysecuritynews.app.render.CitationResult
import dev.dailysecuritynews.app.render.substituteCitations

/**
 * What an edition screen can be showing — today's edition or any archived one.
 *
 * There is no fourth "blank" case: `docs/design.md` §8 and `CLAUDE.md` both
 * require a degraded mode to be visible, so every path out of the store lands
 * on one of these three and each renders something a reader can act on.
 */
sealed interface EditionState {
    data object Loading : EditionState

    data class Ready(
        val edition: Edition,
        /** Citation-substituted body; null for a digest edition, which has none. */
        val body: CitationResult?,
        /** True when any part of this came off disk instead of the network. */
        val fromCache: Boolean,
        /** Why we fell back. Non-null exactly when [fromCache] is true. */
        val cacheReason: String?,
    ) : EditionState

    data class Error(val message: String) : EditionState
}

/**
 * What the archive screen can be showing.
 *
 * An empty [Ready.editions] is deliberately not an [Error]: "nothing has been
 * published" is a fact about the archive, not a failure to load it, and the
 * screen says so in words.
 */
sealed interface ArchiveState {
    data object Loading : ArchiveState

    data class Ready(
        val editions: List<EditionSummary>,
        val fromCache: Boolean,
        val cacheReason: String?,
    ) : ArchiveState

    data class Error(val message: String) : ArchiveState
}

/**
 * Loads the newest edition into [today], the index into [archive], and any
 * edition opened from the archive into [viewed].
 *
 * A plain class holding Compose `mutableStateOf` — no ViewModel, no lifecycle
 * dependency, no `StateFlow`. `CLAUDE.md` asks for the simplest thing that
 * works, and this one is directly readable from a `runTest` block with no
 * dispatcher plumbing.
 */
class EditionsStore(private val repository: EditionRepository) {
    var today: EditionState by mutableStateOf(EditionState.Loading)
        private set

    var archive: ArchiveState by mutableStateOf(ArchiveState.Loading)
        private set

    /**
     * An edition opened from the archive. Separate from [today] on purpose: a
     * failure here must not turn today's already-loaded edition into an error
     * screen, and coming back from the archive must not re-fetch it.
     */
    var viewed: EditionState by mutableStateOf(EditionState.Loading)
        private set

    suspend fun loadToday() {
        today = EditionState.Loading

        val indexLoad = repository.loadIndex()
        val index = when (indexLoad) {
            is Load.Failed -> {
                today = EditionState.Error(
                    "Couldn't load the edition index: ${describe(indexLoad.cause)}",
                )
                return
            }
            is Load.Fresh -> indexLoad.value
            is Load.Cached -> indexLoad.value
        }

        // The index is newest-first, so today's edition is the first entry.
        val summary = index.firstOrNull()
        if (summary == null) {
            today = EditionState.Error("No editions have been published yet.")
            return
        }

        today = readEdition(
            date = summary.date,
            load = repository.loadEdition(summary.date),
            // Either load falling back to disk makes the screen a cached one.
            priorCacheCause = loadCause(indexLoad),
        )
    }

    suspend fun loadArchive() {
        archive = ArchiveState.Loading

        archive = when (val load = repository.loadIndex()) {
            is Load.Failed -> ArchiveState.Error(
                "Couldn't load the edition index: ${describe(load.cause)}",
            )
            is Load.Fresh -> ArchiveState.Ready(load.value, fromCache = false, cacheReason = null)
            is Load.Cached -> ArchiveState.Ready(
                editions = load.value,
                fromCache = true,
                cacheReason = describe(load.cause),
            )
        }
    }

    suspend fun openEdition(date: String) {
        viewed = EditionState.Loading
        viewed = readEdition(date = date, load = repository.loadEdition(date))
    }

    /**
     * The one `Load<Edition>` → [EditionState] conversion, shared by [loadToday]
     * and [openEdition] so the citation substitution and the cache disclosure
     * cannot drift apart between the two entry points.
     */
    private fun readEdition(
        date: String,
        load: Load<Edition>,
        priorCacheCause: String? = null,
    ): EditionState {
        val edition = when (load) {
            is Load.Failed -> return EditionState.Error(
                "Couldn't load the $date edition: ${describe(load.cause)}",
            )
            is Load.Fresh -> load.value
            is Load.Cached -> load.value
        }

        val cacheCause = priorCacheCause ?: loadCause(load)

        return EditionState.Ready(
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
