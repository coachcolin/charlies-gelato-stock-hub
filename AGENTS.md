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
