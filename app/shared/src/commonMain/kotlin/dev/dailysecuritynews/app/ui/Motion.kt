package dev.dailysecuritynews.app.ui

import androidx.compose.runtime.Composable

/**
 * Whether the reader has asked the system to reduce motion — the app's
 * equivalent of the site's `@media (prefers-reduced-motion: reduce)`.
 *
 * Compose Multiplatform exposes no common API for this, so it takes the same
 * `expect`/`actual` shape the HTTP engine uses in `net/HttpClientFactory.kt`:
 * a platform that cannot answer fails at compile time rather than at runtime.
 *
 * It is `@Composable` rather than a plain function because the Android answer
 * needs a `Context`, and `LocalContext` is the composition-scoped way to get
 * one. A plain function would have to take a `Context` parameter that iOS has
 * no use for, and every call site would then have to thread it down.
 */
@Composable
internal expect fun prefersReducedMotion(): Boolean
