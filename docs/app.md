# Native App — Design

The mobile app that reads the same editions the website publishes.
`design.md` covers the pipeline and the site; this file covers the app and
the contract between them. Read both before changing either.

## 1. Purpose and scope

One Kotlin codebase, compiled natively for Android and iOS, that displays
today's article and the archive. **The website is unchanged and stays the
primary product** — the app is a second reader over the same data, not a
replacement and not a rewrite.

Version 1 was **read-only**: fetch, display, cache for offline. It now has
exactly one write — subscribing to the email edition (§12), which is neither
"settings" nor "accounts" below: it posts an address to Buttondown and keeps
nothing. Otherwise, deliberately out of scope, each its own later decision:

- Push notifications. The obvious feature, and the one thing an app buys
  that a bookmark doesn't — but it needs a device-token registry (new
  persistent state, new privacy surface) and a notify step in the workflow.
  Layered on after the app works end to end, per `design.md` §10's rule.
- Store submission, signing, TestFlight/Play Console.
- ~~App icon and branding.~~ Done on 2026-08-07 for Android (§11). The iOS
  `AppIcon.appiconset` is still empty — it needs raster PNGs, which iOS being
  deprioritised has not earned yet.
- Search, settings, accounts, offline archive beyond the last-read edition.

## 2. Stack

**Kotlin Multiplatform (KMP) with Compose Multiplatform (CMP).** One
codebase sharing *UI as well as logic*, compiled to a real native binary on
both platforms. Not a WebView wrapper, not React Native, not Flutter.

This follows from two constraints together: the app should be Kotlin-native,
and it should cover both platforms. Separate Kotlin/Compose and Swift/SwiftUI
codebases would satisfy the first but double the work; CMP satisfies both,
and has been stable on iOS since 1.8.0.

| Component | Version |
|---|---|
| Kotlin | 2.4.10 |
| Compose Multiplatform | 1.11.1 |
| Android Gradle Plugin | 9.3.1 |
| Gradle | 9.7.0 |
| compileSdk / targetSdk | 36 |
| minSdk | 24 |
| Apple targets | `iosArm64`, `iosSimulatorArm64` |

`compileSdk` is 36 rather than 37 because 37 is still churning through
`37.0` / `37.1` / `37.2-beta` under a new fractional-versioning scheme.

That pin has one consequence worth recording, because it looks like an
oversight otherwise. **`com.mikepenz:multiplatform-markdown-renderer-m3` is
held at 0.41.0**, not the current 0.43.0: 0.42.0 and later publish AAR
metadata demanding that consumers compile against API 37 or higher, so
`assembleDebug` fails outright at `checkDebugAarMetadata`. 0.41.0 renders
what this app needs. Moving the whole project to 37 to pick up one library's
point releases is the wrong trade while 37 is still unstable — revisit both
together, not separately.

## 3. Module layout

```
app/
  shared/      KMP library — commonMain, commonTest, iosMain.
               All shared UI and logic. Produces the iOS framework
               (baseName "ComposeApp", static).
  androidApp/  Android application — MainActivity, manifest, strings.
               Depends on :shared. Holds applicationId and versioning.
  iosApp/      SwiftUI host — @main entry, UIViewControllerRepresentable
               bridge to the shared Compose UIViewController.
```

**The two-module split is forced, and worth understanding before anyone
tries to simplify it back.** AGP 9 stopped supporting
`com.android.application` in the same Gradle subproject as
`org.jetbrains.kotlin.multiplatform`. Google's own migration note is
explicit: *"The new KMP integration does not support using KMP and the
Android Application plugin in the same Gradle subproject. To migrate,
extract your Android app to a separate subproject."* There is no
`com.android.kotlin.multiplatform.application` — the new KMP plugin is
library-only.

The single-module layout the KMP wizard still generates **does** build, but
only with `android.builtInKotlin=false` and `android.newDsl=false`, which
AGP documents as removed in version 10. That is precisely the stopgap
`CLAUDE.md` forbids, so the split was done while the app was still an empty
scaffold rather than after five layers of code sat on top of it. Neither
flag is in `gradle.properties`, and neither should come back.

`shared` therefore applies `com.android.kotlin.multiplatform.library` and
configures Android inside `kotlin { android { … } }` — not a top-level
`android { }` block. Its Android test source set is `androidHostTest`, not
`test`, which renames the Gradle task (§6).

## 4. Data contract

The app has **no backend**. It reads two static JSON files that the existing
Vercel deploy already serves, written by `writeSite()` in
`src/render/site.ts` alongside the HTML:

| URL | Content |
|---|---|
| `/editions/index.json` | `{date, mode, count, headline?}[]`, newest first — the archive index, same data as `archive.html` |
| `/editions/YYYY-MM-DD.json` | One `Edition`, byte-identical to `data/editions/YYYY-MM-DD.json` |

Base URL: `https://daily-security-news.vercel.app`.

**Both endpoints are live** as of 2026-08-07, and the served editions are
byte-identical to the committed `data/editions/` blobs.

They 404'd until `site/editions/` reached `origin/main`, which is worth
remembering the next time they appear to break. Vercel deploys the pushed
branch, not the working tree, so committing the JSON locally is not the same
as publishing it — `/` and `/archive.html` serve happily from an older
deploy while `/editions/*.json` does not exist. Check with a plain `curl`
before concluding the app's networking is broken.

When comparing a served file against `data/editions/` on a Windows checkout,
compare against the **git blob**, not the working file. `core.autocrlf`
rewrites the checkout to CRLF, so a byte comparison fails by exactly one
byte per line and looks like a broken contract when nothing is wrong.

This is the whole reason the app needed no new infrastructure. `site/` is
already committed and already deployed, so anything written there is a
public URL for free. `data/` is *not* deployed — only `site/` is — which is
why the record is copied rather than linked.

Two consequences for the Kotlin side:

- **Parse with `ignoreUnknownKeys = true`.** The site's schema will keep
  evolving and the app does not gate its deploys. A purely additive field
  must not hard-fail an installed app.
- **Test the models against a real captured edition**, not a hand-written
  fixture. The Kotlin data classes mirror `src/types.ts` with no compiler
  tie between them, so a fixture copied from `data/editions/` is the only
  thing that catches drift.

`Item` and `SelectedItem` are separate flat classes because `selected` is
`Item & Selection` in TypeScript — an intersection, not a nested object. A
`Story` interface carries the nine fields they share, so the renderer can
treat a selected story and a merely-collected one the same way.

The interface now also carries `cves: List<VulnerabilityIntelligence>`. The
Kotlin mirror intentionally models only the fields the app presents — CVE ID,
KEV status, ransomware-use flag, chosen CVSS score/severity, and provenance
links — while `ignoreUnknownKeys` preserves the richer NVD/KEV record in the
raw cached JSON. `cves` defaults to an empty list as the one historical-schema
exception: editions published before enrichment are permanent records and
must remain readable without being rewritten with facts they never collected.

**`section`, `sourceKind` and `stage` are `String`, not enums.**
`ignoreUnknownKeys` does not cover unknown enum *values*: one new section
name on the site would hard-fail every installed app. The obvious repair,
`coerceInputValues`, is worse — it rewrites the unrecognised value to a
default and renders a screen from data the server never sent, which is
exactly the silent degradation `CLAUDE.md` ranks last. So the strings
survive the parse and the display layer maps them. `mode` is the deliberate
exception: it picks the renderer, so a mode the app does not know must fail
loudly, which the sealed `Edition` gives for free.

Only fields TypeScript marks optional carry a Kotlin default. A missing
required field throws — a removed field is a broken contract, not an
additive change.

### The fixture is the real file

`app/shared/src/commonTest/fixtures/` holds byte-identical copies of what
the deploy serves, and `:shared:generateJsonFixtures` compiles them into a
Kotlin source file that `commonTest` reads. Three constraints shaped that,
none of them obvious:

- **`commonTest` has no multiplatform file API**, so the JSON has to arrive
  as source rather than as a resource read at runtime.
- **A JVM string literal cannot exceed 64 KB of UTF-8** and the captured
  edition is 106 KB, so the generator emits it in chunks. It escapes every
  non-ASCII character as `\uXXXX` — that keeps the generated file pure ASCII
  and makes a chunk boundary landing between a surrogate pair harmless — and
  escapes `$`, which edition text really does contain and which would
  otherwise be a Kotlin template expression.
- **`org.gradle.configuration-cache=true` is on**, so the generator is a
  typed task with annotated inputs and outputs, not a `doLast { }` closure
  capturing project state.

## 5. Citations — where the app must not copy the web

`bodyMarkdown` cites stories as `[[s7]]` tokens; the renderer substitutes
the real link. The web does this in `src/render/citations.ts` by emitting a
raw HTML anchor, specifically because story titles routinely contain `]`,
`)` and `*`, which would corrupt Markdown link syntax. `marked` passes
inline HTML through untouched, so that works there.

A Compose Markdown renderer has no such escape hatch, so the app must emit a
**CommonMark link with the title escaped** — and the escaping has two traps
that are easy to get wrong and produce silent corruption rather than a
crash:

1. **Escape `\` first**, before the other characters. A title ending in a
   backslash otherwise combines with the synthetic closing `]`, CommonMark
   reads it as an escaped bracket, the link never closes, and every
   character after it in the article parses wrong.
2. **Escape the parentheses in the URL.** News URLs routinely contain them,
   and an unbalanced one ends a link destination early and swallows the rest
   of the link.

Both belong in an adversarial unit test: trailing backslash, nested
brackets, doubled `*`/`_`, and a URL containing parens. This is the highest
risk seam in the app — everything else fails visibly, but a citation bug
renders a plausible-looking screen with nothing wrong server-side.

`substituteCitations` in `app/shared/.../render/Citations.kt` resolves both
traps with two decisions:

**It backslash-escapes every ASCII punctuation character in the title**,
rather than a curated list of the dangerous ones. CommonMark guarantees a
backslash escape works for any of them, so escaping all of them is always
valid, and it removes a judgment call that would rot the moment the renderer
changes. Under-escaping has two grades of failure and both are unacceptable:
an unbalanced `]` corrupts the document structure, and a stray `*` pair
silently italicises part of a headline — the "looks fine but is wrong" case
this project ranks last.

**The destination is bare, and must stay bare.** An earlier version wrapped
it — `[title](<url>)` — which is valid CommonMark and was the wrong choice
anyway: `org.intellij.markdown`, the parser the Compose renderer runs on,
files an angle-bracketed destination under an `AUTOLINK` node rather than
`LINK_DESTINATION`, resolves it to `href=""`, and renders the citation as
**plain text with no link at all**. Nothing failed; the article simply
stopped having links in it, which is exactly the class of bug this section
exists to prevent, arriving through the renderer instead of the escaping.
So the destination escapes `\`, `(`, `)`, `<` and `>` with backslashes, and
percent-encodes anything at or below `0x20` plus `0x7F` — a space cannot
appear in a bare destination and CommonMark has no backslash escape for one,
so encoding is the only form that survives.

The lesson generalises past this bug: **spec-correct is not the same as
renders-correctly.** Both forms are valid CommonMark; only one of them works
in the renderer the app actually ships.

**Both escapers are a single pass over the characters**, which dissolves
trap 1 rather than handling it: there is no second pass to re-process the
backslashes the first one emitted. The ordering trap only exists for a chain
of `String.replace` calls, so do not rewrite them as one. The
trailing-backslash test stays regardless, as the guard against someone doing
exactly that.

Verified three ways, and it took all three. Exact-string unit tests in
`CitationsTest`; a round trip through `marked`, the site's own parser; and
`CitationMarkdownTest`, which parses the substituted body with
`org.intellij.markdown` — the renderer's own parser — and asserts every
anchor's `href` and text come back equal to the story's URL and title.

Only the third catches the angle-bracket defect, and it caught it only after
being fixed: the first version of that test read destinations out of the
parse tree and stripped the backslashes and angle brackets before comparing.
It passed against a screen that showed no links. **A test that normalises
its input before asserting is testing the normaliser** — if a citation
assertion needs to clean up the value first, that is the bug, not the
cleanup.

### An unresolved citation does not throw

The web throws on a citation with no matching story, because it runs at
publish time where a throw stops a bad page from ever existing. The app runs
against an edition that is *already published*, so the same throw would
blank an otherwise fine article over one bad token. It therefore leaves the
literal `[[s7]]` in the text and returns the id in
`CitationResult.unresolved`, so the screen can disclose it. That is
`CLAUDE.md`'s "falls back visibly" tier, which outranks "fails with a clear
error" — the token reads as obviously broken to anyone looking at it.

## 6. Building

Requires JDK 21 and an Android SDK; no Android Studio needed. From `app/`:

```
.\gradlew.bat :androidApp:assembleDebug
.\gradlew.bat :shared:testAndroidHostTest
.\gradlew.bat :shared:compileKotlinIosSimulatorArm64
.\gradlew.bat :shared:compileKotlinIosArm64
```

**Three traps, every one of which produces a false green:**

- The test task is `:shared:testAndroidHostTest`. It is *not*
  `testDebugUnitTest` — the new KMP library plugin renames the source set,
  and the old name simply doesn't exist.
- **`linkDebugFrameworkIosSimulatorArm64` silently SKIPS on Windows.** Its
  `onlyIf` requires macOS, and a skipped task is not a failed task, so the
  build goes green having verified nothing. Use the `compileKotlinIos…`
  tasks above, which actually execute. Reserve the link task for a macOS
  runner.
- **`withHostTest {}` in `shared`'s `kotlin { android { … } }` block is
  load-bearing.** Without it the plugin registers no JVM test task at all
  and merely warns that `commonTest` exists but host tests are not enabled.
  Every test in the module then silently stops running while the build
  stays green. Do not remove it.
- **A cached compile task replays no compiler diagnostics.**
  `org.gradle.caching=true` is on, so a plain `assembleDebug` after a
  `clean` can print no warnings at all while the same build with
  `--rerun-tasks --no-build-cache` prints several — the Kotlin compile came
  back `FROM-CACHE` and warnings are not part of what is cached. A build
  that looks warning-free may simply not have compiled anything. Use
  `--rerun-tasks --no-build-cache` before concluding a warning is gone.

`shared`'s Android namespace is `dev.dailysecuritynews.app.shared` — AGP
requires namespaces to be unique per module, and `androidApp` owns the
unsuffixed one because it holds the manifest and resources.

**`app/gradlew` is mode `100644` in git — not executable.** It was committed
from Windows, where the bit is meaningless. Nothing local notices, because
`gradlew.bat` is what runs here, but any Linux or macOS checkout gets a
wrapper it cannot execute. Anything running the wrapper off a fresh clone
needs `chmod +x ./gradlew` first. Check with `git ls-files -s app/gradlew`
before assuming otherwise.

## 7. What is verified, and what is not

Verified on a Pixel 7 / Android 16 emulator: the app assembles, installs,
launches, and renders. Both Apple targets compile.

**The hand-written Xcode project is no longer unproven.** A macOS runner
parsed and built it on 2026-08-07 (§8 step 7): `project.pbxproj` and the
shared scheme parse, the Swift host compiles for `arm64`, `Info.plist` is
processed, and the app binary *links* — `BUILD SUCCEEDED`, not merely "no
errors reported".

That link is the interesting part, because the project looks like it should
not link at all. The framework is **static**, the `PBXFrameworksBuildPhase`
is **empty**, and there is no `OTHER_LDFLAGS`. Nothing names `ComposeApp` to
the linker. It works because Clang synthesises the link for a framework
module that declares no `link` libraries of its own, so `import ComposeApp`
emits the linker option itself, and `FRAMEWORK_SEARCH_PATHS` is all the
project has to supply. The current `Kotlin/KMP-App-Template` — two Apple
targets, no `iosX64`, static framework, empty frameworks phase — ships the
same shape. **Do not "fix" this by adding `-framework ComposeApp`.** It is
not missing.

Two build settings are load-bearing, and both were added by review *before*
the first run rather than after it. Each trips a diagnostic the Kotlin
Gradle plugin declares **FATAL**, so each would have failed the job outright:

- **`EXCLUDED_ARCHS[sdk=iphonesimulator*] = x86_64`.** The shared module has
  no `iosX64` target, but the simulator SDK's `ARCHS_STANDARD` includes
  `x86_64` on Apple silicon — and `ONLY_ACTIVE_ARCH = YES` does not save
  you, because it needs an active run destination and a *generic* simulator
  destination has none. Xcode then asks Kotlin for an architecture that does
  not exist, and the plugin refuses to build it.
- **`ENABLE_USER_SCRIPT_SANDBOXING = NO`.** The target shells out to Gradle
  from a run-script phase, which writes outside the sandboxed output
  directory. Left unset, the value is inherited from the toolchain rather
  than chosen — not something to leave to chance in a file nothing had ever
  parsed.

`embedAndSignAppleFrameworkForXcode` reports `SKIPPED`, which looks like
§6's Windows false-green and is not the same thing. The embed step is gated
on the framework *not* being static: a static framework is linked into the
binary and must not be copied into the `.app`. Its dependencies still run,
and those are what write `shared/build/xcode-frameworks/…` where
`FRAMEWORK_SEARCH_PATHS` expects it. `EXPANDED_CODE_SIGN_IDENTITY` is
likewise not required — signing is skipped when it is absent.

**Still not verified: the iOS app has never been run.** It has been built,
which is a different claim. §10 is the record of how much a build can miss —
three defects there survived a fully green 57-test suite and appeared only
on a screen. Nothing has launched this app in a simulator, so no one has
seen an iOS screen render. Framework *embedding* and real signing stay
unexercised for the same reason.

`dev.dailysecuritynews.app` is a placeholder bundle id on both platforms.

## 8. Build order

Same rule as `design.md` §10 — each layer ends with something that works.

1. ~~**Data.**~~ Done — `site/editions/*.json` (§4).
2. ~~**Scaffold.**~~ Done — modules, both platforms compiling, Android
   running (§3, §7).
3. ~~**Models.**~~ Done — kotlinx.serialization classes mirroring
   `src/types.ts`, decoding the captured 2026-08-06 edition (§4).
4. ~~**Citations.**~~ Done — the substitution function and its adversarial
   tests (§5). Isolated deliberately: it is the one bug class with no
   server-side signal.
5. ~~**Networking and cache.**~~ Done — Ktor client against the two
   endpoints; Okio file cache of the last fetch for offline reading (§9).
6. **Screens.** Split in two, because the first half is already a usable
   product on its own.
   - a. ~~**Today.**~~ Done — the newest edition, both `article` and
     `digest` modes, all three banners, and explicit loading/offline/error
     states (§10). Verified on the emulator.
   - b. ~~**Archive.**~~ Done — the list from `index.json`, navigation to a
     past edition, system back, and the heading-hierarchy fix (§10).
7. ~~**CI.**~~ Done — `.github/workflows/app-ci.yml`. An `android` job on
   ubuntu runs the tests and assembles the APK; an `ios` job on macOS links
   the framework *and* runs `xcodebuild`, because the link task alone never
   touches the Swift code or the project file. Both jobs passed on
   2026-08-07, with 57 tests executed in CI and the Xcode project built for
   the first time (§7).

   **The prediction that the first run would fail was wrong, and the reason
   matters.** Two defects that would each have failed it were found by
   reading the project against the official KMP template beforehand, and
   fixed in the same change (§7). Expecting a failure is not the same as
   accepting one: the hand-written file was reviewable all along, and
   reviewing it was cheaper than a macOS runner discovering it.

   Two things the `ios` job does that read as mistakes and are not. It
   installs the **Android** SDK, because Gradle configures every subproject
   under `app/` — including `:androidApp` — before it will run any task, so
   the framework link cannot be reached without an SDK location. And it
   pins `ARCHS=arm64` even though the project already excludes `x86_64`
   (§7); the exclusion lives in the project so local Xcode builds inherit
   it, and the pin lives in CI so the job does not depend on a file that,
   at the time it was written, nothing had ever parsed.

## 9. Networking and cache

`EditionRepository` reads the two endpoints network-first and caches the
**raw response text** on disk, so a field the site adds survives a round
trip through the cache. Ktor 3 with the OkHttp engine on Android and Darwin
on iOS, chosen through a three-line `expect`/`actual` rather than
classpath auto-discovery — an engine that fails to be discovered fails at
runtime, and this way it fails at compile time instead.

No `ContentNegotiation` plugin. The module already has a configured
`EditionJson`; the body is read with `bodyAsText()` and decoded explicitly,
which is fewer moving parts and keeps a decode failure visible at the call
site instead of inside a plugin.

**Cached data is a disclosed mode, not a silent one.** Every load returns
`Load.Fresh`, `Load.Cached` or `Load.Failed`, and `Cached` carries the
original network error rather than swallowing it, so the screen can say
*why* it is showing an older edition. A caller cannot accidentally render
yesterday's news as today's, because it cannot get at the value without
seeing which case it is in. `Failed` likewise carries the network error, not
a cache error — the network failure is the one worth reporting.

One error is deliberately swallowed, and only one: a **cache write** that
fails leaves an already-successful fetch alone rather than failing a good
load because the disk is full. It is commented as such at the swallow site.

`loadEdition` validates its date against `\d{4}-\d{2}-\d{2}` before it can
become either a URL path or a file path. Dates come from the server's index,
which is data rather than trusted input, and the check is what stops a value
like `../../../etc/passwd` reaching the file system. It throws rather than
returning `Failed`: a malformed date is a bug in the caller, not a runtime
condition to render.

There is no eviction policy. §1 puts a real offline archive out of scope for
v1, and a handful of small JSON files does not warrant one yet.

Constructor injection throughout — client, file system, cache directory and
base URL are all parameters — which is what lets the tests drive the whole
class with Ktor's `MockEngine` and Okio's `FakeFileSystem`, serving the real
captured edition, without touching the network. The Android host needs
`INTERNET` in its manifest; without it every request fails at runtime on a
build that compiled perfectly.

## 10. The screens

`EditionsStore` turns a `Load` result into one `EditionState` — `Loading`,
`Ready` or `Error` — and `EditionScreen` renders each. **There is no fourth,
blank case**, which is the point: `design.md` §8's disclosure rule says a
degraded mode has to be visible, and three of these states exist only to
make failure legible.

- `Error` shows the underlying message **verbatim**, plus Retry. A reader
  who can see `GET …/editions/index.json failed: 404` can report it; a
  reader shown "Something went wrong" cannot.
- `Ready` carries `fromCache` and `cacheReason`, and a cached edition
  renders under a loud `errorContainer` banner naming the edition's date and
  the error that caused the fallback. This is the banner that stops the app
  passing an old edition off as today's.
- `edition.degraded` and any unresolved citations each get their own banner,
  so a partial edition looks partial.

A plain class with a Compose `mutableStateOf`, not a ViewModel: it is
directly readable from a `runTest` block with no dispatcher plumbing, and
the app has no state that outlives the screen. The repository is built from
a `cacheDir` string the host passes in — `context.cacheDir` on Android,
`NSCachesDirectory` on iOS — because the shared module has no platform file
API and each host already knows its own.

Story rows use the `Story` interface, so one composable serves both a
selected story and a merely-collected one, and open links through
`LocalUriHandler` rather than an `expect`/`actual` of their own.

Important structured vulnerability facts use the same component on both
paths. An article gets one compact summary after its standfirst; digest and
also-collected rows get the same line below source metadata. Only KEV,
Critical, or High entries render, and only known fields are included, for
example `CVE-2026-12345 / CVSS 9.8 / Critical / CISA KEV`. A found NVD record
links to its NVD detail page; a KEV-only record links to the CISA catalog.

The store keeps `today` and `viewed` in separate slots. An edition opened
from the archive cannot knock today's out of `Ready` into `Error`, and
coming back does not re-fetch — the screen is still scrolled where it was.
`loadToday` and `openEdition` share one private `Load<Edition>` →
`EditionState` conversion, so citation substitution and cache disclosure
cannot drift between the two entry points.

An empty archive is `Ready(emptyList())`, never `Error`. Nothing published
yet is a fact about the archive, not a failure to load it, and the screen
says so in a sentence.

**Navigation is a sealed `Screen` and one `mutableStateOf`** — Today,
Archive, Edition. A navigation library would be indirection bought for two
transitions. The app-bar Back button and Android's system back share a
single `back` lambda so they cannot disagree about where "back" goes; system
back is disabled on Today so it still exits the app from there. That handler
needs its own dependency line, `org.jetbrains.compose.ui:ui-backhandler` —
it does not ship inside `compose.ui`, which is surprising enough to be worth
writing down.

`BackHandler` is deprecated in favour of `NavigationEventHandler`, and the
warning stays for now: **`androidx.navigationevent:navigationevent-compose`
publishes no Apple targets** at 1.0.0 or 1.0.1. Its module metadata lists
`android`, `jvmstubs` and `linuxx64stubs` and nothing else, so the iOS
compile fails at dependency resolution before it reaches any code. Only the
base `androidx.navigationevent` module is multiplatform; the Compose wrapper
is not. Forcing it would mean an `expect`/`actual` split for a back button,
which is not worth it. Revisit when that artifact ships Apple targets —
this was evaluated and blocked, not missed.

**Heading hierarchy is set explicitly.** Left alone, the Markdown renderer
styles `##` larger than the `headlineMedium` used for the edition's own
headline, so a section heading outranks the article title. `Markdown(...)`
is given a `markdownTypography(...)` mapping `h1`/`h2` to `titleLarge` and
`h3` to `titleMedium`. Not a rendering bug — a default that had to be
overridden, and only visible on a device.

**Verified on the emulator, not just in tests.** First against a hand-seeded
cache and the live 404 — the error state, the offline banner, the archive
and an edition reached through it, and system back walking
Edition → Archive → Today → exit.

Re-verified on 2026-08-07 **against the live endpoints**, which is a
different test: the seeded run could not distinguish working networking from
a convincing cache. App data was cleared first so no cache could masquerade
as a fetch, and the cache directory afterwards held `index.json` and both
editions at byte sizes matching what the endpoints serve. Today rendered the
day's edition with **no** offline banner — `Fresh`, not `Cached`, which is
the one thing the seeded run could never show. Citations render as links,
the section headings still rank below the article headline, and back still
walks Edition → Archive → Today → exit.

One note for whoever automates this next: drive taps from the bounds in
`uiautomator dump`, not from screenshot pixels, and treat a dump of a
Compose hierarchy as unreliable — it can race recomposition and return a
partial tree. Trust the screenshot for what is on screen and the dump only
for where things are.

That list is long on purpose. Screenshots are the only reason the
plain-text-citation bug in §5 was caught — every test was green while the
article had no links in it at all — and the heading hierarchy and the
system-back gap were both invisible to the test suite too. **For this app,
a green Gradle run is evidence about the code and nothing at all about the
screen.** Seed the cache by hand and look at it:

```
adb push site/editions/index.json /sdcard/index.json
type <file> | adb shell run-as dev.dailysecuritynews.app sh -c 'cat > /data/data/dev.dailysecuritynews.app/cache/index.json'
```

`run-as` cannot read `/sdcard` directly, hence the pipe. Screenshot with
`adb shell screencap -p /sdcard/shot.png` then `adb pull` — PowerShell `>`
redirection corrupts the PNG (`android-toolchain` notes, §6).

## 11. Presentation — the terminal, ported

The app wears the site's green-phosphor terminal (`design.md` §2), because
two readers over one edition should not look like two products. Dark only,
for the same reason the site is: a light-mode CRT is a contradiction.

**The palette is a hand-maintained mirror, not a shared source.** The CSS
`:root` block in `src/render/html.ts` is the original; `ui/Theme.kt` restates
it as Compose `Color`s, and `androidApp/res/values/colors.xml` restates the
background a third time because a window background is resolved before any
Compose code runs. Nothing ties the three together — this is the same drift
risk §4 describes for the Kotlin models against `src/types.ts`, and the same
answer: there is no compiler tie to be had across TypeScript, Kotlin and
Android resources, so it is written down instead. A colour change on the site
has to reach all three.

**Decorative characters are added by the composable that draws them**, never
by touching an edition's text. On the web they are CSS `content`; here they
are `AnnotatedString` spans. The rule that matters is the one `design.md` §2
sets: the theme never edits a story's title, headline, markdown or timestamp.
So the app carries `root@sec:~$` on the brand, `$ ` before the headline,
`[archive]`/`[back]` bracket nav, `[01]` story numbers, `›` archive bullets,
and `[ !! DEGRADED ]` / `[ !! OFFLINE ]` / `[ NOTICE ]` banner labels.

Three details are less obvious than they look:

- **The blinking cursor is a span inside the headline, not a sibling
  composable.** As a sibling it lands at the top-right of the headline's box,
  level with the *first* line, because that is where a `Row` puts it. Only
  inside the same `AnnotatedString` does text layout place it after the final
  character, which is what `h1::after` does. It blinks by alpha on that span,
  so nothing reflows.
- **The app bar title is 14sp, not the default 22sp.** The brand lockup is 31
  monospace characters; anything larger wraps `root@sec:~$` onto its own line
  above the name, which reads as a shell prompt with its command on the wrong
  line — the one arrangement a terminal never shows. There is no `maxLines`:
  the site's header is `flex-wrap: wrap`, so wrapping on a genuinely narrow
  screen matches it, and clipping the brand would not.
- **`markdownColor` cannot colour links** in
  `multiplatform-markdown-renderer` 0.41.0 — its `MarkdownColors` has no such
  field. Link colour goes through `markdownTypography(textLink = …)` instead.
  Checked against the resolved artifact rather than assumed.

Reduce-motion is honoured for the blink, through an `expect`/`actual` pair in
`ui/Motion.kt` — `ANIMATOR_DURATION_SCALE` on Android,
`UIAccessibilityIsReduceMotionEnabled()` on iOS. Compose Multiplatform has no
common API for it. When it is on, the cursor renders static and visible,
matching the site's `animation: none`.

### The icon

`$_` in phosphor green on the site's background: `$` is the sigil before
every `h1` and the tail of `root@sec:~$`, so the mark is drawn from the
product rather than invented for it. All vector, no PNGs — an adaptive icon
for API 26+, plus a scaled-up legacy vector in `mipmap/` because `minSdk` is
24 and two API levels have no adaptive icons. The legacy copy is scaled 1.45×
since nothing crops it, where the adaptive foreground must stay inside the
66dp safe zone.

**Deliberately no scanlines in the icon.** One line every three reads as
texture on a page and as moiré at 48dp. The overlay belongs in the UI, drawn
at its real size.

**The site's tab icon is this same mark**, ported to SVG in
`src/render/icon.ts` (`design.md` §2). It copies the legacy variant, scale and
all, because a browser tab crops nothing either. The path data is copied, not
shared — there is no tie between an Android resource and TypeScript any more
than there is for the palette — so the glyph now lives in three files and a
change to it is a change to all three.

`androidApp/res/values/themes.xml` exists for one reason worth stating: the
activity's window is drawn before Compose's first frame, so under the
platform's light theme the app opened on a white flash and then snapped to
near-black. Nothing in `ui/Theme.kt` can prevent that, because none of it has
run yet.

### Verified on the emulator

The article and archive screens, the one-line brand, the `$` sigil with its
glow, the cursor trailing the last character, the standfirst rule, `›`
prefixes, `[01]` numbering, and — with the network disabled — the
`[ !! OFFLINE ]` banner showing its underlying error verbatim. The launcher
icon was checked in the app drawer, not just built.

Both defects that reached the emulator were invisible to a green build: the
wrapping brand and the detached cursor. §10's rule holds and keeps holding —
a green Gradle run is evidence about the code and nothing about the screen.

## 12. Subscribing to the email edition

The app's one write. `design.md` §12 covers the newsletter as a whole; this is
the app's half of it.

**It posts to the same keyless endpoint the website's form posts to**, as an
ordinary `application/x-www-form-urlencoded` submission via Ktor's
`submitForm`. That the endpoint needs no key is the reason the app can do this
at all: an API key inside a shipped binary is an extracted API key, so a
key-bearing endpoint would have meant a server of our own. No
`ContentNegotiation` and no new dependency, honouring §9.

`SUBSCRIBE_URL` in `net/SubscribeRepository.kt` restates
`src/config/newsletter.ts`. Nothing ties them together — the same
hand-maintained mirror as the palette in §11, and the same answer: it is
written down because no compiler tie is available.

**`Load` is not reused, and should not be.** Its entire purpose is cache
provenance: `Cached` carries a value *plus* the network error that made it a
fallback, so a caller cannot render stale data without knowing it is stale. A
POST has no cache and no fallback. Reusing it would add a case that can never
occur, which is worse than a second small type.

`SubscribeState` is `Idle`, `Submitting`, `Sent`, `Failed`. **`Idle` looks like
the "fourth, blank case" §10 forbids and is not one.** That rule exists so a
*failure* can never render as an empty screen. An empty form before the reader
has typed anything is not a hidden failure; it is the screen's subject. The
three post-submit outcomes remain exhaustive and all visible.

`Sent` is deliberately not called `Subscribed`, and its banner says **"Check
your inbox"** rather than claiming success. The list is double opt-in: nobody
is subscribed until they follow the link, and a screen that says otherwise is
lying about the one fact the reader needs.

### It is not a screen, and that is the second design here

The form lives at the foot of `EditionScreen`, which is where the site puts it
— `layout()`, on every page, not in the nav. It is not a `Screen` destination
and there is no `[subscribe]` button in the app bar.

**That was arrived at by breaking it first.** The first version added a fourth
destination with an `[email]` action beside `[archive]`. Two actions narrow the
title slot enough that the 31-character brand lockup wraps onto two lines on a
1080px screen — `root@sec:~$` alone above the name, which §11 calls the one
arrangement a terminal never shows. The app bar holds one action. Treat that as
a constraint, not a preference.

The block renders only under a successfully loaded edition, never on the
loading or error bodies: offering to mail someone the daily edition on a screen
that just failed to load one reads as the app ignoring its own error.

One `SubscribeStore` is held in `App` and passed down as a `SubscribeSlot`, so
an address typed under today's edition is not lost by opening an archived one.

### Verified on the emulator

The block at the foot of the edition with its `## ` sigil, the note about the
confirmation link, the outlined field, and the `subscribe` button. Submitting
an empty field renders `[ !! ERROR ]` with the message verbatim and leaves the
field in place to correct. The brand lockup is back on one line with
`[archive]` beside it.

**Not seen on a screen: the `Sent` banner's wording.** It needs a real accepted
POST, and this was verified without sending anything to Buttondown. The
`Banner` composable it uses is the same one the `[ NOTICE ]` citation banner
already exercises, so the rendering is covered; the copy is not. Check it the
first time a real address goes through.
