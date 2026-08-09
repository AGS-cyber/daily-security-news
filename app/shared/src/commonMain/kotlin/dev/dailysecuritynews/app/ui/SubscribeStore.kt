package dev.dailysecuritynews.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.dailysecuritynews.app.net.SubscribeRepository

/**
 * What the subscribe form can be showing.
 *
 * [Idle] looks like the "fourth, blank case" [EditionState] refuses to have,
 * and is not one. That rule exists so a *failure* can never render as an empty
 * screen — every way out of a load has to disclose itself. An empty form before
 * the reader has typed anything is not a failure being hidden; it is the
 * screen's actual subject. The three outcomes after a submit are still
 * exhaustive and still all visible.
 */
sealed interface SubscribeState {
    data object Idle : SubscribeState

    data object Submitting : SubscribeState

    /**
     * Buttondown accepted the address. Deliberately not called `Subscribed`:
     * the list is double opt-in, so nobody is subscribed until they click the
     * link in the confirmation email, and the screen must not claim otherwise.
     */
    data object Sent : SubscribeState

    data class Failed(val message: String) : SubscribeState
}

/**
 * Drives one subscribe attempt, mirroring [EditionsStore]: a plain class over
 * Compose `mutableStateOf`, with no coroutine scope of its own — the caller
 * supplies one, which is what lets a test drive it straight from `runTest`.
 */
class SubscribeStore(private val repository: SubscribeRepository) {
    var state: SubscribeState by mutableStateOf(SubscribeState.Idle)
        private set

    /**
     * Rejects an obviously empty address before spending a request, and
     * otherwise lets the server be the authority on what an address is — a
     * client-side email regex is a well-known way to reject valid addresses.
     */
    suspend fun submit(email: String) {
        val trimmed = email.trim()
        if (trimmed.isEmpty()) {
            state = SubscribeState.Failed("Enter an email address.")
            return
        }

        state = SubscribeState.Submitting
        state = try {
            repository.subscribe(trimmed)
            SubscribeState.Sent
        } catch (t: Throwable) {
            // Verbatim, never a euphemism — `CLAUDE.md`'s fail-loud rule, and
            // the same `describe` shape EditionsStore uses.
            SubscribeState.Failed(t.message?.takeIf { it.isNotBlank() } ?: t.toString())
        }
    }

    /** Back to an empty form, so a reader can correct a typo or add a second address. */
    fun reset() {
        state = SubscribeState.Idle
    }
}
