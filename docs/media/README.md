# Media to capture

Every file below is referenced by filename from [README.md](../../README.md) or
[docs/SUBMISSION.md](../SUBMISSION.md) — drop a file in at the exact path/name listed and the
reference resolves with no other edit needed. Nothing here is committed yet (this directory holds
only this instruction file); the README's image link is intentionally broken until you add
`hero.gif`.

Capture everything against the live demo URL in README.md (or `npm run dev` + `npm run server:dev`
locally, same UI) — never mock data or a design tool. A judge who reverse-engineers a screenshot
back to the live app should find exactly what they saw in the image.

## 1. `hero.gif` — required, referenced at the top of README.md

- **What**: the 45-second guided tour (click "▶ Play 45-second tour", or load `?tour=1`), screen-recorded start to finish and converted to a looping GIF.
- **Must show**: the vendor graph rendering with concentration highlighted, a click-through to a vendor's blast radius, and the failure-simulation result (expected downtime + $ exposure) appearing.
- **Must NOT show**: any browser chrome/bookmarks bar, any other open tab, or your own GitHub token in a devtools panel if you have one open.
- **Format**: GIF, ≤15s loop is fine if you trim to the highlight reel — doesn't need to be the full 45s. Keep the file under 8MB (GitHub renders large GIFs but they're slow to load in a README).
- **Suggested tool**: `mcp__claude-in-chrome__gif_creator` if you're recording through Claude in Chrome, or any screen recorder + `gifski`/ezgif.com to convert.

## 2. `pr-gate-fail.png` — referenced from README's PR Resilience Gate section (optional but recommended)

- **What**: a screenshot of the real failing PR from [docs/proof/PROOF.md](../proof/PROOF.md) (PR #1, "Add mixpanel for product analytics") — the GitHub PR page showing the `gate` check as ❌ Failing, with the sticky comment visible below it.
- **Must show**: the red/failing check status AND the comment body (new vendor, before/after table, policy violation line) in the same shot — scroll so both are visible, or capture two stacked screenshots if the page is too long.
- **URL**: https://github.com/tannaya7/documenso/pull/1

## 3. `pr-gate-pass.png` — referenced from README's PR Resilience Gate section (optional but recommended)

- **What**: the same, for the passing PR (PR #2, "docs: tighten wording in README intro").
- **Must show**: the green/passing check status and its "Pass — within policy" comment.
- **URL**: https://github.com/tannaya7/documenso/pull/2

## 4. `vendor-graph.png` — referenced from docs/SUBMISSION.md (optional)

- **What**: a static screenshot of the vendor graph view (not the file graph) for `documenso/documenso`, with "Group by substrate" toggled on and the concentration panel visible on the right.
- **Must show**: the colored substrate legend at the bottom and the concentration percentage bar in the side panel — these are the two things that make "shared-fate risk" legible at a glance, which is the whole pitch.

## 5. `simulate-outage.png` — referenced from docs/SUBMISSION.md (optional)

- **What**: the failure-simulation result after clicking **Simulate** on an "AWS regional outage" scenario for `documenso/documenso`.
- **Must show**: the naive-vs-correlated availability comparison and the expected downtime/exposure numbers, not just the vendor list.

## Naming and paths

Keep filenames exactly as listed (lowercase, hyphenated) — README.md and SUBMISSION.md reference
these paths literally, so a renamed file breaks the link silently (GitHub shows a broken-image
icon, not an error). If you add a file NOT listed here, there's no README reference to update, so
it's safe to add freely, but consider adding a line to this file so it stays a complete list.
