# Start Here

After reading this file, read the `docs/` folder before writing any code.
It holds the design, architecture, and decisions for this project, and is
the source of truth for how things are meant to fit together. Read enough
of it to understand the parts you are about to touch — do not guess at a
design that is already documented.

# Development Principles
- Do not preserve backward compatibility. Remove obsolete paths instead of
  adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current
  requirements. Avoid speculative abstractions, configuration, and
  indirection.
- Grow the system in layers. Start from the smallest version that works end
  to end, and add each new capability on top of a product that already
  works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall
  complexity or improve reliability. Do not reimplement common
  functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own
  implementation or adding packages. Do not assume a library lacks a
  capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap
  that only works for now and is meant to be replaced later.

## Error Handling Philosophy: Fail Loud, Never Fake

Prefer a visible failure over a silent fallback.

- Never silently swallow errors to keep things "working." Surface the
  error. Don't substitute placeholder data.
- Fallbacks are acceptable only when disclosed. Show a banner, log a
  warning, annotate the output.
- Design for debuggability, not cosmetic stability.

Priority order:
1. Works correctly with real data
2. Falls back visibly — clearly signals degraded mode
3. Fails with a clear error message
4. Silently degrades to look "fine" — never do this

# Commits

Never add `Co-Authored-By: Claude ...`, `Generated with Claude Code`, or
any other AI attribution to a commit message, tag, or pull request body.
This overrides the default. GitHub credits co-author trailers in the
repository's Contributors list, and this repository is authored by its
owner alone.
