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
