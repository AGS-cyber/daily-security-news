# Operations

How to run, deploy, and debug this thing. `design.md` is the source of truth
for *what* the system is and why it is shaped that way; this file is what you
need when it is 08:00 and the build is red.

Repository: https://github.com/AGS-cyber/daily-security-news
Live site: https://daily-security-news.vercel.app/ — Vercel, built from `main`
on every push. The old GitHub Pages URL is retired.

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

> **A `.env` file will not work.** `.gitignore` lists `.env` and `.env.*`, but
> there is no `dotenv` dependency and nothing reads one — `llm/client.ts` goes
> straight to `process.env`. The gitignore entries are there so a stray file
> cannot be committed, not because the file would be loaded. Put the key in a
> real environment variable:
>
> ```powershell
> $env:DEEPSEEK_API_KEY = "sk-..."                                            # this shell
> [Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY','sk-...','User')   # persists
> ```
>
> The failure is at least loud: a `.env`-only setup produces the digest under
> the "is not set" banner rather than appearing to work.

> **The generation path first ran on 2026-08-06** and produced an article on
> the first attempt: `mode: "article"`, empty `degraded`, 8 stories, $0.0047.
> The model honoured the prompt contract — valid JSON from `select`, and no
> citation in `write` that `select` had not chosen.
>
> Keep checking anyway. After any change to a prompt, the model, or the item
> set, confirm the edition JSON has `mode: "article"` with a plausible `usage`
> block rather than trusting the green check — §5 records what a green check
> is worth on its own.

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

One job. `build` checks out, installs, typechecks, tests, runs the generator,
and commits `site/` and `data/` back to `main`. It needs `contents: write` and
nothing else.

**There is no deploy job — the push is the deploy.** Vercel's Git integration
builds `main` on every commit, so the workflow's `git push` is what publishes.
Nothing in this repository talks to Vercel, and no Vercel token is stored here.

Vercel project settings, which `vercel.json` pins so they are not dashboard-only
state:

| Setting | Value | Why |
|---|---|---|
| Framework Preset | Other | There is no framework |
| Output Directory | `site` | The pages are committed, not built |
| Build Command | empty | Nothing to build |
| Install Command | empty | The site needs no dependencies |

If the first deploy 404s, it is almost always Output Directory: Vercel served
the repo root instead of `site/`.

**A known, harmless annotation.** Every run reports that `actions/checkout@v4`
and `actions/setup-node@v4` target Node 20 and are being forced onto Node 24.
It is a deprecation notice about the actions' own runtime, not about the Node
22 this project runs on, and it does not affect the build. Bumping both to
`@v5` clears it whenever someone is in the file anyway.

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

**Change how pages look, then rebuild them all.** A normal run rewrites only
three files — today's dated page, `index.html`, and the archive. So after any
change under `render/` — the CSS, the layout, the markup — **every past dated
page keeps the old design**, silently and indefinitely. Nothing warns you;
stale pages render perfectly, just wrong.

```sh
npm run rerender
```

That rebuilds every page from `data/editions`. It makes no network calls, calls
no model, and does not touch `seen.json` — the edition pages are a pure
function of the editions, which is the whole reason the editions are the
record. It is also the right way to preview a design change: run it, open
`site/index.html`, and no API budget is spent.

**Expect one line of diff even when nothing changed.** `archive.html` carries a
`Generated <timestamp>` footer stamped at render time, so it differs on every
run. If that footer is the *only* change after a re-render, your renderer edit
had no visible effect — that is a useful signal, not a fault. The dated pages
and `index.html` are byte-stable when the markup is unchanged.

**Regenerate a day's edition from scratch.** Different operation, and a
destructive one — this re-runs the pipeline rather than re-rendering what it
already produced:

```sh
rm -rf data site
npm start
```

This rebuilds `seen.json` empty, so the run pulls the full 7-day window and
produces an unusually large edition — the cold-start behaviour in §3, not a
fault. It also spends an LLM call and writes a *different* article from a
different story set (see "A later re-run produces a smaller edition" in §5).
If all you changed was presentation, you want `npm run rerender` instead.

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
| `DEEPSEEK_API_KEY is not set` | No credential at all — the variable is absent |
| `DEEPSEEK_API_KEY is set but its value is empty` | The secret exists and holds nothing. See below |
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
edition. **Measured on the first real run (2026-08-06): $0.0047** — 16,785
input tokens, 8,337 output, all cache misses, on `deepseek-v4-flash`. That is
about **$0.15/month**. Treat it as one data point from one day's news, not a
settled average; §6 previously *estimated* 40K in / 15K out, which was more
than double the truth. If the figure looks wrong, check `usage` in the edition
JSON — `promptCacheHitTokens` and `promptCacheMissTokens` are recorded
separately so cache behaviour is observable rather than assumed. A once-daily
run will usually miss the cache, so expect the hit count to stay at zero.

### The secret exists but its value is empty

**Symptom:** `gh secret list` shows `DEEPSEEK_API_KEY`, the workflow passes it
through `env:`, and the edition still comes out `mode: "digest"` with
`select failed — DEEPSEEK_API_KEY is set but its value is empty`. The build is
green and fast — about 20 seconds, versus roughly two minutes for a real run.

**Actual cause:** the secret exists but its **value is empty**. `gh secret set`
takes the value from a blind paste that echoes nothing, so a paste that does
not register still creates the secret. `gh secret list` only ever proves a
secret exists — it never shows the value, so it cannot tell you this.

**Diagnose from the run log,** which settles it in one line:

```sh
gh run view <run-id> --log | grep -A2 'Run npm start'
```

Actions masks a real secret as `***`. So this is a populated secret:

```
env:
  DEEPSEEK_API_KEY: ***
```

and this is an empty one — nothing to mask, nothing printed:

```
env:
  DEEPSEEK_API_KEY:
```

**Fix:** re-set it through the GitHub web UI (Settings → Secrets and variables
→ Actions), where the value is visible before you save. From the terminal,
redirect from a file rather than pasting blind:

```sh
gh secret set DEEPSEEK_API_KEY --repo AGS-cyber/daily-security-news < key.txt
```

**Runtime is the cheap tell.** Two DeepSeek calls take on the order of two
minutes. Any "successful" run finishing in well under a minute did not call a
model, whatever the check colour says.

**The banner used to lie about this, and no longer does.** Until 2026-08-06
`createClient()` returned the same `null` for an unset key and an empty one, so
both printed "is not set" — which is why the first diagnosis went hunting
through the workflow file while the fault was in the stored value. The two
reasons are now distinct, and `src/llm/client.test.ts` guards the distinction,
including the whitespace-only case. If you ever see "is not set" again, the
variable really is absent.

### A run sits in `queued`, or the deploy never happens

**Symptom:** the whole workflow sits `queued` for ten minutes without starting.
Or `build` passes every step and the live site never updates.

**Actual cause, historically:** GitHub-side capacity, not this repository. The
same workflow ran cleanly minutes earlier with no changes in between.

**Response:** re-run it. `gh workflow run daily.yml`. Do not start rewriting
the workflow — check whether it has ever succeeded unchanged first.

**A green build does not mean a deploy happened.** The two are decoupled by
design: `build` commits and pushes, Vercel deploys off the push. So a green
check plus a stale site means the push landed and Vercel did not act on it —
check the Vercel dashboard's deployment log, not the Actions log. Nothing is
lost either way; the pages are committed, so the next successful deploy
reconciles them.

> Recorded because it was the shape of a real failure under the previous host:
> the build job committed while GitHub Pages kept serving the last successful
> deploy, so the repo and the live site disagreed while every check was green.
> The decoupling survived the move to Vercel, so the symptom will too.

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
curl -sS https://daily-security-news.vercel.app/ | grep -oE '[0-9]+ stories[^<]*'

# Does the live site match what was committed? A green build is not a deploy.
curl -sS https://daily-security-news.vercel.app/index.html | diff - site/index.html
```
