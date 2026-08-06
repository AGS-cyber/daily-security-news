# Daily Security News

One written article per day, around 08:00 US Eastern, covering what actually
mattered in security over the previous 24 hours. Not a feed dump and not a list
of headlines — a piece you read start to finish in a few minutes and come away
current.

**Live site:** https://ags-cyber.github.io/daily-security-news/

The reader is assumed to be security-literate. They don't need "what is
ransomware"; they need to know which of yesterday's forty stories are worth
their attention and why.

`docs/design.md` is the source of truth for how this project is meant to fit
together. This file is the entry point; that one is the design. Read it before
changing anything.

## Current state

Build order §10 has five layers. **Layers 1 and 2 are done**; the site currently
publishes a plain chronological digest, not a written article.

| Layer | What it adds | Status |
|---|---|---|
| 1 | RSS → dedupe → digest page, run by hand | done |
| 2 | Actions schedule, Pages deploy, archive, seen store | done |
| 3 | `select` + `write` against DeepSeek — the actual article | next |
| 4 | CISA KEV + NVD enrichment | not started |
| 5 | Hacker News, r/netsec, optional search API | not started |

Until layer 3 lands, every page carries a block saying it is an automated
digest rather than a written article. That is deliberate: §8 forbids a degraded
page that looks like a normal edition, and the digest renderer *is* the
permanent fallback mode, so it ships as exercised code rather than an untested
branch.

## Running it

Requires Node 22+ (the code uses native `fetch` and the built-in test runner).

```sh
npm install
npm start        # one run, one edition
npm test         # unit tests for the two pure, tricky functions
npm run typecheck
```

A run collects every feed, writes `data/editions/<date>.json` and the pages
under `site/`, then records what it published in `data/seen.json`. Open
`site/index.html` in a browser.

Expect the **first** run to produce an unusually large edition — a fresh seen
store makes the full 7-day eligibility window available at once. Every run
after it settles to roughly a day's news.

## How a run works

```
collect ─▶ normalize ─▶ dedupe ─▶ filter ─▶ render ─▶ publish
```

Each stage takes data in and returns data out, so any stage can be run and
inspected alone. Layer 3 inserts `select` and `write` (the two LLM calls)
between `filter` and `render`.

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
- **render** — edition JSON, then `index.html`, a dated page, and the archive.
- **publish** — Actions commits `site/` and `data/` and deploys to Pages.

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
src/
  index.ts                  entry point — one run, one edition
  config/sources.ts         the source list
  collect/                  one module per source kind
  pipeline/                 normalize, dedupe, filter
  render/                   edition JSON + HTML
  store/seen.ts             the only mutable state
data/
  seen.json                 canonical-URL hashes → date first covered
  editions/YYYY-MM-DD.json  the record behind each page
site/                       generated, published to Pages
```

`data/` and `site/` are committed on purpose — they are the product, and the
edition JSON is the record of what was considered on any given day.

## Scheduling

`.github/workflows/daily.yml` runs at `0 12 * * *` UTC — 08:00 US Eastern,
which also avoids DeepSeek's 2× peak-pricing window (§6, §9). Actions cron
drifts under load, so the target is "around 08:00" and not a promise.

`workflow_dispatch` is enabled, so you can trigger a run by hand from the
Actions tab.
