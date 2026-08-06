# Test fixtures

Verbatim copies of what the Vercel deploy serves at `/editions/2026-08-06.json`
and `/editions/index.json`, captured 2026-08-06. Copied byte for byte — do not
reformat them.

They exist so the Kotlin models are tested against real production output
rather than a hand-written fixture, which is the only thing that catches drift
between `src/types.ts` and the data classes (`docs/app.md` §4).
