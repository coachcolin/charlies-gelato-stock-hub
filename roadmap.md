# Soft freezer collection
- [x] Preserve initial ordering and add a recoverable shared collection checklist.
- [x] Deduct each collected line atomically, once only.
- [x] Verify real creation, collection, retry safety, fresh phone reopening and final completion; restore all test stock and remove test sales.

# Overall stock take
- [x] Collect all freezer counts before a single overall review.
- [x] Save combined stock take atomically and show total variance.
- [x] Test combined counts, missing stock checks, and saving. Phone browser verified review and reload recovery; real database saving verified in a rolled-back test without changing stock.

# Production plan reliability
- [x] Reproduce disappearing drafts and unsaved daily edits.
- [x] Make creation and stock completion atomic; preserve drafts and daily edits.
- [x] Test a real multi-day plan through creation, fresh visits, edits and completion without leaving test stock additions.
- [x] Confirm saved results and report remaining limitations: fresh visits simulated later days; no overnight elapsed-time test. Drafts recover on the same device; started reports are shared.

# Production report daily totals and printing
- [x] Show a large tray total below each day's plan and report.
- [x] Print each day separately with its own heading and daily total; verified the saved five-day report produces five A4 pages and totals on tablet/phone without changing stock.