# SEER 7.2 — adopt the best of the parallel v7.1 prototype

## How the two compare
- **Strategic Insight Studio (parallel v7.1)** is a look-and-feel reference only: nothing saves, no AI runs, no rules are enforced. It follows the brief's interface rules better (readable 15px text, 44px buttons, wording-based readiness, privacy choice at upload, A4 print, automated accessibility tests — 102 states, 0 failures).
- **SEERai (this app)** is the working product: real AI stages, saved versions, database-enforced approval and governed learning, branded Word/PDF, MCP. It falls short of the brief on interface rules: 127 places with text under 12px, 73 buttons smaller than 32px, a numeric readiness score, no privacy choice per upload, no accessibility tests.

Net: SEERai is far ahead on substance; the prototype is ahead on usability and privacy wording. This plan brings those strengths into SEERai without losing any safeguard.

## What will change
1. **Readiness in words, not a number.** Replace the percentage with named gaps ("No credible alternatives", "Red Team material finding open") plus your sign-off. Database approval blockers stay exactly as they are.
2. **Readable and touch-friendly.** Body text at least 15px (secondary labels at least 13px), all buttons and icon actions at least 44px, visible focus outlines, skip link, dialogs return focus. Gold DNA branding kept.
3. **Privacy choice per upload.** Each source is marked "Local only" (default) or "Allowed for AI processing". The server refuses to send local-only sources to the AI, and the choice is recorded in the audit trail.
4. **A4 print and long-brief safety.** Print styles for deliverables (A4, 12mm margins, at least 9pt, grayscale-safe, tables wrap). Word/PDF re-tested with a very long brief.
5. **Automated accessibility gate.** Port the prototype's Playwright + axe check, run it on signed-in pages at phone, tablet and desktop widths, and fix every failure.
6. **Version 7.2.0**, full automated check, and a re-run of the Enrich exports (record stays FINAL and unchanged).

## Not changing
- Stays a hosted private app (your earlier choice), installable on desktop. Local Python/SQLite is not targeted.
- No claim of "best possible technology": the release report will state only what was tested.

## Technical details
- `readiness.ts`: return labelled blockers/gaps; remove weighted score from UI; keep `saved_output_readiness` trigger.
- Migration: add `sources.processing_consent text default 'LOCAL_ONLY'` with check constraint; server stage handlers filter `extracted_text` to `ALLOWED_AI` sources; audit event on change.
- Global token/size pass in `styles.css` and shared `Button` sizes; replace `text-[10px]/[11px]/text-xs` in seer components.
- `@media print` rules in `styles.css`; `tests/a11y/a11y_check.py` adapted with injected session.
