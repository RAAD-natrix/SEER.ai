<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep shared brand presentation in `src/components/seer/BrandIdentity.tsx` and semantic colours in `src/styles.css` so the workbench, sign-in and future views stay consistent.
- Import uploaded brand media through its Lovable Assets pointer; retain real raster copies only for browser and installed-app icons because those need static public files.
- Centralise Word/PDF presentation in `documentBrand.ts` and convert the asset-pointer logo to PNG in the browser so both formats use genuine embedded media.
- Treat interdisciplinary reasoning as conditional, falsifiable lenses and improvement as owned experiments, never as evidence of effectiveness by itself.
- Write AI-run provenance only through an authorised server handler; require matching saved content and version for reviews, so client edits cannot forge review evidence.
- Save deliverable edits through the locking version RPC so content, history, review invalidation and audit remain one transaction.
- Recompute approval blockers from saved case records in the database trigger; reject unresolved material findings rather than trusting browser readiness or informal waivers.
- Govern reusable learning in the database (method_rules trigger + insert-only learning_reviews): activation needs a current-version challenge and bounded validation, cross-project use needs a transfer review and only the frozen six-field payload is retrieved, edits invalidate reviews, and a recorded contradiction withdraws the method — so browser code cannot promote unreviewed learning.
- Express readiness to users as a verdict plus named checks and blockers (`ReadinessWords`); the numeric index is an internal ordering aid only, because a score implies false precision.
- Record a per-source privacy choice (`sources.processing_consent`, local-only by default) and refuse local-only sources inside the AI server handler, so the browser cannot leak a file the owner kept local.
- Keep the readability floor in theme tokens and shared controls (13px secondary, 15px body, 44px targets, A4 print rules in `styles.css`) rather than per-component overrides.

- Database writes from the browser go through `must()` (src/lib/seer/must.ts); a failed write throws SeerWriteError, which the root route toasts — so no success message follows a failed save.
- Search logic lives in `src/lib/seer/search.ts` with an injected client and reports failed/truncated areas — so it is unit-testable and never shows "no matches" on a backend error.
