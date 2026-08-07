package dev.dailysecuritynews.app.net

import io.ktor.client.engine.HttpClientEngineFactory

/**
 * The platform HTTP engine, named explicitly rather than discovered off the
 * classpath. Auto-discovery fails at runtime with no engine and no compile
 * error; an `expect`/`actual` fails at compile time on the platform that is
 * missing one — `CLAUDE.md`'s fail-loud rule applied to the build.
 */
internal expect fun httpClientEngine(): HttpClientEngineFactory<*>
