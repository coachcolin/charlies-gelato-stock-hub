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

- Stock has two units: trays (`flavours.stock_qty`) and tubs (`flavours.tub_qty`); movements/wholesale lines carry `unit`, and `apply_stock_movements` routes by unit. Why: one flavour is stocked in both sizes and each needs its own history.
- Per-freezer stock lives in `freezer_stock` (flavour × freezer, trays + tubs); every movement carries `freezer_id` and `apply_stock_movements` updates both the freezer row and the `flavours` totals (kind `transfer` changes only freezer rows). Stock takes go through `freezer_stock_take`; until every freezer has a first count (`app_settings.freezers_counted`), totals are untouched, then totals are reset to the sum of freezers. Why: staff count each freezer separately and need a safe switch-over from the old single total.
