# Overall stock take
# Soft freezer collection
- [ ] Preserve initial ordering and add a recoverable collection checklist.
- [ ] Deduct each collected line atomically, once only.
- [ ] Verify creation, collection, reopening and final completion.

# Overall stock take
- [x] Collect all freezer counts before a single overall review.
- [x] Save combined stock take atomically and show total variance.
- [x] Test combined counts, missing stock checks, and saving. Phone browser verified review and reload recovery; real database saving verified in a rolled-back test without changing stock.

# Production plan reliability
- [x] Reproduce disappearing drafts and unsaved daily edits.
- [x] Make creation and stock completion atomic; preserve drafts and daily edits.
- [x] Test a real multi-day plan through creation, fresh visits, edits and completion without leaving test stock additions.
- [x] Confirm saved results and report remaining limitations: fresh visits simulated later days; no overnight elapsed-time test. Drafts recover on the same device; started reports are shared.