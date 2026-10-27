# Reliability review — 2026-10-25

## Scope and evidence

Repository: `AGS-cyber/daily-security-news`; implementation baseline `ac88d29`.
This review used the checkout, installed dependency source, and stored editions.
It did not fetch remote Git state, run live feeds/LLM APIs, or verify production.
The newest local edition is 2026-09-30; this alone is not evidence of a live outage.
`CLAUDE.md` and the design/operations/CVE/app documents were checked. No repository
`AGENTS.md` or `.agents/skills` directory was present. The local Codex memories
directories contained no files; repository metadata settled the project identity.

Pre-existing changes were retained: the Node 22.23.4 pins, package manifest and
lockfile, daily/CI workflows, `.node-version` and `.nvmrc`. The only additional
manifest change registers the new tests. No edition, cache, seen state, generated
site, account, credential, notification, deployment or dependency was changed.

## Architecture and existing safeguards

- Node/TypeScript: collect RSS/Atom → normalize → URL/title dedupe → seven-day and
  previously-published filter → CVE extraction → enrichment → select/write → static
  HTML and edition JSON → seen state. Kotlin readers consume the same JSON.
- Twelve sources: Krebs, BleepingComputer, The Hacker News, The Record,
  SecurityWeek, Dark Reading, CISA Advisories, Project Zero, Securelist, Talos,
  Unit 42 and Microsoft Security. No aggregator/search ingestion is implemented.
- Actions runs at a fixed 12:00 UTC (08:00 EDT / 07:00 EST), serializes daily jobs,
  tests, generates, checks publication, then commits/pushes. Vercel serves `site/`.
  Scheduled start time is not a guarantee; remote job health was not inspected.
- Canonical URLs strip tracking and AMP variants; title Jaccard similarity is 0.6.
  Cluster member URLs survive extraction and enter a 30-day seen store only after
  edition/site writes. Healthy same-day runs are allowed; degraded collection
  cannot replace an existing same-date edition. Healthy feed rotation can still
  change the content of a rerun.
- KEV membership comes from CISA; CVSS/CWE/configurations come from NVD. Both have
  provenance and independent failures. The 20-hour cache can be reused on failure
  with explicit degradation; unknown fields stay null. KEV outranks CVSS for
  deterministic priority; the model still chooses the editorial stories.
- Feed excerpts and authoritative descriptions are untrusted data. Prompts prohibit
  fabricated facts; deterministic checks reject invented IDs/CVEs, missing selected
  citations and oversized articles. Markdown is escaped and links are HTTP(S)
  only. These checks do not prove every generated factual claim is supported.

## Defects addressed

1. Installed `rss-parser.parseURL` rejects its timeout without aborting the request
   and buffers the response without a size cap. RSS now uses native fetch with a
   15-second deadline including body reads, cancellation, a 16 MiB decoded-body cap,
   and one retry for transport errors, 429 and 5xx. Retry-After is honored up to
   60 seconds; longer waits fail this source without retrying early. Parsing stays
   in rss-parser; malformed XML, permanent HTTP errors and oversize bodies do not
   retry. No dependencies were added.
2. An all-feed outage or completely rejected input could write an empty edition.
   The run now stops before enrichment, LLM calls and publication writes if no
   source/normalized item is usable. A healthy collection with no unseen news
   still permits a quiet-day digest. Partial failures remain disclosed.
3. Missing titles/links were silently dropped. New edition records include each
   source's attempt time, outcome, collected count and skipped count. Missing
   fields create notices. The web reader exposes this in a coverage disclosure;
   successful fetching is explicitly distinguished from fresh reporting.
4. Article dates were buried in the page title/footer, and story rows displayed
   only times despite the seven-day window. Edition, generation and story dates
   are now readable in UTC; navigation says “latest”. The page states the expected
   schedule without claiming the edition is current.
5. Stored CISA actions and source retrieval times were absent from the reader.
   CVE details now link KEV/NVD evidence, show retrieval time and cache-age context,
   and display exact escaped CISA actions. Catalog deadlines are not presented as
   universal deadlines. Unknown/unenriched CVEs remain visible beside digest and
   secondary stories rather than disappearing for lack of a high score.

6. Degraded same-day reruns could replace a richer edition. Collection/normalization
   notices now stop a rerun before deduplication, enrichment, cache, model or output
   writes whenever any same-date data JSON, served JSON or dated HTML exists.
   Existing bytes, timestamps and seen state stay unchanged; logs identify the
   source/reason and say no replacement was generated. Even truncated prior output
   is protected. A first/new-day partial edition remains allowed with disclosure;
   healthy repeats and expected future-event exclusions remain allowed.
7. Similar headlines could conflate distinct CVEs or publisher follow-ups. Fuzzy
   clustering now requires cross-source reports within 48 hours, compatible CVE
   evidence and pairwise title similarity across every URL group. Exact canonical
   URL identity and seen-store URL hashes are unchanged. Cluster eligibility uses
   the newest member while retaining the primary's original publication date.
8. Review caught a transport regression for valid charset headers with whitespace
   around '='. A Latin-1 regression fixture failed before the fix and passes now.

9. The reader now distinguishes the latest front page from dated editions, shows
   live age and overdue/cached-page warnings, and discloses missing historical
   source status. Source failures appear first. CVE priority rows link back to
   reporting and display sourced actions without inventing exploitation or
   universal deadlines. Search/source/priority filters, reset, zero-result states,
   in-page navigation, keyboard focus and mobile controls improve scanning.
   The optional script is fixed, CSP-hashed and makes no network requests; all
   content remains readable if it is unavailable. Styling removes scanlines,
   blinking and glow while retaining the terminal palette.

## Remaining trade-offs

- Freshness warnings rely on the device clock and a two-hour grace after the
  next scheduled edition. They cannot distinguish a delayed job from a cached
  page or prove an outage. Source health remains an edition snapshot. Without
  scripts, absolute dates and conditional guidance remain, not a live age.
- Filters do not persist in the URL. Browser-return behavior stays internally
  consistent; the script reapplies any restored form values. Search includes
  evidence text, so the priority selector is more precise than searching KEV.
- Healthy same-day reruns can still change as feeds rotate. The guard protects
  collection/normalization degradation, not later enrichment/editorial fallbacks.
  Publication still writes multiple local files sequentially and has no concurrent
  local-run lock. This is not a transactional publication redesign.
- Conservative fuzzy matching may retain duplicates, particularly publisher
  follow-ups, reports more than 48 hours apart or weakly matching headlines. This
  trades a longer list for a lower risk of hiding a distinct advisory. CVE-free
  reports with similar language can still be ambiguous.
- Feed coverage reports attempts, not historical source health. No persistent
  per-source failure streak, last-success history, or freshness alert was added.
- Excerpts are limited to 400 characters. Prompt rules and identifier checks do
  not fully validate scores, versions, attribution or exploitation claims in prose.
  Structured claim/evidence checks and evaluation fixtures remain useful follow-ups.
- Native apps ignore new JSON keys and retain their existing presentation; these
  reader improvements are on the web. No mobile build or UI test was run.
- The decoded-body cap was raised from 2 MiB to 16 MiB on 2026-10-27 after live
  CISA Advisories and Project Zero feeds measured 5.43 MiB and 10.79 MiB. This
  allows their full content with headroom while retaining a finite memory bound;
  larger feeds still become visibly unavailable and need assessment.

## Validation

Baseline: 108/108 tests and typechecking passed. First pass: 123/123. Reliability
follow-up: 135/135 in both the working copy and original checkout. Integrated final
suite: **177/177 tests pass; typechecking passes** on pinned Node 22.23.4.
No dependencies were added. Failure tests use mock HTTP, fixed clocks and temporary
directories; repeated degraded runs preserve every published/cache/seen byte.

The integration review fixed three new test assertions that accidentally matched
selectors inside script/CSS rather than rendered markup. No UI runtime change was
required to make those assertions accurate.

Browser checks covered desktop (1440px) and mobile (390px and 320px), no horizontal
overflow, labelled 44px controls, keyboard skip/focus and disclosure operation,
combined/zero-match filters and repeated resets, navigation/return consistency,
stale/future/invalid timestamps, old editions without source metadata, empty states,
and interrupted script loading with all stories readable and controls hidden.
No browser warnings/errors occurred. The shipped script's fake-clock DOM tests
also cover resume, focus, timer ticks, history restore and unchanged live regions.
All 56 local stored editions rendered in memory without modifying records/site.

Not run: live RSS/enrichment/news-generation APIs, hosted publication/deployment,
native mobile builds, real-device iOS/Android testing, or a full screen-reader audit.
The browser accessibility checks are targeted checks, not a WCAG certification.
These results describe the initial local validation; deployment requires a separate
release check against the current records and the HTTP security headers.

## Release validation — 2026-10-26

The release was prepared from current main, preserving all 81 edition records
through October 25. All 83 HTML pages were rebuilt; data, cache, seen state and
served edition JSON have no content changes. A repeated render changes only the
archive generation timestamp. Full validation passes 178 tests and typechecking
on Node 22.23.4, including the deployment CSP regression test.

The previous Vercel HTTP policy blocked the enhancement despite the page's meta
hash. The header now allows only that exact SHA-256 script hash; all other
directives are unchanged. All 83 emitted scripts match it. Browser checks using
the actual response headers passed at 1440, 390 and 320 pixels, including filters,
repeated resets, keyboard navigation, linked evidence, archive/history restoration
and freshness initialization. Added and altered scripts were blocked, while the
interrupted-script fallback kept all 54 stories on the checked edition readable.
No browser errors occurred in ordinary flows; deliberate CSP rejection fixtures
remain outside the published site. Live functionality must also be checked after
deployment, separately from CI or deployment-build success.
