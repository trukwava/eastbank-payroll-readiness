# Expected checks

Reset demo, as-of 2026-11-09:
- Recorded cash 18,000.00; next payroll 22,500.00; outgoing 2,000.00; shortfall 6,500.00.
- Unpaid invoiced 58,500.00; completed unbilled 16,500.00.
- EB-1001 billing lag 7 elapsed calendar days, unpaid clock 1 day.
- EB-1002 balance 2,500.00; EB-1003 balance 2,500.00; EB-1004 balance 4,000.00 after a 500.00 credit.

Accept valid.csv: 2 invoices added. Unpaid increases by 10,500.00; unbilled increases by 2,500.01. Cash and shortfall unchanged. Accept again: 0 added, 2 duplicates skipped; totals unchanged.

Accept duplicates.csv on reset state: 1 added, 1 duplicate skipped. After valid.csv: both duplicate. invalid.csv: both invalid, batch acceptance blocked. renamed-project.csv: unresolved until explicit mapping to j1; then one 100.01 invoice may be accepted. Conflicting amounts for an existing external key block acceptance.
