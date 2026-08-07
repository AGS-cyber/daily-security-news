package dev.dailysecuritynews.app

import androidx.compose.ui.window.ComposeUIViewController
import platform.Foundation.NSCachesDirectory
import platform.Foundation.NSSearchPathForDirectoriesInDomains
import platform.Foundation.NSUserDomainMask

fun MainViewController() = ComposeUIViewController { App(cacheDir = iosCacheDir()) }

private fun iosCacheDir(): String =
    NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, true)
        .first() as String
