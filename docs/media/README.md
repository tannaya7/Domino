# Media

All five files below are captured and committed — every image referenced from
[README.md](../../README.md) or [docs/SUBMISSION.md](../SUBMISSION.md) resolves already. This file
now documents what each one is and how it was captured, so a stale screenshot (the UI changed,
the numbers moved) can be told apart from a wrong one and re-captured the same way.

Everything here was captured against the live demo (a real browser session driven through
`mcp__claude-in-chrome`, screenshotting the actual rendered app and the actual GitHub PR pages) —
never mock data or a design tool. Static screenshots are `.jpg` (the actual format the capture tool
produces), not `.png`, despite this directory's original naming plan.

## `hero.gif`

45-second-tour-style walkthrough on `documenso/documenso`: load the example → open the Risk
Register tab → click a vendor row (Resend) to show its blast-radius panel in the vendor graph →
click "Simulate this vendor's outage" → the result (entrypoints down, loss/hour, cascading
highlight on shared-substrate vendors) appears. 14 frames, ~3.5MB.

Re-capture: open the [live demo](../../README.md), start `gif_creator` recording, repeat the
sequence above, `export` with `download: true`, then copy the downloaded file here.

## `pr-gate-fail.jpg` / `pr-gate-pass.jpg`

The Actions run detail page (not the PR conversation tab — it renders the `gate` job's pass/fail
status and its full markdown summary in one screenshot, which the conversation tab's collapsed
checks widget doesn't) for the two proof PRs in [docs/proof/PROOF.md](../proof/PROOF.md):

- `pr-gate-fail.jpg`: https://github.com/tannaya7/documenso/actions/runs/35467422897 (PR #1, adds Mixpanel — policy violation)
- `pr-gate-pass.jpg`: https://github.com/tannaya7/documenso/actions/runs/35467424727 (PR #2, README wording — within policy)

These run URLs are specific to this proof session — if the PRs are re-triggered again (see
PROOF.md's "How this was verified"), get the current run IDs with
`gh run list --repo tannaya7/documenso --workflow=blast-radius.yml` and re-capture from
`https://github.com/tannaya7/documenso/actions/runs/<id>`.

## `vendor-graph.jpg` / `simulate-outage.jpg`

Both from the same `documenso/documenso` example session as the GIF: `vendor-graph.jpg` is the
vendor graph grouped by substrate before any interaction (concentration panel + "4/5 vendors on
aws" callout visible); `simulate-outage.jpg` is the result state after simulating Resend's outage
(loss/hour, entrypoints down, and `documenso`/`Stripe` highlighted red from the cascading
correlated-substrate effect).

## Naming and paths

Filenames are referenced literally from README.md and SUBMISSION.md — renaming a file here breaks
that link silently (GitHub shows a broken-image icon, not an error). If the UI changes enough that
one of these no longer represents it accurately, re-capture it under the same filename rather than
adding a new one, unless the corresponding README/SUBMISSION reference is also being updated.
