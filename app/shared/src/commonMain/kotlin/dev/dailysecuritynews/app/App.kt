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
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import dev.dailysecuritynews.app.net.editionRepository
import dev.dailysecuritynews.app.ui.ArchiveScreen
import dev.dailysecuritynews.app.ui.DailySecurityNewsTheme
import dev.dailysecuritynews.app.ui.EditionScreen
import dev.dailysecuritynews.app.ui.EditionsStore
import dev.dailysecuritynews.app.ui.PhosphorGlow
import dev.dailysecuritynews.app.ui.Terminal
import dev.dailysecuritynews.app.ui.scanlines
import kotlinx.coroutines.launch
import okio.Path.Companion.toPath

const val APP_TITLE = "Daily Security News"

/**
 * The site's brand lockup — `header .brand::before { content: "root@sec:~$ " }`
 * followed by the brand itself.
 *
 * One [AnnotatedString] rather than two composables, so the prompt and the
 * name can never wrap apart from each other. The prompt is decoration drawn
 * here, never part of any data.
 *
 * The site's brand text is `daily-security-news`, which is deliberately not
 * [APP_TITLE] — that constant stays the Android launcher label.
 */
private val BrandLockup: AnnotatedString = buildAnnotatedString {
    withStyle(SpanStyle(color = Terminal.dim, fontWeight = FontWeight.Normal)) {
        append("root@sec:~$ ")
    }
    withStyle(
        SpanStyle(
            color = Terminal.bright,
            fontWeight = FontWeight.Bold,
            shadow = PhosphorGlow,
        ),
    ) {
        append("daily-security-news")
    }
}

/**
 * Every app-bar title, at the site's header size.
 *
 * `TopAppBar` styles its title slot `titleLarge` — 22sp — and the brand lockup
 * does not fit that beside the `[archive]` action on a 1080px screen: it wrapped
 * onto two lines and the bar grew to fit. The site's `header .brand` is **16px**,
 * the same as its body text, so the brand is not a large title there either.
 *
 * The override is here rather than on `Typography.titleLarge`, which the Markdown
 * renderer's `h1`/`h2` mapping depends on (`docs/app.md` §10), and rather than at
 * each `Text` call, so the three titles cannot drift apart. `TopAppBar` provides
 * its style through `LocalTextStyle`, which an explicit `style` argument replaces.
 */
@Composable
private fun BarTitle(text: AnnotatedString) {
    // 14sp, not the app bar's default 22sp `titleLarge`. The brand lockup is
    // 31 monospace characters, and anything larger wraps `root@sec:~$` onto
    // its own line above `daily-security-news` — which reads as a shell prompt
    // with the command on the wrong line, the one arrangement a terminal never
    // shows. No `maxLines`: the site's own header is `flex-wrap: wrap`, so
    // wrapping on a genuinely narrow screen matches it, whereas clipping the
    // brand would not.
    Text(text, style = MaterialTheme.typography.bodyMedium)
}

@Composable
private fun BarTitle(text: String) = BarTitle(AnnotatedString(text))

/**
 * `.nav a::before/::after` — the brackets are `dim`, the label is `link`. One
 * annotated string so a bracket cannot be orphaned from its label.
 */
private fun bracketNav(label: String): AnnotatedString = buildAnnotatedString {
    val brackets = SpanStyle(color = Terminal.dim)
    withStyle(brackets) { append("[") }
    withStyle(SpanStyle(color = Terminal.link)) { append(label) }
    withStyle(brackets) { append("]") }
}

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

    DailySecurityNewsTheme {
        Scaffold(
            // The scanline overlay sits on the Scaffold, not on the content
            // slot, so it covers the app bar too — the site's overlay is
            // `position: fixed` over the whole viewport.
            modifier = Modifier.fillMaxSize().scanlines(),
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                TopAppBar(
                    title = {
                        when (val current = screen) {
                            is Screen.Today -> BarTitle(BrandLockup)
                            is Screen.Archive -> BarTitle("archive")
                            is Screen.Edition -> BarTitle(current.date)
                        }
                    },
                    navigationIcon = {
                        if (screen !is Screen.Today) {
                            // A text button, not an icon: the material-icons
                            // artifact is not on the classpath and an icon is
                            // not worth a dependency.
                            TextButton(onClick = back) { Text(bracketNav("back")) }
                        }
                    },
                    actions = {
                        if (screen is Screen.Today) {
                            // Exactly one action, and that is a constraint,
                            // not a preference. A second one was tried once
                            // and it narrowed the title slot enough to wrap
                            // the brand lockup onto two lines on a 1080px
                            // screen, which is the precise failure §11 exists
                            // to prevent.
                            TextButton(onClick = { screen = Screen.Archive }) {
                                Text(bracketNav("archive"))
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background,
                        scrolledContainerColor = MaterialTheme.colorScheme.background,
                    ),
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
