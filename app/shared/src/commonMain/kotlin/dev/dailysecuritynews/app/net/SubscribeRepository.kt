package dev.dailysecuritynews.app.net

import io.ktor.client.HttpClient
import io.ktor.client.request.forms.submitForm
import io.ktor.client.statement.bodyAsText
import io.ktor.http.Parameters
import io.ktor.http.isSuccess

/**
 * Subscribes a reader to the email edition.
 *
 * It posts to the same keyless endpoint the website's form posts to
 * ([SUBSCRIBE_URL]), as an ordinary `application/x-www-form-urlencoded`
 * submission. **That the endpoint needs no key is the reason the app can do
 * this at all** — an API key shipped inside a binary is an extracted API key,
 * so the alternative would have been a server of our own, which this project
 * does not have and did not want (`docs/design.md` §12).
 *
 * Buttondown owns everything that follows: it sends the confirmation email,
 * holds the subscriber, and handles unsubscribes. Nothing here stores a reader.
 *
 * [Load] is deliberately **not** reused. Its whole purpose is cache
 * provenance — `Cached` is a value plus the network error that made it a
 * fallback — and a POST has neither a cache nor a fallback. Bending it around
 * this would mean a case that can never occur.
 */
class SubscribeRepository(
    private val client: HttpClient,
    private val subscribeUrl: String = SUBSCRIBE_URL,
) {
    /**
     * Throws on anything short of a 2xx, with the status and the response body
     * in the message — the screen shows it verbatim, and a reader who can see
     * the real reason can report it (`docs/app.md` §10).
     */
    suspend fun subscribe(email: String) {
        val response = client.submitForm(
            url = subscribeUrl,
            formParameters = Parameters.build {
                append("email", email)
                // What Buttondown's own embed form sends; it marks the
                // submission as coming from an embedded form rather than its
                // hosted page.
                append("embed", "1")
            },
        )

        if (!response.status.isSuccess()) {
            val body = response.bodyAsText().trim().take(300)
            throw IllegalStateException(
                "POST $subscribeUrl failed: ${response.status}" + if (body.isEmpty()) "" else " — $body",
            )
        }
    }
}

/**
 * The keyless embed endpoint, mirroring `src/config/newsletter.ts` on the site.
 * Nothing ties the two together, so a change there has to reach here by hand —
 * the same hand-maintained mirror as the palette (`docs/app.md` §11).
 *
 * **`AGS` is upper case deliberately.** Buttondown canonicalises the account
 * name and 302-redirects the lower-case spelling. Ktor follows redirects by
 * default and, like every HTTP client, turns a 302 on a POST into a GET — the
 * address would be dropped and the screen would report success. The canonical
 * spelling never redirects, so the question never arises.
 */
const val SUBSCRIBE_URL: String =
    "https://buttondown.com/api/emails/embed-subscribe/AGS"

/** Assembles a repository with the platform HTTP engine, as [editionRepository] does. */
fun subscribeRepository(): SubscribeRepository = SubscribeRepository(HttpClient(httpClientEngine()))
