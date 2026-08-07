package dev.dailysecuritynews.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import dev.dailysecuritynews.app.net.editionRepository
import dev.dailysecuritynews.app.ui.ArchiveScreen
import dev.dailysecuritynews.app.ui.EditionScreen
import dev.dailysecuritynews.app.ui.EditionsStore
import kotlinx.coroutines.launch
import okio.Path.Companion.toPath

const val APP_TITLE = "Daily Security News"

/**
 * The three destinations. A sealed interface and one `mutableStateOf` is the
 * whole navigation requirement — a navigation library would be indirection
 * bought for two transitions, which is what `CLAUDE.md` calls a speculative
 * abstraction.
 */
private sealed interface Screen {
    data object Today : Screen
    data object Archive : Screen
    data class Edition(val date: String) : Screen
}

/**
 * [cacheDir] is passed in rather than discovered: the shared module has no
 * platform file API, and each host already knows its own caches directory.
 */
// `BackHandler` is still `@ExperimentalComposeUiApi` in Compose Multiplatform
// 1.11.1 — the opt-in is required to call it, and is the only thing that
// annotation costs us here.
@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
@Composable
fun App(cacheDir: String) {
    val store = remember(cacheDir) {
        EditionsStore(editionRepository(cacheDir.toPath()))
    }
    val scope = rememberCoroutineScope()
    var screen: Screen by remember { mutableStateOf(Screen.Today) }

    LaunchedEffect(store) { store.loadToday() }

    // Edition → Archive → Today, driving both the app bar's Back button and
    // Android's system back, so the two cannot disagree about where "back"
    // goes. A user's reflex is the system gesture, not the app bar.
    //
    // `BackHandler` is not in `compose.ui` — it ships in its own Compose
    // Multiplatform artifact, `org.jetbrains.compose.ui:ui-backhandler`, which
    // is why a back handler has a dependency line of its own in the catalog.
    // Disabled on Today so system back still exits the app from there.
    //
    // The deprecation warning names `NavigationEventHandler` as the
    // replacement. That was evaluated and rejected, not missed:
    // `androidx.navigationevent:navigationevent-compose` publishes only
    // `android`, `jvmstubs` and `linuxx64stubs` variants at both 1.0.0 and
    // 1.0.1 — no Apple targets — so `:shared:compileKotlinIosSimulatorArm64`
    // fails to resolve it. Migrating would mean an expect/actual split or an
    // Android-only source set, which a back button does not justify. Revisit
    // when that artifact publishes `iosarm64`/`iossimulatorarm64` the way the
    // base `navigationevent` module already does.
    val back: () -> Unit = {
        screen = when (screen) {
            is Screen.Edition -> Screen.Archive
            is Screen.Archive -> Screen.Today
            is Screen.Today -> Screen.Today
        }
    }
    BackHandler(enabled = screen !is Screen.Today, onBack = back)

    MaterialTheme {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            when (val current = screen) {
                                is Screen.Today -> APP_TITLE
                                is Screen.Archive -> "Archive"
                                is Screen.Edition -> current.date
                            },
                        )
                    },
                    navigationIcon = {
                        if (screen !is Screen.Today) {
                            // A text button, not an icon: the material-icons
                            // artifact is not on the classpath and an icon is
                            // not worth a dependency.
                            TextButton(onClick = back) { Text("Back") }
                        }
                    },
                    actions = {
                        if (screen is Screen.Today) {
                            TextButton(onClick = { screen = Screen.Archive }) {
                                Text("Archive")
                            }
                        }
                    },
                )
            },
        ) { padding ->
            Box(modifier = Modifier.padding(padding).fillMaxSize()) {
                when (val current = screen) {
                    is Screen.Today -> EditionScreen(
                        state = store.today,
                        onRetry = { scope.launch { store.loadToday() } },
                    )

                    is Screen.Archive -> {
                        LaunchedEffect(Unit) { store.loadArchive() }
                        ArchiveScreen(
                            state = store.archive,
                            onSelect = { date -> screen = Screen.Edition(date) },
                            onRetry = { scope.launch { store.loadArchive() } },
                        )
                    }

                    is Screen.Edition -> {
                        LaunchedEffect(current.date) { store.openEdition(current.date) }
                        EditionScreen(
                            state = store.viewed,
                            onRetry = { scope.launch { store.openEdition(current.date) } },
                        )
                    }
                }
            }
        }
    }
}
