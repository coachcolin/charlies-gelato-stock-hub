# Production plan reliability
# Overall stock take
- [ ] Collect all freezer counts before a single overall review.
- [ ] Save combined stock take atomically and show total variance.
- [ ] Test combined counts, missing stock checks, and saving.

- [x] Reproduce disappearing drafts and unsaved daily edits.
- [x] Make creation and stock completion atomic; preserve drafts and daily edits.
- [x] Test a real multi-day plan through creation, fresh visits, edits and completion without leaving test stock additions.
- [x] Confirm saved results and report remaining limitations: fresh visits simulated later days; no overnight elapsed-time test. Drafts recover on the same device; started reports are shared.