# Collections action desk · v1

This screen converts the invoice register into a deterministic, **as-of-date action queue**. It is intended for Eastbank Painting's fictional office manager, not for automated collections or cash forecasting.

## Priority and routing rules

| Priority | Condition | Suggested human review |
| --- | --- | --- |
| Overdue | Issued invoice, remaining balance > 0, due date before as-of | Check payment and contact the general contractor as appropriate |
| Completed, not invoiced | Completed work with no issued invoice as of the selected date | Confirm work and prepare an invoice |
| Due soon | Issued, balance > 0, due in 0–7 elapsed calendar days | Verify expected payment and contractual terms |
| Missing due date | Issued, balance > 0, no supplied due date | Research the invoice's contractual due date |
| Scheduled later | Issued, balance > 0, due date >7 days after as-of | Monitor |

**All five categories are mutually exclusive.** Fully paid invoices are omitted. Counts and amounts come from the existing `snapshot` computation, which applies credits and payments dated on or before the selected as-of date. Values use integer cents, not floating point. Sorting uses priority order; overdue oldest first, upcoming nearest first, then largest balance.

"Due soon" counts today as day zero, a due date exactly seven calendar days away as day seven, and does not include day eight. Negative due-day values indicate elapsed overdue calendar days. The age of unbilled work is calendar days since its completion date. Invoices with unknown dates do **not** get invented deadlines.

The queue does not change recorded cash or payroll headroom. The existing optional expected-receipts scenario is independent and never becomes an accounting balance. No messages are sent, no invoices are issued, and no payment actions occur on this screen.

## CSV identity repair

`preview()` now compares the original import payment against its persisted import-batch baseline (where present), not the running invoice payment total. This allows a genuine re-import of an unchanged CSV *after* an operator separately logs an additional payment. Changing the original CSV amount remains a conflict requiring review. For invoices without a prior imported baseline, the original behavior is retained.

## Verification

Run `npm test` using Node 24. Existing 12 tests and five new tests cover:

- Overdue/due-today/seven-day/due-later classifications
- Unbilled and missing-due-date routing
- Removal from action queue after full payment
- Aggregate amounts and strict isolation from recorded cash
- Historical as-of exclusion and invalid review window
- Re-import after later manual payment

GitHub Actions also checks client JavaScript syntax. The app must remain on `127.0.0.1` in synthetic-only demo mode. It has no production authentication, customer permissions, or accounting-system integrations.

## Further work

Date-only due dates assume the organization's chosen civil calendar; holidays and contract-specific grace periods are not inferred. The UI presently shows review guidance, not operator task assignment, message history, dispute state, retainage, or confirmation of payment arrival. Pilot users must reconcile records against their accounting system before relying on any warnings.
