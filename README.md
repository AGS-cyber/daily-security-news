# Daily Security News

One written article per day, around 08:00 US Eastern, covering what actually
mattered in security over the previous 24 hours. Not a feed dump and not a list
of headlines — a piece you read start to finish in a few minutes and come away
current.

**Live site:** https://daily-security-news.vercel.app/ — deployed on Vercel
from `main`.

The reader is assumed to be security-literate. They don't need "what is
ransomware"; they need to know which of yesterday's forty stories are worth
their attention and why.

Two documents sit behind this one, and this file deliberately does not
duplicate either:

- **`docs/design.md`** — the source of truth for what this system is and why
  it is shaped the way it is, including every decision made and the reasoning
  that settled it. Read it before changing anything.
- **`docs/operations.md`** — running it, deploying it, and debugging it. Go
  straight there when the build is red, a feed stops working, or the site and
  the repo disagree. It records the failure modes that have actually happened,
  each of which pointed somewhere other than its cause.

## Current state

Build order §10 has five layers. **Layers 1, 2 and 3 are done** — the site
publishes a written article daily, unattended.

| Layer | What it adds | Status |
|---|---|---|
| 1 | RSS → dedupe → digest page, run by hand | done |
| 2 | Actions schedule, hosted deploy, archive, seen store | done |
| 3 | `select` + `write` against DeepSeek — the actual article | done |
| 4 | CISA KEV + NVD enrichment | not started |
| 5 | Hacker News, r/netsec, optional search API | not started |

**First real article: 2026-08-06**, on `deepseek-v4-flash`. Before that the
generation path had never made a real HTTP request — it was covered only by
tests against a stubbed client — so that run was also its first test. It
produced `mode: "article"` with an empty `degraded` array, 8 stories written up
across all five sections and 117 listed below, at a measured **$0.0047**.

The digest renderer remains the permanent §8 fallback, not dead code. When
`select` or `write` fails, the page publishes as a chronological digest under a
banner naming the stage and the reason. That the fallback is a *disclosed* one
is the point: §8 forbids a degraded page that looks like a normal edition, and
because the digest shipped first (build order §10.1) it is exercised code
rather than an untested branch.

## Running it

Requires Node 22+ (the code uses native `fetch` and the built-in test runner).

```sh
npm install
npm start          # one run, one edition
npm run rerender   # rebuild all pages from stored editions — no network, no LLM
npm test
npm run typecheck
```

A run collects every feed, writes `data/editions/<date>.json` and the pages
under `site/`, then records what it published in `data/seen.json`. Open
`site/index.html` in a browser.

`npm run rerender` is what you want after changing anything under `render/`: a
normal run only rewrites today's page, `index.html` and the archive, so past
dated pages would otherwise keep the old design indefinitely.

Expect the **first** run to produce an unusually large edition — a fresh seen
store makes the full 7-day eligibility window available at once. Every run
after it settles to roughly a day's news.

## How a run works

```
collect ─▶ normalize ─▶ dedupe ─▶ filter ─▶ select ─▶ write ─▶ render ─▶ publish
                                            └───  LLM  ───┘
```

Each stage takes data in and returns data out, so any stage can be run and
inspected alone. Only the two middle stages call a model; everything else is
deterministic code, because fetching, parsing and deduping are not judgment
calls.

- **collect** — fetch all feeds concurrently. Per-source failures are
  non-fatal: they append a notice to the edition and render as a banner naming
  what failed. A thinner page is never silently passed off as complete.
- **normalize** — canonical URL (strip tracking params, fragments, AMP paths),
  validated ISO date, plain-text excerpt.
- **dedupe** — exact canonical-URL match, then title similarity, so the same
  story from five outlets becomes one item that cites the earliest and notes
  who else covered it.
- **filter** — drop anything already published in an earlier edition, or older
  than 7 days. See §3; this is one window, not two.
- **select** — LLM call 1. Which 6–8 stories make the article, in what order,
  under which section. Returns JSON, validated with Zod.
- **write** — LLM call 2. The prose, in Markdown. The model never emits a URL
  or a date: it cites stories by pipeline-assigned id (`[[s7]]`) and `render`
  substitutes the real link. A cited id that doesn't exist is a hard error, not
  a broken link shipped to the reader.
- **render** — edition JSON, then `index.html`, a dated page, and the archive.
- **publish** — Actions commits `site/` and `data/` to `main`. Vercel deploys
  off that push; there is no deploy job.

Pipeline-stage failures are hard failures: the run aborts, nothing deploys,
yesterday's article stays up, and the build goes red. There is no partial
publish and no placeholder content.

## Sources

Twelve RSS feeds in `src/config/sources.ts` — news outlets, vendor research
blogs, and CISA advisories. Adding one is a one-line edit.

Feed URLs rot, and they rot quietly: a dead feed usually returns HTTP 200 with
an HTML page rather than a 404, which surfaces as an XML parse error that reads
like a malformed feed. When a source starts failing, check what the URL
actually serves before assuming the feed is broken:

```sh
curl -sSL -o /dev/null -w '%{http_code} %{content_type}\n' <feed-url>
```

Anything that isn't an XML content type means the URL moved.

## Layout

```
docs/design.md              the design — source of truth
docs/operations.md          running, deploying, debugging
src/
  index.ts                  entry point — one run, one edition
  config/sources.ts         the source list
  collect/                  one module per source kind
  pipeline/                 normalize, dedupe, filter, select, write
  llm/client.ts             DeepSeek client + usage accounting
  render/                   edition JSON + HTML, and the terminal theme
  store/seen.ts             the only mutable state
data/
  seen.json                 canonical-URL hashes → date first covered
  editions/YYYY-MM-DD.json  the record behind each page
site/                       generated, served by Vercel
vercel.json                 output directory; no build step
```

`data/` and `site/` are committed on purpose — they are the product, and the
edition JSON is the record of what was considered on any given day.

## Scheduling

`.github/workflows/daily.yml` runs at `0 12 * * *` UTC — 08:00 US Eastern,
which also avoids DeepSeek's 2× peak-pricing window (§6, §9). Actions cron
drifts under load, so the target is "around 08:00" and not a promise.

`workflow_dispatch` is enabled, so you can trigger a run by hand from the
Actions tab.
