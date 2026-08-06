package dev.dailysecuritynews.app.net

import dev.dailysecuritynews.app.data.Edition
import dev.dailysecuritynews.app.data.EditionJson
import dev.dailysecuritynews.app.data.EditionSummary
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import okio.FileSystem
import okio.Path

/** Dates arrive from the server's index — data, not trusted input. */
private val DATE = Regex("""\d{4}-\d{2}-\d{2}""")

/**
 * Reads the two static endpoints in `docs/app.md` §4, caching the raw response
 * text on disk so the app still reads offline.
 *
 * Network-first. When the network or the decode fails, a cached copy is
 * returned as [Load.Cached] carrying the *original* error, so the caller can
 * disclose the degraded mode rather than pass yesterday's news off as today's.
 *
 * Client, file system, cache directory and base URL are all constructor
 * parameters rather than globals: that is what lets the tests drive the whole
 * class with `MockEngine` and `FakeFileSystem` and no network at all.
 */
class EditionRepository(
    private val client: HttpClient,
    private val fileSystem: FileSystem,
    private val cacheDir: Path,
    private val baseUrl: String = "https://daily-security-news.vercel.app",
) {
    suspend fun loadIndex(): Load<List<EditionSummary>> = load(
        url = "$baseUrl/editions/index.json",
        cacheFile = cacheDir / "index.json",
        decode = { EditionJson.decodeFromString<List<EditionSummary>>(it) },
    )

    suspend fun loadEdition(date: String): Load<Edition> {
        // Validated before it can become a URL path or a file path, so a value
        // like `../../../etc/passwd` never reaches either.
        require(DATE.matches(date)) { "not an ISO date: $date" }
        return load(
            url = "$baseUrl/editions/$date.json",
            cacheFile = cacheDir / "edition-$date.json",
            decode = { EditionJson.decodeFromString<Edition>(it) },
        )
    }

    private suspend fun <T> load(
        url: String,
        cacheFile: Path,
        decode: (String) -> T,
    ): Load<T> {
        val cause = try {
            val response = client.get(url)
            // A non-2xx body is an error page, never an edition — do not parse it.
            if (!response.status.isSuccess()) {
                error("GET $url failed: ${response.status}")
            }
            val text = response.bodyAsText()
            val value = decode(text)
            writeCache(cacheFile, text)
            return Load.Fresh(value)
        } catch (t: Throwable) {
            t
        }

        val cached = try {
            fileSystem.read(cacheFile) { readUtf8() }
        } catch (_: Throwable) {
            null
        } ?: return Load.Failed(cause)

        return try {
            // `cause` is the original network/decode error, not a cache error:
            // that is the failure worth disclosing.
            Load.Cached(decode(cached), cause)
        } catch (_: Throwable) {
            Load.Failed(cause)
        }
    }

    /**
     * The raw response text is cached, not re-encoded objects, so a field the
     * site adds survives a round trip through the cache.
     *
     * The one deliberately swallowed error in this class: a cache write that
     * fails has not damaged a fetch that already succeeded, and failing a good
     * load because the disk is full would be strictly worse for the reader.
     */
    private fun writeCache(cacheFile: Path, text: String) {
        try {
            fileSystem.createDirectories(cacheDir)
            fileSystem.write(cacheFile) { writeUtf8(text) }
        } catch (_: Throwable) {
            // Intentionally ignored — see above.
        }
    }
}

/** Assembles a repository with the platform HTTP engine. */
fun editionRepository(
    cacheDir: Path,
    fileSystem: FileSystem = FileSystem.SYSTEM,
): EditionRepository = EditionRepository(
    client = HttpClient(httpClientEngine()),
    fileSystem = fileSystem,
    cacheDir = cacheDir,
)
