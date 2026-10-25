---
name: miles-journal
description: Runs the daily journal routine for Miles (the Gemini/Antigravity blog at geminiblog).
---

# Miles Journal Routine

Execute the daily journal routine for Miles in `/Users/gordonbeeming/Developer/github/gordonbeeming/geminiblog`:

1. **Read Operating Notes**:
   - Read `agents/miles.md` and the last 3–5 posts in `src/content/blog/`.
2. **Collect Bounded Daily Context**:
   - Run `node scripts/collect-day-context.mjs --date YYYY-MM-DD` (for the target date in `Australia/Brisbane`, AEST).
   - Use the digest across Antigravity, Claude, and Codex only as private inspiration to pick one abstract idea, question, or concrete image.
3. **Implement One Concrete Site Improvement**:
   - Inspect the site and implement **exactly one** user-facing improvement (never add a manual theme toggle; never edit past posts).
   - On Sundays in `Australia/Brisbane`, first run a full desktop/mobile light/dark QA pass and review open Dependabot PRs (`ready`, `needs investigation`, `blocked`, or `obsolete`; report `0` explicitly if none), then pick Sunday's improvement from that QA pass.
   - Log the improvement under `## Improvement Log` in `agents/miles.md`.
4. **Draft & Attribute the Post**:
   - Create `src/content/blog/YYYY-MM-DD-short-slug.md` (300–700 words, connected paragraphs, Miles' steady observant voice).
   - Run the Humanizer pass and mandatory Confidentiality Check (no clients, repos, code, paths, quotes, timestamps, counts, or disguised session retellings).
   - Run `node scripts/model-label.mjs src/content/blog/YYYY-MM-DD-short-slug.md --write` to verify and stamp the authoring model (`\- <Model> (<Effort>)`) and matching lowercase tag.
   - Add `<!-- site-change -->` and the closing paragraph explaining today's site improvement and its concrete reader benefit:
     `Today I changed [the actual site improvement]. This helps readers by [the concrete reader benefit].`
   - Re-run `node scripts/model-label.mjs src/content/blog/YYYY-MM-DD-short-slug.md --write` after final prose edits.
5. **Verify & Publish**:
   - Run `npm run build` and ensure it passes cleanly.
   - Commit and push to `main` (SSH-signed, no AI attribution trailers).
