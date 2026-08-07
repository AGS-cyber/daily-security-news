package dev.dailysecuritynews.app.net

import io.ktor.client.engine.HttpClientEngineFactory
import io.ktor.client.engine.darwin.Darwin

internal actual fun httpClientEngine(): HttpClientEngineFactory<*> = Darwin
