package dev.dailysecuritynews.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import dev.dailysecuritynews.app.net.editionRepository
import dev.dailysecuritynews.app.ui.EditionsStore
import dev.dailysecuritynews.app.ui.TodayScreen
import kotlinx.coroutines.launch
import okio.Path.Companion.toPath

const val APP_TITLE = "Daily Security News"

/**
 * [cacheDir] is passed in rather than discovered: the shared module has no
 * platform file API, and each host already knows its own caches directory.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App(cacheDir: String) {
    val store = remember(cacheDir) {
        EditionsStore(editionRepository(cacheDir.toPath()))
    }
    val scope = rememberCoroutineScope()

    LaunchedEffect(store) { store.loadToday() }

    MaterialTheme {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            topBar = { TopAppBar(title = { Text(APP_TITLE) }) },
        ) { padding ->
            Box(modifier = Modifier.padding(padding).fillMaxSize()) {
                TodayScreen(
                    state = store.today,
                    onRetry = { scope.launch { store.loadToday() } },
                )
            }
        }
    }
}
