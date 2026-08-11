# Daily Security News — Design

Source of truth for what this project is and how the pieces fit together.
Read this before writing code.

## 1. Purpose

Publish one written article per day, around 08:00, covering what actually
mattered in security over the previous 24 hours. Not a feed dump and not a
list of headlines — a piece someone reads start to finish in a few minutes
and comes away current.

The reader is security-literate. They don't need "what is ransomware"; they
need to know which of yesterday's forty stories are worth their attention and
why.

Non-goals: real-time alerting, a general RSS reader, user accounts.

~~A newsletter service.~~ **Reversed 2026-08-07.** Readers can now receive the
edition by email, from the site or the app — see §12. The reversal is narrow
and the rest of the line still holds: the list lives at Buttondown, so this
project gained a delivery channel, not accounts, not subscriber records, and
not a second product. The word "newsletter" was doing two jobs in the original
sentence — "we are not building list management" (still true) and "email is not
a way to read this" (no longer true) — which is why it is struck out rather
than quietly deleted.

## 2. Deliverable

A static site whose front page is today's article.

- `site/index.html` — today's article.
- `site/YYYY-MM-DD.html` — one page per past article.
- `site/archive.html` — index of all past articles.
- `data/editions/YYYY-MM-DD.json` — the structured record that produced the
  page: the article text, every story considered, and what was selected.
- `site/editions/YYYY-MM-DD.json` — the same record as
  `data/editions/YYYY-MM-DD.json`, additionally served over HTTP by Vercel
  since it lives under `site/`.
- `site/editions/index.json` — the archive index as JSON (the data behind
  `archive.html`): an array of `{date, mode, count, headline?}`, newest first.

The article carries a headline, a one-paragraph standfirst, a handful of
sections, and inline links to primary sources. Below it, a plain list of
everything else collected that day but not written up — cheap to render, and
it means nothing collected is silently discarded.

Static HTML with inlined CSS. No client-side framework.

**Presentation — a green-phosphor terminal.** Monospace throughout, near-black
background, a fixed scanline overlay, and shell-prompt chrome. Dark only: there
is no light palette, because a light-mode CRT is a contradiction and carrying
two themes for one page buys nothing.

Every decorative character — the `root@sec:~$` prompt, the `$` and `##` sigils,
the `[01]` story numbers, the blinking cursor — is CSS `content`, never markup.
The document stays plain readable prose with the stylesheet off, and the theme
never touches a story's title, link, or timestamp. Styling is confined to the
`CSS` constant and `layout()` in `render/html.ts`; no other module knows what
the page looks like.

**The email edition inverts that rule and only that rule** — see §12. Email
clients strip generated content, so there the same characters are real markup.
Everything else holds, including the part that matters most: the theme still
never edits a story's title or an edition's prose.

**The colours live in `render/palette.ts`**, which `html.ts` interpolates into
`:root` and `email.ts` inlines. One definition, two web-side consumers.

**The app mirrors this palette rather than sharing it** — see `app.md` §11.
Nothing ties the Kotlin copy to the TypeScript, so a colour changed there has
to be changed in `ui/Theme.kt` and `colors.xml` too.

**The tab icon is the app's launcher mark** — `$_` in phosphor green, drawn
again in SVG in `render/icon.ts`. It mirrors the *legacy* Android variant
rather than the adaptive one, because a browser tab crops nothing exactly like
a pre-API-26 launcher does not, so the glyph is scaled up the same 1.45×
(`app.md` §11). It is inlined into every page as a `data:` URI rather than
served as `/favicon.svg`: the page already carries its whole stylesheet inline
and makes no subresource request, and half a kilobyte of mark is not the thing
to break that for. Like the palette, the mark is hand-mirrored — the glyph now
exists in three files, and a change to it has to reach all three.

## 3. Pipeline

One run produces one article. Stages are pure where possible: each takes data
in and returns data out, so any stage can be run and inspected alone.

```
collect -> normalize -> dedupe -> filter -> extract CVEs -> enrich -> select -> write -> render -> publish
                                                                    |--- LLM ---|
```

| Stage | Does | Fails how |
|---|---|---|
| `collect` | Fetch every configured source concurrently | Per-source, non-fatal (§8) |
| `normalize` | Canonical URL, parsed date, plain-text excerpt | Per-item, non-fatal |
| `dedupe` | Collapse the same story across sources into one item | Fatal |
| `filter` | Drop items outside the window or already published | Fatal |
| `extract` | Deterministically merge CVE references from every cluster member | Fatal |
| `enrich` | Attach CISA KEV and NVD intelligence with provenance | Per-source, non-fatal |
| `select` | LLM call 1 — which stories make the article, and why | Fatal, disclosed fallback (§8) |
| `write` | LLM call 2 — the article prose | Fatal, disclosed fallback (§8) |
| `render` | Article JSON + HTML pages | Fatal |
| `publish` | Commit `site/` and `data/`; the push is the deploy (§9) | Fatal |

**Window.** An item is included when it is **not in the seen store** and was
**published within the last 7 days**. That is the whole rule.

It was originally written as two windows — "the last 24 hours, plus anything
not seen before" — but the seen store makes the 24-hour clause unreachable:
anything older than a day has already been covered by an earlier edition and
is dropped by the seen check before age is consulted, so the 7-day bound is
the only test that ever decides an item's fate. Implementing both produced
dead logic. One window, stated honestly.

The 7-day bound exists because "anything not seen before" is unbounded on its
own — a fresh `seen.json` would ingest every feed's entire back catalogue.
Laggy sources still get covered once; archives don't flood in. A cold start
therefore produces one unusually large edition, and every run after it settles
to roughly a day's news — an emergent property of the seen store, not a
window check.

**Dedupe.** Canonical URL match first (strip `utm_*`, fragments, AMP paths).
Then title similarity within the window to catch the same story reported by
five outlets — the cluster keeps every source URL so the article can cite the
best one and note who else covered it.

**Seen store.** `data/seen.json` — a map of canonical-URL hash to the date
that first covered it, pruned to 30 days. Committed back by the workflow so
the next run knows what's already been written about. It is the publication
dedupe state; the send ledger and disposable vulnerability cache are the other
committed state files.

**The store is consulted by date, not by presence.** An item is excluded only
when an *earlier* edition covered it; an item first covered today is still part
of today's edition. This matters because runs are not once-per-day in practice
— `workflow_dispatch` exists, publishes get retried, and Actions cron can
double-fire. Treating "seen at all" as a drop meant the second run of any day
found nothing to publish and rendered an empty edition *over* the real one,
destroying that day's record while the page still read as healthy ("No new
stories in this window"). That is the §8 failure this project refuses to ship,
so the rule is date-aware and same-day runs are idempotent.

## 4. Sources

Config lives in `src/config/sources.ts` — one typed array, no dynamic
registration. Adding a feed is a one-line edit.

**RSS/Atom** — the backbone. Curated outlets and vendor research blogs.
Cheap, stable, no keys. `rss-parser` handles both formats.

**Vulnerability APIs** — structured, authoritative, and the reason this
project beats a feed reader:
- CISA KEV catalog (JSON, no key) — authoritative known-exploited membership,
  required actions, due dates and ransomware-use reporting.
- NVD CVE API v2 (`NVD_API_KEY` optional) — descriptions, multiple CVSS schema
  versions, CWE, references and affected configurations for referenced CVEs.

The exact extraction, source, cache, provenance and failure contracts are in
`vulnerability-intelligence.md`.

**Aggregators** — Hacker News (Algolia API) and `r/netsec` for
discussion-driven items the outlets haven't picked up. Noisy; they enter the
pipeline with a lower prior and must clear a score threshold.

**Web search** — deferred, and no longer free. See §6: DeepSeek has no
server-side search tool, so this needs a third-party search API and is the
last thing to build, if at all.

## 5. Data model

```ts
type SourceKind = 'rss';

interface RawItem {
  sourceId: string;        // key into the sources config
  sourceKind: SourceKind;
  title: string;
  url: string;
  publishedAt: string;     // ISO 8601, UTC
  excerpt?: string;        // plain text, source-provided
}

interface Item extends RawItem {
  id: string;              // short, stable within the run — e.g. "s7"
  canonicalUrl: string;
  alsoCoveredBy: { sourceId: string; url: string }[];
  cves: VulnerabilityIntelligence[]; // empty if no CVE was referenced
}

interface VulnerabilityIntelligence {
  id: string;              // normalized uppercase CVE ID
  knownExploited: boolean | null; // null means KEV unavailable, not a miss
  kev: KevEnrichment | null;
  nvd: NvdEnrichment | null;
  provenance: {
    news: CveMention[];
    cisaKev: { status: 'found' | 'not_found' | 'unavailable' };
    nvd: { status: 'found' | 'not_found' | 'unavailable' };
  };
}

// LLM call 1 output, one entry per selected story
interface Selection {
  id: string;              // must match an Item.id from this run
  section: 'exploited' | 'vulnerabilities' | 'breaches' | 'research' | 'industry';
  rank: number;            // 1 = lead story
  angle: string;           // one line: why this matters today
}

interface Article {
  date: string;            // YYYY-MM-DD
  generatedAt: string;     // ISO 8601
  headline: string;
  standfirst: string;
  bodyMarkdown: string;    // LLM call 2 output; cites stories as [[s7]]
  selected: (Item & Selection)[];
  alsoCollected: Item[];   // considered, not written up — rendered as links
  degraded: DegradedNotice[];   // §8 — rendered as a banner when non-empty
  stats: { collected: number; deduped: number; selected: number };
  usage: {                 // §6 — recorded every run
    model: string;
    promptCacheHitTokens: number;
    promptCacheMissTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}
```

**The model never emits a URL, date, or source name.** It refers to stories by
the pipeline-assigned `id`, and `render` substitutes the real link. It may use
only CVE facts present in structured enrichment context; a CVE ID in generated
prose that was not supplied with a selected story is a hard error. The prompts
also treat every external string as untrusted data rather than an instruction.

## 6. LLM usage — DeepSeek

Two calls per run. Everything before them is deterministic code: fetching,
parsing, deduping, and CVE lookup are not judgment calls and don't belong in
a model.

The split is deliberate. Structure and prose have different failure modes, so
they get different calls:

- **`select`** returns JSON — small, flat, easy to validate. Which stories
  make the article, in what order, under what section.
- **`write`** returns Markdown — no JSON escaping around multi-paragraph
  prose, and nothing to parse but text.

**Editorial spec** (decided 2026-08-06; these are prompt constants, §11):

- **~800 words** of body prose — a three-to-four minute read, per §1.
- **6–8 stories** written up, chosen from roughly 30–50 daily candidates. A
  *range*, not a quota: a quiet day runs short rather than padding to a
  number, which is the failure §11 warned about. Everything not selected
  still renders in the plain list below, so nothing is discarded.
- **All five sections** from §5, with any section that has no stories omitted
  entirely rather than printed as an empty heading. This section predicted that
  6–8 stories would rarely fill all five; the first real edition (2026-08-06)
  filled all five with 8 stories. One counterexample is not a pattern, but the
  prediction is on notice.

**Provider.** DeepSeek, `https://api.deepseek.com`. The API is
OpenAI-compatible, so the client is the `openai` npm package pointed at that
base URL with `DEEPSEEK_API_KEY`. No DeepSeek-specific SDK.

**Models** (verified 2026-08-05, prices USD per million tokens):

| Model | Cache hit in | Cache miss in | Output | For |
|---|---|---|---|---|
| `deepseek-v4-pro` | $0.003625 | $0.435 | $0.87 | Reasoning |
| `deepseek-v4-flash` | $0.0028 | $0.14 | $0.28 | Speed |

Both: 1M context, 384K max output.

Use **`deepseek-v4-flash` for both calls** — decided 2026-08-06, revising an
earlier choice of `deepseek-v4-pro`.

**Measured on the first real run (2026-08-06):** 16,785 input tokens, 8,337
output, **$0.0047** — about $0.15 a month. The earlier figure in this section
guessed 40K in / 15K out and was more than double the truth; it is replaced
rather than annotated, because a stale estimate sitting next to a real
measurement is just a second number to disbelieve. One day of news is one data
point, so treat the shape as established and the magnitude as provisional.

The tradeoff is stated rather than buried, because the original reasoning
still stands on its own terms: both calls are editorial judgment, which is
what a reasoning model is for, and flash saves about two cents a day. **Cost
is not what justifies this.** The justification is that the generation path
has never produced an edition anyone has read (`operations.md` §1), and flash
is the cheaper and faster model to iterate the prompt contract against while
that is still true.

So this is a decision with an expiry date, not a settled one — see §11.
Reverting is one constant and one price table in `llm/client.ts`.

**Peak pricing is 2× during 09:00–12:00 and 14:00–18:00 Beijing time
(UTC+8)** — that is 01:00–04:00 and 06:00–10:00 UTC. Whether the 08:00 run
lands in a peak window depends entirely on which timezone the 08:00 refers
to (§9). At these amounts it's a rounding error, but the run time is free to
choose, so choose the cheap one.

**JSON output has no schema mode.** DeepSeek supports
`response_format: { type: 'json_object' }` only — there is no JSON Schema /
structured-outputs mode, so the shape is *requested*, never *guaranteed*.
Three consequences, all mandatory:

1. The prompt must contain the word "json" and an explicit example of the
   expected shape. This is a documented requirement, not a style preference —
   the request is rejected without it.
2. Every response is parsed and validated with Zod before anything downstream
   touches it. A response that doesn't validate is a failure, not something
   to coerce or patch up.
3. **Empty responses are a documented failure mode** — DeepSeek notes the API
   "may occasionally return empty content." Handle it explicitly: retry once,
   then fail per §8. Never treat empty as "no stories selected today."

Also validate that every returned `id` exists in this run's item set, and
that `write` cites no `id` that `select` didn't choose. A model referring to
a story that isn't there is the exact failure this design refuses to ship.

**Context caching is automatic** — enabled by default, nothing to configure,
no cache-control markers. The response reports `prompt_cache_hit_tokens` and
`prompt_cache_miss_tokens` in `usage`; record both (§5) so cache behaviour is
observable rather than assumed. Caches live "hours to days" on a best-effort
basis, so a once-daily run will usually miss. Fine — put the stable
instructions first anyway, and it costs nothing.

**No server-side web search.** DeepSeek's API offers no search tool. The
web-search source in §4 therefore needs a third-party search API (Brave,
Tavily, or similar) and its own key. Deferred to the last build layer; the
project works without it.

## 7. Repo layout

```
docs/design.md              this file
docs/app.md                 the native app, and its contract with site/
docs/vulnerability-intelligence.md  enrichment contract
src/
  index.ts                  entry point — one run, one article
  email.ts                  entry point — mail one edition (§12)
  config/                   source, newsletter and vulnerability configuration
  collect/                  one module per source kind
  pipeline/                 normalize, dedupe, filter, select, write
  vulnerability/            extraction, KEV/NVD, cache, enrich, priority
  llm/client.ts             DeepSeek client + usage accounting
  render/                   article JSON + HTML
  render/palette.ts         the colours, shared by the page and the email
  render/email.ts           the edition as an HTML email (§12)
  store/sent.ts             the send ledger
data/
  seen.json                 dedupe state, committed
  sent.json                 which editions have been mailed, committed
  editions/YYYY-MM-DD.json  the record
  cache/vulnerability-intelligence.json  KEV/NVD cache, committed
site/                       generated, served by Vercel
  editions/YYYY-MM-DD.json  the record, web-served
  editions/index.json       the archive index, web-served
app/                        the native app — see docs/app.md
  shared/                   KMP library: shared Compose UI and logic
  androidApp/               Android application module
  iosApp/                   SwiftUI host
vercel.json                 output directory; no build step
.github/workflows/daily.yml
```

**Dependencies** — deliberately few: `openai` (pointed at DeepSeek),
`rss-parser`, `zod`, `marked` for Markdown→HTML, plus `typescript` and `tsx`
to run TS directly. HTTP is native `fetch` (Node 22+). Page chrome is
template literals in `render/` — a templating engine would be indirection for
a page with five sections. `marked` earns its place: hand-rolling Markdown
parsing to save one small, well-maintained dependency is the wrong trade.

## 8. Error handling

Follows the fail-loud rules in `CLAUDE.md`, applied to this pipeline. Three
tiers, and the tier is a property of the stage, not a judgment made at the
call site:

**Source-level failures are visible degradations.** A feed, CISA KEV refresh,
or NVD batch that times out, returns an HTTP error, or returns garbage does not
kill the article — it appends a
`DegradedNotice` to `Edition.degraded` and logs a warning. The page renders
with a banner naming every source that failed and what happened. The reader
knows the edition is partial. Silently rendering a thinner page and calling
it complete is exactly the failure mode we refuse.

**Pipeline-stage failures are hard failures.** Dedupe, render, and publish
either work or the run aborts with a non-zero exit and no deploy. Yesterday's
article stays up, the workflow goes red, and the failure is findable. There
is no partial publish and no placeholder content.

**LLM failures fall back visibly, once.** If `select` or `write` fails —
empty content, invalid JSON, unknown story `id`, refusal, API error — retry
once. If it fails again, the site publishes a plain chronological digest of
the day's items under a banner reading that the written article could not be
generated and why. That is a degraded mode the reader can *see*. What never
happens: a half-written article, an article citing stories that weren't
selected, or a page that looks like a normal edition when no writing occurred.

**Never fabricate.** If enrichment can't reach the NVD, the item ships
without CVSS data and the page shows no score — not a guess, not a zero, and
not a dash that reads like a real value.

## 9. Scheduling

GitHub Actions, cron, once daily. The job checks out, runs the generator, and
commits `site/` and `data/` to `main`. Actions cron is **UTC only**, so "08:00"
has to be pinned to a zone — and the choice interacts with DeepSeek's peak
window (§6):

| 08:00 in | UTC | Beijing | DeepSeek rate |
|---|---|---|---|
| **US Eastern — chosen** | **12:00** | 20:00 | standard |
| US Pacific | 15:00 | 23:00 | standard |
| UK | 07:00 | 15:00 | **2× peak** |
| Central Europe | 06:00 | 14:00 | **2× peak** |

**Decided 2026-08-05: 08:00 US Eastern.** The cron is `0 12 * * *`. This
avoids DeepSeek's 2× peak window entirely, and 12:00 UTC falls on the same
calendar day as 08:00 ET year-round (07:00 during EST), so the edition date
is simply the UTC date at run time — no timezone arithmetic anywhere in the
code.

Actions cron also drifts under load — scheduled jobs can start minutes late,
which is why the target is "around 08:00" and not a promise. If publication
time ever needs to be exact, generate earlier and deploy on a timer; don't
fight the scheduler.

`DEEPSEEK_API_KEY` is a repository secret. `NVD_API_KEY` is an optional secret
that raises NVD's rate limit; public access remains functional without it. A
failed run leaves the previous article deployed and surfaces as a failed check.

**Hosting: Vercel, static only** (decided 2026-08-06, replacing GitHub Pages).
Vercel's Git integration builds `main` on every push, and the workflow already
pushes `site/`, so the push *is* the deploy. There is no deploy job, no Vercel
token in this repository, and no second place for the site to drift out of
sync with the record.

**Generation stays in Actions, and this is not a temporary arrangement.** The
obvious-looking alternative — a Vercel cron hitting a serverless function —
breaks §3. Functions get an ephemeral filesystem, so `data/seen.json` cannot
survive between invocations, and the seen store is the mechanism that makes
each edition a day's news rather than the whole 7-day window republished
daily. Losing it is the cold-start behaviour on a loop. `render` also writes
`site/*.html` to disk, which a serverless function has nowhere to put.

Running the pipeline on Vercel therefore means replacing the seen store with a
hosted database and rewriting `render`/`publish` — a large change that buys
nothing, since Actions already runs the generator for free and holds the one
piece of mutable state in the same git history as the output it explains.
**The split is deliberate: Actions computes, Vercel serves.**

## 10. Build order

Each layer ends with something that works end to end. Nothing is left
half-built to start the next one.

1. **RSS → page, local.** Collect from a handful of feeds, dedupe, render a
   plain chronological page, run by hand. No LLM. This is a working product
   and it is also the §8 fallback mode — building it first means the fallback
   is real code that runs, not an untested branch.
2. **Automate.** GitHub Actions on a schedule, hosted deploy, archive pages,
   seen-store persistence.
3. **Write.** Add `select` and `write` against DeepSeek, with Zod validation,
   the retry, and the fallback wired from day one.
4. **Enrich — done.** Deterministic CVE extraction, CISA KEV and NVD lookups,
   provenance, caching, priority signals, LLM context and compact presentation.
5. **Widen.** Hacker News and r/netsec with scoring; then, only if it's
   earning its keep, a third-party search API for discovery.

## 11. Open questions

Decide before the layer that needs them; don't guess early.

- ~~**Which 08:00?**~~ Decided 2026-08-05 — 08:00 US Eastern, cron
  `0 12 * * *`. See §9.
- ~~Article length.~~ Decided 2026-08-06 — **~800 words**. See §6.
- ~~Section list.~~ Decided 2026-08-06 — keep all five, omit empty ones.
  Still worth revisiting after a week of real output.
- ~~How many stories get written up versus listed below.~~ Decided
  2026-08-06 — **6–8**, a range rather than a quota. See §6.
- **Whether `deepseek-v4-flash` is good enough at `select`.** Chosen
  2026-08-06 to iterate against (§6). Judge it on a week of real output, not
  in the abstract: if the lead story is routinely the wrong one, or sections
  are misassigned, go back to `deepseek-v4-pro` — the difference is about
  two cents a day, so quality is the only thing that should decide it.
  **Day 1:** led on an actively exploited TeamCity RCE flagged by CISA over a
  guilty plea and a Spectre-v2 bypass — a defensible lead, and the prompt
  contract held (valid JSON, no invented citations). Six days to go.
- Whether the archive needs search. Probably not at 365 pages; definitely not
  at 30.
- **Whether the email edition should be its own thing.** It is currently the
  page, restyled — same headline, same prose, same also-collected list. If
  open rates say people read the email and not the site, the email becomes the
  primary surface and its own editorial decisions follow. Nothing to decide
  until there is a week of sends to look at.

## 12. The email edition

Added 2026-08-07, reversing half of §1's newsletter non-goal. Readers can
receive the edition in their inbox instead of visiting the page.

**Buttondown holds the list, and that is the whole point of choosing it.** A
subscriber list is personal data with obligations attached — confirmed opt-in,
a working unsubscribe in every message, bounce and complaint handling, deletion
on request — and none of it is work this project is equipped to do well. So it
is not done here. Buttondown stores the subscribers, sends the confirmation,
owns the unsubscribe link, and answers for the data. **No email address is
stored in this repository, ever.**

That also keeps §9 intact rather than amending it. There is no serverless
function, no database, and no new credential on the serving side. Actions still
computes; Vercel still serves static files.

### Subscribing

Both clients POST to Buttondown's **keyless** embed endpoint —
`buttondown.com/api/emails/embed-subscribe/<username>`, configured in
`src/config/newsletter.ts`.

Keyless is what makes one mechanism serve both. The website posts an ordinary
`<form method="post">` — no JavaScript, and the site still has no `<script>`
tag anywhere. The app posts the same form fields over Ktor. A key-bearing
endpoint would have forced a proxy of our own for the web and would have been
flatly unusable from the app, since a key inside a shipped binary is an
extracted key.

The form is rendered in `layout()`, so it appears on today's edition, every
dated page and the archive from one place. **Changing it therefore needs
`npm run rerender`** or past pages keep the old markup (operations.md §4).

### Rendering

`src/render/email.ts`, and it deliberately does not reuse the page's `CSS`.

Email clients strip `::before`/`::after`, custom properties, counters, flexbox
and `position: fixed` — which is nearly every mechanism §2 relies on. So the
email inlines a style on every element, and **the decorative characters become
real markup**: `root@sec:~$`, the `$` sigil, `## `, `[01]`, `// `. §2 says
those must never be markup, because the page has to read as prose with the
stylesheet off. An email has no stylesheet to switch off. Same rule — the
reader gets the terminal — reached the opposite way, because the medium is
different. That is stated at the top of the module so it does not read as
someone ignoring §2.

Dropped for the same reason: the scanline overlay (the only `position: fixed`
selector) and the blinking cursor. The cursor renders static, which is what the
site itself shows under `prefers-reduced-motion` — an email is permanently in
that mode.

The colours are not duplicated. `src/render/palette.ts` holds them, `html.ts`
interpolates them into `:root`, and `email.ts` inlines them. The Kotlin and
Android-resource copies (`app.md` §11) are still hand-maintained, because no
compiler tie crosses the three languages — three copies now, not four.

> **One trap, found on screen and now guarded by a test.** The monospace stack
> quotes its family names with **apostrophes**. A double quote inside a
> double-quoted `style="…"` attribute closes the attribute at `"SF Mono"` and
> silently discards every declaration after it — font, size, line height and
> colour all gone, on a page that still renders perfectly. That is the "looks
> fine but is wrong" failure `CLAUDE.md` ranks last, and nothing but looking at
> it would have caught it.

### Sending

`npm run email` reads `data/editions/<date>.json`, renders, and POSTs to
Buttondown with `BUTTONDOWN_API_KEY`. Native `fetch`, no new dependency. It
runs in `daily.yml` **after** the publish commit, so publishing never waits on
it and never fails because of it.

`--dry-run` writes the HTML and sends nothing — the same role `npm run
rerender` plays for the page, and the only sane way to iterate on an email.

**`data/sent.json` is the re-send guard.** A map of date to `{sentAt,
emailId}`, committed like `seen.json` and for the same reason §3 gives: runs
are not once-per-day in practice. Re-rendering a page twice is invisible;
mailing an edition twice is not, and the subscriber is who notices. Nothing is
pruned — an expired entry would re-mail a months-old edition.

**A failed send is red, and there is no fallback.** This is the one stage where
§8's disclosure tier does not apply: either subscribers received the edition or
they did not, and there is no degraded version of a delivered email. Since the
site is already published by then, a red check costs the web reader nothing and
makes the failure findable. That is `CLAUDE.md`'s "fails with a clear error
message" — the best tier available here, not a lapse from the one above it.
