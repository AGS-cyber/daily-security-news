package dev.dailysecuritynews.app.data

import kotlinx.serialization.json.Json

/**
 * Shared decoder for everything under /editions/.
 *
 * `ignoreUnknownKeys` because the site's schema keeps evolving and the app
 * does not gate the site's deploys — docs/app.md §4. Note what is NOT set:
 * `coerceInputValues` would turn an unrecognised value into a default and
 * render a plausible-looking screen from data the server never sent.
 */
val EditionJson: Json = Json {
    ignoreUnknownKeys = true
}
