package dev.dailysecuritynews.app.ui

import androidx.compose.runtime.Composable
import platform.UIKit.UIAccessibilityIsReduceMotionEnabled

/** Settings → Accessibility → Motion → Reduce Motion. */
@Composable
internal actual fun prefersReducedMotion(): Boolean =
    UIAccessibilityIsReduceMotionEnabled()
