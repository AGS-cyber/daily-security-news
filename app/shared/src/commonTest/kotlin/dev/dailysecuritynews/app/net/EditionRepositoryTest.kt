package dev.dailysecuritynews.app.net

import dev.dailysecuritynews.app.data.ArticleEdition
import dev.dailysecuritynews.app.fixtures.jsonFixture
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import okio.Path
import okio.Path.Companion.toPath
import okio.fakefilesystem.FakeFileSystem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Drives the repository entirely through `MockEngine` and `FakeFileSystem` —
 * no network, no disk. The bodies are the same captured production files
 * `EditionParsingTest` uses, so a model drift fails here too.
 */
class EditionRepositoryTest {

    private val cacheDir: Path = "/cache".toPath()

    private fun fs() = FakeFileSystem().also { it.createDirectories(cacheDir) }

    private fun engine(
        status: HttpStatusCode = HttpStatusCode.OK,
        body: String = "",
    ) = MockEngine { _ ->
        respond(
            content = body,
            status = status,
            headers = headersOf(HttpHeaders.ContentType, "application/json"),
        )
    }

    private fun throwingEngine(message: String) = MockEngine { _ ->
        throw RuntimeException(message)
    }

    private fun repo(engine: MockEngine, fs: FakeFileSystem) = EditionRepository(
        client = HttpClient(engine),
        fileSystem = fs,
        cacheDir = cacheDir,
    )

    /** True if [message] appears anywhere in the exception's cause chain. */
    private fun mentions(t: Throwable, message: String): Boolean {
        var current: Throwable? = t
        while (current != null) {
            if (current.message?.contains(message) == true) return true
            current = current.cause
        }
        return false
    }

    private val editionBody = jsonFixture("edition-2026-08-06.json")
    private val indexBody = jsonFixture("editions-index.json")

    // --- 1, 3: the happy path ---------------------------------------------

    @Test
    fun realEditionBodyReturnsFresh() = runTest {
        val result = repo(engine(body = editionBody), fs()).loadEdition("2026-08-06")
        val fresh = assertIs<Load.Fresh<*>>(result)
        val edition = assertIs<ArticleEdition>(fresh.value)
        assertEquals("2026-08-06", edition.date)
        assertEquals(8, edition.selected.size)
    }

    @Test
    fun realIndexBodyReturnsFresh() = runTest {
        val result = repo(engine(body = indexBody), fs()).loadIndex()
        val fresh = assertIs<Load.Fresh<*>>(result)
        @Suppress("UNCHECKED_CAST")
        val index = fresh.value as List<*>
        assertEquals(1, index.size)
    }

    // --- 2: the cache holds the raw bytes ---------------------------------

    @Test
    fun successCachesTheRawResponseBody() = runTest {
        val fs = fs()
        repo(engine(body = editionBody), fs).loadEdition("2026-08-06")
        val written = fs.read(cacheDir / "edition-2026-08-06.json") { readUtf8() }
        assertEquals(editionBody, written)
    }

    // --- 4, 5, 7: falling back to the cache -------------------------------

    @Test
    fun networkThrowWithCacheReturnsCachedCarryingTheNetworkError() = runTest {
        val fs = fs()
        fs.write(cacheDir / "edition-2026-08-06.json") { writeUtf8(editionBody) }
        val result = repo(throwingEngine("network is down"), fs).loadEdition("2026-08-06")
        val cached = assertIs<Load.Cached<*>>(result)
        assertIs<ArticleEdition>(cached.value)
        assertTrue(
            mentions(cached.cause, "network is down"),
            "cause was ${cached.cause}, not the network error",
        )
    }

    @Test
    fun serverErrorWithCacheReturnsCached() = runTest {
        val fs = fs()
        fs.write(cacheDir / "edition-2026-08-06.json") { writeUtf8(editionBody) }
        val engine = engine(
            status = HttpStatusCode.InternalServerError,
            body = "<html>error page</html>",
        )
        val result = repo(engine, fs).loadEdition("2026-08-06")
        val cached = assertIs<Load.Cached<*>>(result)
        assertIs<ArticleEdition>(cached.value)
        assertTrue(
            mentions(cached.cause, "500"),
            "cause was ${cached.cause}, not the status failure",
        )
    }

    @Test
    fun malformedResponseWithCacheReturnsCached() = runTest {
        val fs = fs()
        fs.write(cacheDir / "edition-2026-08-06.json") { writeUtf8(editionBody) }
        val result = repo(engine(body = "{ not json"), fs).loadEdition("2026-08-06")
        assertIs<Load.Cached<*>>(result)
    }

    // --- 6, 8: no usable cache --------------------------------------------

    @Test
    fun networkThrowWithNoCacheReturnsFailed() = runTest {
        val result = repo(throwingEngine("network is down"), fs()).loadEdition("2026-08-06")
        val failed = assertIs<Load.Failed>(result)
        assertTrue(mentions(failed.cause, "network is down"))
    }

    @Test
    fun poisonedCacheReturnsFailedNotAPartialValue() = runTest {
        val fs = fs()
        fs.write(cacheDir / "edition-2026-08-06.json") { writeUtf8("{ not json") }
        val result = repo(throwingEngine("network is down"), fs).loadEdition("2026-08-06")
        val failed = assertIs<Load.Failed>(result)
        assertTrue(
            mentions(failed.cause, "network is down"),
            "cause was ${failed.cause}, not the network error",
        )
    }

    // --- 9: decoded through EditionJson, not a stricter instance -----------

    @Test
    fun unknownFieldStillReturnsFresh() = runTest {
        val body = editionBody.replaceFirst("{", """{"futureTopLevelKey":123,""")
        val result = repo(engine(body = body), fs()).loadEdition("2026-08-06")
        assertIs<Load.Fresh<*>>(result)
    }

    // --- 10: the date is validated before it becomes a path or a URL ------

    @Test
    fun traversalDateThrowsAndMakesNoRequest() = runTest {
        val engine = engine(body = editionBody)
        val repo = repo(engine, fs())
        assertFailsWith<IllegalArgumentException> { repo.loadEdition("../../etc/passwd") }
        assertEquals(0, engine.requestHistory.size)
    }

    @Test
    fun unpaddedDateThrowsAndMakesNoRequest() = runTest {
        val engine = engine(body = editionBody)
        val repo = repo(engine, fs())
        assertFailsWith<IllegalArgumentException> { repo.loadEdition("2026-8-6") }
        assertEquals(0, engine.requestHistory.size)
    }

    // --- 11: a failed cache write does not fail a good fetch --------------

    @Test
    fun cacheWriteFailureStillReturnsFresh() = runTest {
        val fs = fs()
        // The target path is made a directory, so writing a file there fails.
        fs.createDirectories(cacheDir / "edition-2026-08-06.json")
        val result = repo(engine(body = editionBody), fs).loadEdition("2026-08-06")
        assertIs<Load.Fresh<*>>(result)
    }

    // --- 12: the exact URL -------------------------------------------------

    @Test
    fun requestsTheExactEditionUrl() = runTest {
        val engine = engine(body = editionBody)
        repo(engine, fs()).loadEdition("2026-08-06")
        assertEquals(1, engine.requestHistory.size)
        assertEquals(
            "https://daily-security-news.vercel.app/editions/2026-08-06.json",
            engine.requestHistory[0].url.toString(),
        )
    }
}
