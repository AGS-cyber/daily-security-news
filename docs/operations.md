# Operations

How to run, deploy, and debug this thing. `design.md` is the source of truth
for *what* the system is and why it is shaped that way; this file is what you
need when it is 08:00 and the build is red.

Repository: https://github.com/AGS-cyber/daily-security-news
Live site: https://ags-cyber.github.io/daily-security-news/

## 1. Setup

Node 22+ is required — the code uses native `fetch` and the built-in test
runner, and the workflow pins Node 22.

```sh
npm install
npm start        # one run, one edition
npm test
npm run typecheck
```

One credential, only needed from layer 3 onward:

```sh
gh secret set DEEPSEEK_API_KEY --repo AGS-cyber/daily-security-news
```

Locally, export `DEEPSEEK_API_KEY` in your shell. **Nothing breaks without
it** — a missing key is treated as an LLM failure, so the run publishes the
chronological digest under a banner explaining the article is missing (§8).
That is a disclosed fallback, not a crash, and it is the behaviour you should
expect to see until the secret is set.

> **The generation path has never run.** Everything downstream of a successful
> DeepSeek response — the HTTP calls, usage accounting, and whether the model
> honours the prompt contract — is covered only by tests against a stubbed
> client. The first run with a real key is also the first test of it. Watch
> that run rather than assuming it worked, and check the edition JSON has
> `mode: "article"` with a plausible `usage` block.

## 2. What a run produces

```
data/seen.json                canonical-URL hash → date first covered
data/editions/YYYY-MM-DD.json the full record behind that day's page
site/index.html               today's edition
site/YYYY-MM-DD.html          the same content, permanently addressed
site/archive.html             index of every edition
```

`data/` and `site/` are **committed on purpose** — they are the product. The
edition JSON is the record of everything considered on a given day, which is
what makes it possible to answer "why wasn't this story covered?" later.

## 3. The scheduled job

`.github/workflows/daily.yml`, cron `0 12 * * *` UTC — 08:00 US Eastern, which
also dodges DeepSeek's 2× peak-pricing window (§6, §9).

Two jobs. `build` checks out, installs, typechecks, tests, runs the generator,
commits `site/` and `data/` back to `main`, and uploads `site/` as a Pages
artifact. `deploy` publishes that artifact via `actions/deploy-pages@v4`.

Needs `contents: write` (to commit), `pages: write` and `id-token: write` (to
deploy), and Pages configured with **build source = GitHub Actions**:

```sh
gh api repos/AGS-cyber/daily-security-news/pages -X POST -f build_type=workflow
```

`workflow_dispatch` is enabled, so you can trigger a run by hand:

```sh
gh workflow run daily.yml
gh run watch "$(gh run list --workflow=daily.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

**Actions cron drifts.** The first scheduled run fired at 13:52 UTC against a
12:00 schedule. §9 already says the target is "around 08:00" and not a promise;
do not treat a late run as a fault.

## 4. Common tasks

**Add or remove a source.** One line in `src/config/sources.ts`. Verify the URL
actually serves a feed first (§5 below) — that check is not optional, because
dead feeds do not announce themselves.

**Change the schedule.** The cron in `daily.yml`. If you move it, re-check
§6/§9 — some hours cost twice as much on DeepSeek.

**Regenerate a day's edition from scratch.** Delete the generated state and
re-run. Everything is reproducible from the feeds plus the seen store:

```sh
rm -rf data site
npm start
```

Note this rebuilds `seen.json` empty, so the run pulls the full 7-day window
and produces an unusually large edition. That is the cold-start behaviour
described in §3, not a fault.

**Inspect an edition without opening the HTML:**

```sh
node -e "const e=require('./data/editions/2026-08-06.json');
  console.log(e.mode, e.stats, e.degraded)"
```

**See what CI actually committed** — worth doing after any workflow change,
because a green check does not prove the output is right:

```sh
git fetch origin && git show --stat origin/main
```

## 5. Failure modes seen in production

Every one of these actually happened. They are recorded because in each case
the symptom pointed somewhere other than the cause.

### A dead feed returns HTTP 200 with an HTML body

**Symptom:** `rss-parser` reports `Feed not recognized as RSS 1 or 2`, or an
XML error like `Invalid attribute name` / `Invalid character in entity name`.
Reads like a malformed feed.

**Actual cause:** the URL moved, and the host serves a landing page or an SPA
shell with a **200** status instead of a 404. The parser is choking on HTML.
Two of the original twelve feeds did exactly this — `msrc.microsoft.com`
redirected to a marketing page, and the Google Cloud threat-intelligence path
returned a JavaScript app shell.

**Diagnose:**

```sh
curl -sSL -o /dev/null -w '%{http_code} %{content_type} %{url_effective}\n' <feed-url>
```

Anything that is not an XML content type (`application/rss+xml`, `text/xml`,
`application/atom+xml`) means the URL moved. Find the new one or replace the
source; do not leave a permanently failing feed in the config, because a
banner that is always on trains the reader to ignore banners.

### The process completes every stage and never exits

**Symptom:** all log lines print, output files are written correctly, and the
process just sits there. In Actions this hangs the job until the timeout
instead of deploying.

**Actual cause:** since Node 19 the global HTTP agent defaults to
`keepAlive: true` with no idle timeout, so pooled sockets stay open and hold
the event loop open with them. It only appeared with all twelve feeds — a
two-feed probe exited cleanly, which made it look like it was not the HTTP
layer at all.

**Fix, already in place:** `requestOptions: { agent: false }` in
`src/collect/rss.ts` gives each request a throwaway agent. We fetch each host
once per run, so there is no connection worth pooling. **Do not remove it.**

**Diagnose a recurrence:** `process.getActiveResourcesInfo()` after the work
finishes. A lingering `TCPSocketWrap` is this bug.

### A second run in one day destroyed the day's edition

**Symptom:** a green workflow run that committed 3,234 deletions, replacing a
140-story edition with an empty one. The page read "No new stories in this
window" — which looks exactly like a healthy quiet day.

**Actual cause:** the seen store was consulted for *presence* rather than
*date*. Run 1 marked every published URL seen; run 2 therefore kept nothing
and `render` wrote an empty edition over the real one. Triggered by any
hand-run, any retry after a failed publish, and any cron double-fire.

**Fix, already in place:** `publishedBefore(url, date)` excludes an item only
when an **earlier** edition covered it, so an item first covered today stays
part of today's edition. `src/pipeline/filter.test.ts` guards this. See §3.

**The general lesson:** a green check is not evidence the output is correct.
Check what was committed, not just that the job passed.

### A later re-run produces a *smaller* edition

**Symptom:** re-running mid-afternoon yields fewer stories than the morning
run — 140 became 123 — with an identical `collected` count.

**Not a bug.** `collected` stays pinned because the feeds are fixed-size (they
always return their latest N), while their contents rotate. Meanwhile the
7-day eligibility window slides forward, so the oldest stories age out.

Consequence worth knowing: a same-day re-run is **non-destructive but not
idempotent** — the edition reflects whatever was collectible at generation
time. Harmless for a once-daily job. It becomes a real question at layer 3,
where a re-run regenerates a different article from a different story set. If
that ever matters, the fix is to union a re-run's items with the existing
edition for that date so the day's record only ever grows.

### The article is missing and the page is a digest

**Symptom:** the run logs `select FAILED (...) — falling back to digest`, the
page carries an "This edition is incomplete" banner, and the edition JSON has
`mode: "digest"` with a populated `degraded` array.

**This is working correctly.** Per §8 an LLM failure falls back visibly, once.
The banner names the stage and the reason. Read it — it distinguishes the cases:

| Banner says | Meaning |
|---|---|
| `DEEPSEEK_API_KEY is not set` | No credential. Set the secret. |
| `select failed — …` after retries | DeepSeek was unreachable, returned empty content twice, or its JSON failed validation |
| `write failed — …` | Selection succeeded; prose generation or its citation validation failed |
| `there are no stories to select from` | The window was genuinely empty — every feed item was already covered |

**What must never happen:** a half-written article, an article citing a story
`select` did not choose, or a page that looks like a normal edition when no
writing occurred. If you ever see one of those, that is a real bug — the
validation in `select.ts` / `write.ts` / `citations.ts` is what prevents it.

**Retry shape.** Two layers, deliberately: the client retries once on transport
failure or empty content (§6 documents empty responses as a real DeepSeek
failure mode), and `select`/`write` each retry once more on a *validation*
failure. Worst case is two validation attempts, not four transport attempts.

**Cost.** A successful run logs a cost per call, summed into `usage` on the
edition. Expect roughly $0.03/day on `deepseek-v4-pro` at ~40K in / ~15K out.
If the figure looks wrong, check `usage` in the edition JSON —
`promptCacheHitTokens` and `promptCacheMissTokens` are recorded separately so
cache behaviour is observable rather than assumed.

### Pages deploy fails with `deployment_queued`, or a run sits in `queued`

**Symptom:** the `build` job passes every step, then `deploy` polls
`deployment_queued` until `Timeout reached, aborting!`. Or the whole run sits
`queued` for ten minutes without starting.

**Actual cause:** GitHub-side capacity, not this repository. The same workflow
deployed cleanly twice end to end minutes earlier with no changes in between.

**Response:** re-run it. `gh workflow run daily.yml`. Do not start rewriting
the workflow — check whether it has ever succeeded unchanged first.

**Side effect while it is failing:** the live site and the repo disagree. The
build job still commits `site/` and `data/`, so the repo moves ahead while
Pages keeps serving the last successful deploy. The next successful deploy
reconciles them. Nothing is lost.

## 6. Error-handling contract

From §8, so you know which failures should page you and which are working
as designed:

| Failure | Behaviour | Build |
|---|---|---|
| A feed times out, 404s, or returns garbage | Notice appended, banner on the page naming the source | green |
| Items unparseable in `normalize` | One aggregated notice, banner | green |
| `select` or `write` fails after one retry | Falls back to the digest under a banner saying why | green |
| `DEEPSEEK_API_KEY` missing | Same as above — disclosed fallback | green |
| `dedupe`, `render`, or `publish` fails | Run aborts, nothing deploys, yesterday's edition stays up | **red** |
| `seen.json` is malformed | Throws — never silently reset, or everything republishes | **red** |

The rule behind the table: a thinner page is always disclosed, and a page never
looks like a normal edition when it is not one. Silent degradation is the one
outcome this project refuses.

## 7. Diagnostics cookbook

```sh
# Which sources are healthy right now
node -e "const e=require('./data/editions/$(date -u +%F).json');
  const b={}; for(const i of e.items) b[i.sourceId]=(b[i.sourceId]||0)+1;
  console.log(b); console.log('degraded:', e.degraded)"

# Is a feed URL still a feed?
curl -sSL -o /dev/null -w '%{http_code} %{content_type}\n' <feed-url>

# Recent workflow runs and why one failed
gh run list --workflow=daily.yml --limit 5
gh run view <run-id> --log-failed

# Did the last CI run change what I expected?
git fetch origin && git show --stat origin/main

# Is the live site current?
curl -sS https://ags-cyber.github.io/daily-security-news/ | grep -oE '[0-9]+ stories[^<]*'
```
