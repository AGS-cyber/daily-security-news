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
- Healthy same-day reruns can still change as feeds rotate. The October 27 follow-up
  below extends the guard to article-to-digest and new stage/source failures.
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

## Future-edition degradation audit — 2026-10-27

This follow-up checked all **83 editions, August 6–October 27**, using the 56
local records through September 30 plus 27 October records read from GitHub.
There are no missing dates. **36 editions have recorded degradation** and one
additional edition has an undisclosed placeholder headline: **37 flagged days**.
Four editions are digests. Historical records were not changed or regenerated.

| Evidence | Cause and forward fix |
|---|---|
| August 13: CVE-2026-59310 rejected | The supplied excerpt used an en dash in `CVE-2026–59310`; the old extractor missed it. The existing Unicode normalization fixes extraction; a writer regression now covers the exact case too. |
| August 15: article titled `The headline` | The prompt's template title was accepted. The writer now rejects placeholder titles and asks for a corrected response. The archive audit detects existing instances. |
| September 11: invalid selection JSON | The stored notice proves invalid JSON, but not its provider-side cause. Previously the validation retry repeated the identical prompt. Both stages now provide the actual error and bounded previous response as diagnostic data. |
| October 9: article exceeded evidence word limit | The hard limit remains. The prompt now targets 80% of it, explicitly includes headings/citations, and the corrective retry reports actual versus allowed words. |
| October 24: CVE-2025-66208 rejected | The ID was supplied in the NVD description for CVE-2026-110447, but validation only allowed top-level CVE records. The allowlist now follows the exact bounded factual input. Context-only references do not become enriched records or inherit KEV/severity. Angles, unsent URLs and text beyond truncation cannot authorize IDs. |
| October 26: CISA Advisories and Project Zero missing | The former 2 MiB cap rejected valid large feeds. The existing 16 MiB cap is retained and boundary-tested. A live check collected all 230 entries from all 12 feeds, with no collection or normalization exclusions. |
| August 13 Dark Reading 404; August 23 Microsoft 403 | Historical HTTP errors, with no evidence of a still-broken URL. Both current endpoints passed. Existing transient retry, isolation and source diagnostics remain; permanent errors are disclosed instead of bypassed. |
| 31 generic normalization-warning days | Historical records did not retain rejected entries, so their exact causes cannot be reconstructed. Existing reason-level exclusions and strict future-event classification are retained. The audit does not relabel these old warnings as healthy. |
| October 21 deployment check failed with 404 | [Run 39635063425](https://github.com/AGS-cyber/daily-security-news/actions/runs/39635063425) pushed at 16:29:39 UTC and stopped checking at 16:32:26. The [commit's Vercel status](https://github.com/AGS-cyber/daily-security-news/commit/41c5823dc01e7c4eb00426837cc7f8bcef555b90) records successful deployment at 16:38:41. Polling now has a ten-minute wall-clock budget and fresh attempt query keys; it verifies dated JSON, homepage generation and app archive index. The daily job allows 30 minutes overall. |

Additional safeguards: successful retries include both attempts' usage; explicitly
truncated API responses cannot be accepted; ranks must be unique/contiguous and
angles nonempty. Healthy quiet days skip the model. A late failure cannot replace
an existing article with a digest or introduce a new failing stage/source. The
publication/seen files remain untouched when blocked; enrichment cache refreshes
can already have happened. Unreadable or HTML-only prior output is protected.

`npm run check:health` checks today's record (or an explicit date) and exits nonzero
for degradation, stale publication or detected inconsistencies. The daily workflow
runs it after publication, even if deployment verification failed, and writes an
escaped GitHub job summary. Partial first editions remain available to readers.
`npm run audit:editions` reports all stored dates, gaps and failures grouped by
stage/source. `EDITIONS_DIR` can point either command at an isolated audit directory.
No email, issue, or third-party notification is sent.

Validation: baseline 178 tests passed; the final **199/199 tests and typechecking
pass on pinned Node 22.23.4**. The expanded suite covers the historical
failure cases, corrective retries, CVE evidence boundaries, truncated output,
quiet days, byte-preserving late-failure protection, health-command exit codes,
and a nine-minute deployment using a fake clock. All 25 October articles pass the
revised validator; all 83 editions render in memory. Live feed checks passed for
12/12 sources, and a read-only deployment check confirmed the dated JSON, homepage
and archive index match generation `2026-10-27T13:42:34.026Z`.

These changes are local and not deployed by this audit. No paid model generation
was performed; correction efficacy beyond the deterministic regression cases
still needs observation in future production runs. External services can fail
again, and arbitrary factual prose is not completely verified by these checks.

## Deployment preparation ? 2026-10-27

The release is based on production commit `16f38b6aa4b2720f5be68689962a440a4ab17401`.
It preserves production's HTTP CSP, its deployment regression test, release notes,
and all 83 stored editions. No archive, cache, seen ledger or generated site file
is changed by this code release. The combined suite passes **200/200 tests** and
typechecking on Node 22.23.4; today's record passes `check:health`.

The clean install identified [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
in Zod 4.4.3. The manifest and lockfile now require the patched 4.6.6 release.
The installation audit reports zero known vulnerabilities after the update, and
all checks above passed again with the patched dependency.
