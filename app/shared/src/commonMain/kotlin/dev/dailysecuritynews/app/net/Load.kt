package dev.dailysecuritynews.app.net

/**
 * The outcome of a load, with its provenance. A caller cannot render cached
 * data without knowing it is cached — CLAUDE.md ranks a disclosed fallback
 * above a clean failure, and both above silently showing stale data as if it
 * were current.
 */
sealed interface Load<out T> {
    data class Fresh<T>(val value: T) : Load<T>

    /** Network failed; this came off disk. [cause] is for disclosure, not swallowing. */
    data class Cached<T>(val value: T, val cause: Throwable) : Load<T>

    data class Failed(val cause: Throwable) : Load<Nothing>
}
