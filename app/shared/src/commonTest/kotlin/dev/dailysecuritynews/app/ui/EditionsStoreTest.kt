package dev.dailysecuritynews.app.ui

import dev.dailysecuritynews.app.data.ArticleEdition
import dev.dailysecuritynews.app.data.DigestEdition
import dev.dailysecuritynews.app.fixtures.jsonFixture
import dev.dailysecuritynews.app.net.EditionRepository
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import okio.Path
import okio.Path.Companion.toPath
import okio.fakefilesystem.FakeFileSystem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Driven exactly as `EditionRepositoryTest` is — `runTest`, `MockEngine`,
 * `FakeFileSystem`, the real captured fixtures. No Compose UI test dependency
 * exists in this project and this tests state, not pixels.
 */
class EditionsStoreTest {

    private val cacheDir: Path = "/cache".toPath()

    private val editionBody = jsonFixture("edition-2026-08-06.json")
    private val indexBody = jsonFixture("editions-index.json")

    private fun fs() = FakeFileSystem().also { it.createDirectories(cacheDir) }

    /** Serves the index and the edition from their own bodies, by path. */
    private fun engine(
        index: String = indexBody,
        edition: String = editionBody,
        failEdition: String? = null,
        failIndex: String? = null,
    ) = MockEngine { request ->
        val path = request.url.encodedPath
        if (path.endsWith("index.json")) {
            failIndex?.let { throw RuntimeException(it) }
            respond(index, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        } else {
            failEdition?.let { throw RuntimeException(it) }
            respond(edition, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }
    }

    private fun store(engine: MockEngine, fs: FakeFileSystem) = EditionsStore(
        EditionRepository(client = HttpClient(engine), fileSystem = fs, cacheDir = cacheDir),
    )

    /** A digest edition — there is no captured digest fixture to reuse. */
    private val digestBody = """
        {
          "mode": "digest",
          "date": "2026-08-06",
          "generatedAt": "2026-08-06T06:00:00.000Z",
          "degraded": [],
          "stats": {
            "sourcesConfigured": 1, "sourcesOk": 1, "collected": 1,
            "normalized": 1, "deduped": 1, "published": 1
          },
          "items": [
            {
              "id": "s1", "sourceId": "bleepingcomputer", "sourceKind": "news",
              "title": "A digest story", "url": "https://example.com/a",
              "canonicalUrl": "https://example.com/a",
              "publishedAt": "2026-08-06T05:00:00.000Z",
              "alsoCoveredBy": []
            }
          ]
        }
    """.trimIndent()

    // --- 7 -----------------------------------------------------------------

    @Test
    fun startsLoadingBeforeAnythingIsRequested() {
        val store = store(engine(), fs())
        assertIs<EditionState.Loading>(store.today)
    }

    // --- 1, 2 --------------------------------------------------------------

    @Test
    fun freshIndexAndEditionAreReadyAndNotFromCache() = runTest {
        val store = store(engine(), fs())
        store.loadToday()
        val ready = assertIs<EditionState.Ready>(store.today)
        val edition = assertIs<ArticleEdition>(ready.edition)
        assertEquals("2026-08-06", edition.date)
        assertEquals(8, edition.selected.size)
        assertEquals(false, ready.fromCache)
        assertNull(ready.cacheReason)
    }

    @Test
    fun everyCitationInTheRealEditionIsSubstituted() = runTest {
        val store = store(engine(), fs())
        store.loadToday()
        val ready = assertIs<EditionState.Ready>(store.today)
        val body = ready.body!!
        assertTrue("[[" !in body.markdown, "an unsubstituted citation token survived")
        assertEquals(emptyList(), body.unresolved)
    }

    // --- 3 -----------------------------------------------------------------

    @Test
    fun cachedEditionDisclosesTheNetworkError() = runTest {
        val fs = fs()
        fs.write(cacheDir / "edition-2026-08-06.json") { writeUtf8(editionBody) }
        val store = store(engine(failEdition = "network is down"), fs)
        store.loadToday()
        val ready = assertIs<EditionState.Ready>(store.today)
        assertEquals(true, ready.fromCache)
        assertTrue(
            ready.cacheReason!!.contains("network is down"),
            "cacheReason was ${ready.cacheReason}",
        )
    }

    // --- 4 -----------------------------------------------------------------

    @Test
    fun indexFailureWithNoCacheSurfacesTheRealCause() = runTest {
        val store = store(engine(failIndex = "no route to host"), fs())
        store.loadToday()
        val error = assertIs<EditionState.Error>(store.today)
        assertTrue(
            error.message.contains("no route to host"),
            "message was ${error.message}",
        )
    }

    // --- 5 -----------------------------------------------------------------

    @Test
    fun emptyIndexSaysNothingHasBeenPublished() = runTest {
        val store = store(engine(index = "[]"), fs())
        store.loadToday()
        val error = assertIs<EditionState.Error>(store.today)
        assertTrue(
            error.message.contains("No editions have been published"),
            "message was ${error.message}",
        )
    }

    // --- 6 -----------------------------------------------------------------

    @Test
    fun digestEditionHasNoBody() = runTest {
        val store = store(engine(edition = digestBody), fs())
        store.loadToday()
        val ready = assertIs<EditionState.Ready>(store.today)
        assertIs<DigestEdition>(ready.edition)
        assertNull(ready.body)
    }

    // --- the archive -------------------------------------------------------

    @Test
    fun archiveStartsLoadingBeforeAnythingIsRequested() {
        val store = store(engine(), fs())
        assertIs<ArchiveState.Loading>(store.archive)
    }

    @Test
    fun freshIndexIsAnArchiveNotFromCache() = runTest {
        val store = store(engine(), fs())
        store.loadArchive()
        val ready = assertIs<ArchiveState.Ready>(store.archive)
        assertEquals(1, ready.editionCount)
        assertEquals("2026-08-06", ready.latest)
        // One edition, so one month, with that day carrying it.
        val august = ready.months.single()
        assertEquals(listOf(2026, 8), listOf(august.year, august.month))
        val published = august.weeks.flatten().filterNotNull().filter { it.entry != null }
        assertEquals(listOf("2026-08-06"), published.map { it.date })
        assertEquals(false, ready.fromCache)
        assertNull(ready.cacheReason)
    }

    @Test
    fun cachedArchiveDisclosesTheNetworkError() = runTest {
        val fs = fs()
        fs.write(cacheDir / "index.json") { writeUtf8(indexBody) }
        val store = store(engine(failIndex = "network is down"), fs)
        store.loadArchive()
        val ready = assertIs<ArchiveState.Ready>(store.archive)
        assertEquals(1, ready.editionCount)
        assertEquals(true, ready.fromCache)
        assertTrue(
            ready.cacheReason!!.contains("network is down"),
            "cacheReason was ${ready.cacheReason}",
        )
    }

    @Test
    fun archiveFailureWithNoCacheSurfacesTheRealCause() = runTest {
        val store = store(engine(failIndex = "no route to host"), fs())
        store.loadArchive()
        val error = assertIs<ArchiveState.Error>(store.archive)
        assertTrue(
            error.message.contains("no route to host"),
            "message was ${error.message}",
        )
    }

    /** An empty archive is a fact about the data, not a failure to load it. */
    @Test
    fun emptyIndexIsAnEmptyArchiveNotAnError() = runTest {
        val store = store(engine(index = "[]"), fs())
        store.loadArchive()
        val ready = assertIs<ArchiveState.Ready>(store.archive)
        assertEquals(emptyList(), ready.months)
        assertEquals(0, ready.editionCount)
        assertNull(ready.latest)
    }

    /**
     * A date the calendar cannot place is a broken contract like any other, and
     * it must not crash the screen while it is being laid out.
     */
    @Test
    fun anIndexDateTheCalendarCannotPlaceIsAnErrorNotACrash() = runTest {
        val index = """[{"date":"2026-02-30","mode":"digest","count":3}]"""
        val store = store(engine(index = index), fs())
        store.loadArchive()
        val error = assertIs<ArchiveState.Error>(store.archive)
        assertTrue(
            error.message.contains("no such day"),
            "message was ${error.message}",
        )
    }

    // --- opening an edition from the archive -------------------------------

    @Test
    fun viewedStartsLoadingBeforeAnythingIsRequested() {
        val store = store(engine(), fs())
        assertIs<EditionState.Loading>(store.viewed)
    }

    @Test
    fun openEditionSubstitutesCitationsLikeTodayDoes() = runTest {
        val store = store(engine(), fs())
        store.openEdition("2026-08-06")
        val ready = assertIs<EditionState.Ready>(store.viewed)
        val edition = assertIs<ArticleEdition>(ready.edition)
        assertEquals("2026-08-06", edition.date)
        val body = ready.body!!
        assertTrue("[[" !in body.markdown, "an unsubstituted citation token survived")
        assertEquals(emptyList(), body.unresolved)
        assertEquals(false, ready.fromCache)
    }

    /** The whole reason `viewed` is a separate field from `today`. */
    @Test
    fun openEditionFailingLeavesTodayUntouched() = runTest {
        // The network works for the first load and fails afterwards, so one
        // store can hold a good `today` and a failed `viewed` at once.
        var broken = false
        val engine = MockEngine { request ->
            if (broken) throw RuntimeException("network is down")
            val body = if (request.url.encodedPath.endsWith("index.json")) indexBody else editionBody
            respond(body, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val store = store(engine, fs())

        store.loadToday()
        val todayBefore = assertIs<EditionState.Ready>(store.today)

        broken = true
        // A date `loadToday` did not cache, so this genuinely has nowhere to
        // fall back to — otherwise the cache would rescue it into `Ready`.
        store.openEdition("2026-08-05")

        val error = assertIs<EditionState.Error>(store.viewed)
        assertTrue(error.message.contains("network is down"), "message was ${error.message}")
        assertEquals(todayBefore, store.today)
    }
}
