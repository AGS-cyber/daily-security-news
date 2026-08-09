package dev.dailysecuritynews.app.ui

import dev.dailysecuritynews.app.net.SUBSCRIBE_URL
import dev.dailysecuritynews.app.net.SubscribeRepository
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.request.forms.FormDataContent
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Drives the store through `MockEngine`, so nothing here reaches Buttondown.
 * There is no Compose UI-test dependency in this module, so the store is the
 * layer a test can reach — the screen itself is checked on a device
 * (`docs/app.md` §10).
 */
class SubscribeStoreTest {

    private fun store(engine: MockEngine) =
        SubscribeStore(SubscribeRepository(HttpClient(engine)))

    private fun okEngine() = MockEngine { respond("", HttpStatusCode.OK) }

    @Test
    fun startsIdleSoTheFormIsJustAForm() {
        assertIs<SubscribeState.Idle>(store(okEngine()).state)
    }

    @Test
    fun aSuccessfulSubmitEndsInSent() = runTest {
        val store = store(okEngine())
        store.submit("reader@example.test")
        assertIs<SubscribeState.Sent>(store.state)
    }

    @Test
    fun postsTheEmailAsAFormToTheKeylessEndpoint() = runTest {
        val engine = okEngine()
        store(engine).submit("reader@example.test")

        assertEquals(1, engine.requestHistory.size)
        val request = engine.requestHistory[0]
        assertEquals(HttpMethod.Post, request.method)
        assertEquals(SUBSCRIBE_URL, request.url.toString())

        val body = assertIs<FormDataContent>(request.body)
        assertEquals("reader@example.test", body.formData["email"])
        assertEquals("1", body.formData["embed"])
    }

    @Test
    fun theAddressIsTrimmedBeforeItIsSent() = runTest {
        val engine = okEngine()
        store(engine).submit("  reader@example.test  ")
        val body = assertIs<FormDataContent>(engine.requestHistory[0].body)
        assertEquals("reader@example.test", body.formData["email"])
    }

    @Test
    fun anEmptyAddressFailsWithoutSpendingARequest() = runTest {
        val engine = okEngine()
        val store = store(engine)
        store.submit("   ")

        val failed = assertIs<SubscribeState.Failed>(store.state)
        assertEquals("Enter an email address.", failed.message)
        assertEquals(0, engine.requestHistory.size, "no request should have been made")
    }

    @Test
    fun aRejectedAddressReportsTheServersOwnReason() = runTest {
        val engine = MockEngine {
            respondError(HttpStatusCode.BadRequest, "That email address is invalid.")
        }
        val store = store(engine)
        store.submit("not-an-email")

        val failed = assertIs<SubscribeState.Failed>(store.state)
        assertTrue(
            failed.message.contains("400"),
            "the status should survive; message was ${failed.message}",
        )
        assertTrue(
            failed.message.contains("That email address is invalid."),
            "the server's reason should survive verbatim; message was ${failed.message}",
        )
    }

    @Test
    fun aNetworkFailureIsReportedRatherThanSwallowed() = runTest {
        val engine = MockEngine { throw RuntimeException("network is down") }
        val store = store(engine)
        store.submit("reader@example.test")

        val failed = assertIs<SubscribeState.Failed>(store.state)
        assertTrue(
            failed.message.contains("network is down"),
            "message was ${failed.message}",
        )
    }

    @Test
    fun resetReturnsToAnEmptyForm() = runTest {
        val store = store(okEngine())
        store.submit("reader@example.test")
        assertIs<SubscribeState.Sent>(store.state)

        store.reset()
        assertIs<SubscribeState.Idle>(store.state)
    }

    @Test
    fun aRetryAfterAFailureCanSucceed() = runTest {
        var attempt = 0
        val engine = MockEngine {
            attempt++
            if (attempt == 1) throw RuntimeException("network is down") else respond("", HttpStatusCode.OK)
        }
        val store = store(engine)

        store.submit("reader@example.test")
        assertIs<SubscribeState.Failed>(store.state)

        store.submit("reader@example.test")
        assertIs<SubscribeState.Sent>(store.state)
    }
}
