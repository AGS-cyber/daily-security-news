# Native App — Design

The mobile app that reads the same editions the website publishes.
`design.md` covers the pipeline and the site; this file covers the app and
the contract between them. Read both before changing either.

## 1. Purpose and scope

One Kotlin codebase, compiled natively for Android and iOS, that displays
today's article and the archive. **The website is unchanged and stays the
primary product** — the app is a second reader over the same data, not a
replacement and not a rewrite.

Version 1 is **read-only**: fetch, display, cache for offline. Deliberately
out of scope, each its own later decision:

- Push notifications. The obvious feature, and the one thing an app buys
  that a bookmark doesn't — but it needs a device-token registry (new
  persistent state, new privacy surface) and a notify step in the workflow.
  Layered on after the app works end to end, per `design.md` §10's rule.
- Store submission, signing, TestFlight/Play Console.
- App icon and branding. The Android icon is currently the platform stock
  icon and the iOS `AppIcon.appiconset` is empty.
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
2. **Wrap the URL in angle brackets** — `[title](<url>)`. News URLs
   routinely contain parentheses, which break a bare link destination.

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
this project ranks last. In the destination only `\`, `<` and `>` are
escaped; the angle brackets already protect the parentheses.

**Both escapers are a single pass over the characters**, which dissolves
trap 1 rather than handling it: there is no second pass to re-process the
backslashes the first one emitted. The ordering trap only exists for a chain
of `String.replace` calls, so do not rewrite them as one. The
trailing-backslash test stays regardless, as the guard against someone doing
exactly that.

Verified two ways: exact-string unit tests in `CitationsTest`, and — because
a test can assert a confidently wrong expectation — by feeding the escaped
output through `marked`, the site's own CommonMark parser, and checking the
link text and destination came back identical to the story's title and URL.

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

`shared`'s Android namespace is `dev.dailysecuritynews.app.shared` — AGP
requires namespaces to be unique per module, and `androidApp` owns the
unsuffixed one because it holds the manifest and resources.

## 7. What is verified, and what is not

Verified on a Pixel 7 / Android 16 emulator: the app assembles, installs,
launches, and renders. Both Apple targets compile.

**Not verified, and no one should assume otherwise until a Mac says so:**
the Xcode project has never been opened or built. `project.pbxproj` and the
shared scheme are hand-written to the wizard's shape with synthetic object
IDs — a malformed one looks exactly like a correct one until Xcode parses
it. Framework linking, embedding and signing are likewise unproven. Treat
the first macOS CI run as the real test of those files.

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
5. **Networking and cache.** Ktor client against the two endpoints; Okio
   file cache of the last fetch for offline reading.
6. **Screens.** Today, Archive, and a shared detail renderer handling both
   `article` and `digest` modes, the degraded banner, and explicit
   offline/error states. A blank screen is never an acceptable state —
   `design.md` §8's disclosure rule applies to the app too.
7. **iOS host and CI.** SwiftUI shell, then `.github/workflows/app-ci.yml`:
   an `android` job on ubuntu and an `ios` job on macos that runs both the
   framework link *and* `xcodebuild`, since the link task alone never
   touches the Swift code.
