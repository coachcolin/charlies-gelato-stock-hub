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
- Per-freezer stock lives in `freezer_stock` (flavour × freezer, trays + tubs); `apply_stock_movements` updates freezer rows and flavour totals (transfers change only freezer rows). Stock takes collect recoverable device-local counts for every freezer, then `overall_stock_take` atomically replaces freezer counts and overall totals, verifies reviewed totals have not changed, and logs only overall differences. Why: freezer attribution is approximate and only combined stock discrepancies should affect review and history.
- Voice capture and checkpoints use complete PCM WAV files via `voice-audio`; long takes are transcribed sequentially in complete segments, and failed/interrupted audio remains saved until explicitly applied or discarded. Why: fragmented mobile recordings can be rejected as corrupt and must not lose staff counts.
- Production creation, item edits, completion and closure use transactional database RPCs; completion locks the report/item and is idempotent. Why: retries or concurrent staff must never double-add stock or leave partial plans.
- Unstarted production selections recover from device storage; started reports and edits are shared database records read with their nested items. Why: leaving the page must preserve progress without mixing partial reads.
- Soft freezer collections use shared order/item records and transactional start/collect/untick RPCs; collection locks the order and is idempotent, with no stock deduction at creation. Ticking a line deducts its stock, unticking restores it (and reopens a completed order unless another active collection exists). Why: staff can correct mistakes mid-collection, reopen unfinished collections, and retries must not deduct stock twice.
- Single-freezer stock takes (`single_freezer_stock_take`) change only the typed freezer counts and shift overall totals by the difference. Why: staff sometimes count one freezer or one unit without touching the rest.
