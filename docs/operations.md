# Operations

How to run, deploy, and debug this thing. `design.md` is the source of truth
for *what* the system is and why it is shaped that way; this file is what you
need when it is 08:00 and the build is red.

Repository: https://github.com/AGS-cyber/daily-security-news
Live site: https://daily-security-news.vercel.app/ — Vercel, built from `main`
on every push. The old GitHub Pages URL is retired.
Newsletter: https://buttondown.com/AGS — Buttondown, free tier (100 subscribers).
Android: https://github.com/AGS-cyber/daily-security-news/releases — latest is
`app-v0.3.0`.

## 0. Where things stand

A short, dated state-of-the-world, because the sections below explain *how*
things work and not *what has actually happened yet*. Update it when one of
these lines stops being true.

**As of 2026-08-11:**

- The pipeline has published daily since 2026-08-06. Five editions exist.
- **The email edition is live but has never delivered to a human.** The
  subscribe form is on every page and in the app, `BUTTONDOWN_API_KEY` is set,
  and the cron send is armed — but the list has no confirmed subscribers, so
  no send has yet had a recipient. Until one does, treat the whole path as
  unexercised in production.
- Consequently **three things have never been observed**, and each is a place
  to look first if something seems wrong:
  1. A real subscribe reaching Buttondown from either client.
  2. The app's `Sent` banner wording (`app.md` §12).
  3. An edition rendered by a real mail client rather than a browser. The
     email uses inline styles and a table layout precisely because clients are
     hostile, but nothing has confirmed the result in Outlook or Gmail. Use
     `npm run email -- --dry-run` and an email-rendering tester before
     assuming it is fine.
- Android `0.3.0` adds compact CISA KEV and NVD vulnerability intelligence to
  the briefing. **iOS still compiles but has never been run** — see
  `app.md` §7, which is emphatic that a build proves nothing about a screen.

## 1. Setup

Node 22+ is required — the code uses native `fetch` and the built-in test
runner, and the workflow pins Node 22.

```sh
npm install
npm start        # one run, one edition
npm test
npm run typecheck
```

Two operational credentials and one optional enrichment credential:

```sh
gh secret set DEEPSEEK_API_KEY --repo AGS-cyber/daily-security-news
gh secret set BUTTONDOWN_API_KEY --repo AGS-cyber/daily-security-news < key.txt
gh secret set NVD_API_KEY --repo AGS-cyber/daily-security-news < nvd-key.txt  # optional
```

`NVD_API_KEY` raises the NVD API limit from 5 to 50 requests per rolling 30
seconds. The pipeline batches up to 100 CVEs per request and remains functional
without a key. An unset or empty optional key is omitted from the request; it is
never written to a URL, log, cache, edition, or generated page.

**They fail differently and the difference is deliberate.** A missing
`DEEPSEEK_API_KEY` is a disclosed fallback and the build stays green. A missing
`BUTTONDOWN_API_KEY` fails the run **red**, because a send has no degraded mode
to fall back to (design §12). Set it before the next scheduled run, or expect a
red check every morning with the site publishing correctly regardless.

`BUTTONDOWN_API_KEY` comes from Buttondown → Settings → API. Scope it to the
minimum the send actually uses — Buttondown's keys are per-category:

| Category | Access | Why |
|---|---|---|
| **Emails** | **Read & write** | `POST /v1/emails` creates the edition |
| **Sending** | **Enabled** | `status: about_to_send` needs it |
| Subscribers | **None** | Subscribing uses the keyless endpoint, never this key |
| Automations, Forms, Surveys, Settings, Styling | **None** | Unused. `Settings` in particular grants billing information |

Those default to `Read` in the UI and must be turned down by hand. The point of
`Subscribers: None` is that a key leaked from Actions **cannot read the
subscriber list** — the only thing this key can do is publish an edition.

### The username is the value nothing can check for you

The account's **username must match `BUTTONDOWN_USERNAME` in
`src/config/newsletter.ts`** — and its Kotlin restatement in
`net/SubscribeRepository.kt`. It is baked into the subscribe form on every page
and into the app binary, and a mismatch signs readers up to a different
newsletter with nothing here able to detect it.

It is **`AGS`**, upper case. Buttondown canonicalises the name and
302-redirects `buttondown.com/ags` to `buttondown.com/AGS`. That matters
because every HTTP client answers a 302 on a POST by re-issuing it as a GET
with no body: the lower-case spelling would drop the address and land the
reader on the archive page looking subscribed. Use the spelling the service
redirects *to*.

Verify a username before trusting it — a wrong one is a 404, not an error:

```sh
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" https://buttondown.com/AGS
```

`200` with no redirect is correct. `302` means it is not canonical. `404` means
the account does not exist.

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
data/sent.json                date → {sentAt, emailId} for every edition mailed
data/cache/vulnerability-intelligence.json  validated KEV/NVD cache
data/editions/YYYY-MM-DD.json the full record behind that day's page
site/index.html               today's edition
site/YYYY-MM-DD.html          the same content, permanently addressed
site/archive.html             index of every edition
site/editions/YYYY-MM-DD.json the same record as data/editions, also web-served
site/editions/index.json      the archive index as JSON, also web-served
```

`data/` and `site/` are **committed on purpose** — they are the product. The
edition JSON is the record of everything considered on a given day, which is
what makes it possible to answer "why wasn't this story covered?" later.

The vulnerability cache is committed so same-day reruns and temporary
CISA/NVD outages can reuse authoritative data. It is disposable state, unlike
the seen and send ledgers: a malformed cache is visibly ignored and rebuilt
where authoritative sources are available, never trusted.

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

**Preview the email without sending one.** Free, offline, and the only sane way
to iterate on the design — the send itself cannot be undone.

```sh
npm run email -- --dry-run
```

That writes `email-preview.html` (gitignored) and sends nothing. Open it, and
paste it into an email-rendering tester if the change touched layout — a
browser is a generous client and Outlook is not.

**Mail an edition by hand.** Only needed when a scheduled send failed and you
have fixed the cause:

```sh
npm run email                        # today's edition
npm run email -- --date 2026-08-06   # a specific one
```

**Deliberately re-send a date.** There is no `--force`, on purpose: the guard
should take an explicit act to defeat, not a flag that lives next to the normal
command. Remove the date's entry from `data/sent.json` and run it again.

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

### The page renders but has lost its font, size and colour

**Symptom:** an email (or any inline-styled markup) comes out in the browser's
default serif at the default size, on the right background. Nothing errors and
the HTML looks correct at a glance.

**Actual cause:** a **double quote inside a double-quoted `style="…"`
attribute**. The attribute closes early and every declaration after that point
is discarded. The trigger here was the monospace font stack, which names
`"SF Mono"` and `"DejaVu Sans Mono"`.

**Fix, already in place:** `src/render/palette.ts` quotes family names with
apostrophes. CSS accepts either, so one constant serves the `<style>` block and
the inline attribute. `src/render/email.test.ts` asserts no `style` attribute
contains a double quote.

**Why it is written down:** this was invisible to a green test suite and to
reading the source. It was found by opening the file and noticing the text was
not monospace — the same lesson `app.md` §10 records for the app.

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

### Vulnerability enrichment is partial or stale

**Symptom:** the edition remains an article or digest, but its degraded banner
names `cisa-kev`, `nvd`, or `vulnerability-cache`. Individual CVEs show
provenance status `unavailable`, or the banner says a cached timestamp was
used.

**This normally means publication degraded correctly.** KEV and NVD are
independent sources. A KEV failure must not remove valid NVD data, an NVD
failure must not remove a confirmed KEV hit, and neither failure may remove the
CVE identifier extracted from the news story.

Checks, in order:

1. Inspect the banner or `edition.degraded`; the original HTTP, timeout,
   malformed-response, or cache error is preserved.
2. Inspect `data/cache/vulnerability-intelligence.json`. Its entries are fresh
   for 20 hours. Older data is allowed only as a disclosed fallback.
3. If NVD returned 429, wait for its rolling window. The client respects
   `Retry-After`, retries once, and batches up to 100 IDs; do not add parallel
   NVD calls.
4. If public NVD access is routinely limiting runs, configure the optional
   `NVD_API_KEY`. Do not move it into a query parameter.
5. If CISA.gov returns 403, confirm the log tried the official
   `cisagov/kev-data` mirror before treating the source as down.

The exact source and model contract is in `vulnerability-intelligence.md`.

## 6. Error-handling contract

From §8, so you know which failures should page you and which are working
as designed:

| Failure | Behaviour | Build |
|---|---|---|
| A feed times out, 404s, or returns garbage | Notice appended, banner on the page naming the source | green |
| Items unparseable in `normalize` | One aggregated notice, banner | green |
| CISA KEV or NVD times out, rate-limits, or returns malformed data | Use fresh/stale cache where possible; otherwise explicit unavailable fields and an `enrich` banner | green |
| A CVE is absent from NVD | Confirmed `not_found`; NVD fields remain null/empty | green |
| The vulnerability cache cannot be read or written | Rebuild or continue in memory, with an `enrich` banner | green |
| `select` or `write` fails after one retry | Falls back to the digest under a banner saying why | green |
| `DEEPSEEK_API_KEY` missing | Same as above — disclosed fallback | green |
| `dedupe`, `render`, or `publish` fails | Run aborts, nothing deploys, yesterday's edition stays up | **red** |
| `seen.json` is malformed | Throws — never silently reset, or everything republishes | **red** |
| The email send fails, for any reason | Site is already published; nothing is mailed | **red** |
| `BUTTONDOWN_API_KEY` missing or empty | Same — a send has no degraded mode (design §12) | **red** |
| The edition was already mailed | Skipped and logged; `sent.json` did its job | green |
| `sent.json` is malformed | Throws — a reset ledger would re-mail every edition | **red** |

The rule behind the table: a thinner page is always disclosed, and a page never
looks like a normal edition when it is not one. Silent degradation is the one
outcome this project refuses.

## 7. Diagnostics cookbook

```sh
# Which sources are healthy right now
node -e "const e=require('./data/editions/$(date -u +%F).json');
  const b={}; for(const i of e.items) b[i.sourceId]=(b[i.sourceId]||0)+1;
  console.log(b); console.log('degraded:', e.degraded)"

# Which CVEs were enriched, and from which authoritative sources
node -e "const e=require('./data/editions/$(date -u +%F).json');
  const s=e.mode==='article'?[...e.selected,...e.alsoCollected]:e.items;
  for(const i of s) for(const v of i.cves||[])
    console.log(v.id,v.provenance.cisaKev.status,v.provenance.nvd.status)"

# Is a feed URL still a feed?
curl -sSL -o /dev/null -w '%{http_code} %{content_type}\n' <feed-url>

# Recent workflow runs and why one failed
gh run list --workflow=daily.yml --limit 5
gh run view <run-id> --log-failed

# Did the last CI run change what I expected?
git fetch origin && git show --stat origin/main

# Is the live site current?
curl -sS https://daily-security-news.vercel.app/ | grep -oE '[0-9]+ stories[^<]*'

# Was today's edition mailed, and which Buttondown email is it?
node -e "console.log(require('./data/sent.json')['$(date -u +%F)'] ?? 'not sent')"

# What Buttondown thinks it has sent — the other side of the ledger
curl -sS -H "Authorization: Token $BUTTONDOWN_API_KEY" \
  https://api.buttondown.com/v1/emails | head -c 600

# Does the live site match what was committed? A green build is not a deploy.
curl -sS https://daily-security-news.vercel.app/index.html | diff - site/index.html
```

## 8. Releasing the Android app

`app-ci.yml` proves every change to `app/` builds. `app-release.yml` turns a
chosen commit into a downloadable APK, and the tag is how you choose it.

```sh
# 1. Bump BOTH numbers in app/androidApp/build.gradle.kts, then check them.
grep -E 'versionCode|versionName' app/androidApp/build.gradle.kts

# 2. Commit the bump, tag that commit, and push the tag. The tag is the trigger.
git tag app-v0.3.0
git push origin app-v0.3.0

# 3. Watch it, then check what actually got attached.
gh run watch "$(gh run list --workflow=app-release.yml --limit 1 \
  --json databaseId --jq '.[0].databaseId')"
gh release view app-v0.3.0
```

**`versionCode` is not guarded by anything — remember it yourself.** The
workflow checks the tag against `versionName` and stops there, so a release
that bumps the name and forgets the code builds, publishes, and looks
completely correct. It is `versionCode` that Android compares to decide an
install is an upgrade rather than a reinstall, so forgetting it is invisible
until a user cannot upgrade. Both numbers move together, every time:
0.1.0/1 → 0.2.0/2 → 0.3.0/3.

Verify the number that actually shipped, from the published artifact rather
than the build directory:

```sh
gh release download app-v0.3.0 -D /tmp/rel --clobber
sha256sum -c /tmp/rel/*.sha256
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging /tmp/rel/*.apk | head -1
```

To rebuild a tag that produced a broken release, re-run it by hand rather
than inventing a version number — `gh workflow run app-release.yml -f
tag=app-v0.1.0`. Delete the existing release first (`gh release delete`), as
`gh release create` will not overwrite one.

**The APK is the `debug` variant, and that is deliberate.** The `release`
build type has no signing config, so it produces `app-release-unsigned.apk`,
which no device will install; signing is out of scope for v1 (`app.md` §1).
The consequence to warn people about is real: each CI run generates its own
throwaway debug key, so **a new release will not install over an older one**
— Android rejects it with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` and the fix is
to uninstall first.

Making releases upgradeable means a real keystore in GitHub secrets. That is
a credential decision, not a build one, and it is the first thing to do when
store submission stops being out of scope.

Two guards worth knowing about, because both fail the job rather than
publishing something wrong:

- **The tag must match `versionName`.** Nothing otherwise keeps them in step,
  and an APK whose filename disagrees with the version it reports to the
  system is exactly the quiet wrongness `CLAUDE.md` ranks last.
- **The release is re-read after publishing** to confirm an APK is actually
  attached. A release that exists with no asset is worse than a failed job,
  because it looks finished.

The workflow uses the runner's preinstalled `gh` rather than a third-party
release action — one less dependency to trust in a repository that publishes
security news.

**iOS is not distributed.** CI builds and links it, but it has no signing
identity and its `AppIcon.appiconset` is empty (`app.md` §1, §7).
