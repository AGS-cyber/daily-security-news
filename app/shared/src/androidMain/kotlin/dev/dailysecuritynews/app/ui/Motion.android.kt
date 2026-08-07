package dev.dailysecuritynews.app.ui

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/**
 * `ANIMATOR_DURATION_SCALE` is the setting Android's own "Remove animations"
 * accessibility toggle writes; it is `0` exactly when the user has asked for
 * no animation.
 */
@Composable
internal actual fun prefersReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return Settings.Global.getFloat(
        resolver,
        Settings.Global.ANIMATOR_DURATION_SCALE,
        1f,
    ) == 0f
}
