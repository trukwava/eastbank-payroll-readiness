# Friday payroll reconciliation

## What the operator sees

The **Weekly workspace → Friday payroll reconciliation** section shows each completed payroll Friday with:
- The most recent Monday payroll estimate **known by the selected as-of date**.
- The sum of active Labor actual-cost records whose **original record is dated on that payroll Friday**, or **Unknown** if no Labor actuals were entered.
- **Variance = recorded Labor actuals − latest known estimate**, in exact integer USD cents. Positive is over estimate, negative is under estimate.
- Job coverage and the sources/amounts supporting that figure.

The screen does not infer that Labor records are complete or constitute a paid payroll register. Coverage (e.g., 3 of 3 current projects) means only that at least one Labor actual is recorded for each of those jobs. The denominator is the **current** project count: projects carry no creation or close date, so the app cannot tell which existed on a past Friday. Creating a project later changes an earlier Friday from "3 of 3" to "3 of 4 current projects"; the screen and the Markdown export both say "current projects" for this reason. No bank payment or payroll execution is performed.

## Correction lineage

Each cost correction is an append-only record with a `replaces` parent ID and its own `date`, labelled **Visible from** in the cost form. For reconciliation:
1. A correction always counts toward the payroll Friday of the **original** record in its chain (the first record, with no `replaces`), whatever the correction's own date. A correction dated on another payroll Friday still counts toward the original Friday.
2. The correction's own date controls only the as-of date from which it is visible. It must be on or after the original record's date.
3. Cost records have no entry timestamp. A correction saved on November 12 but dated November 7 changes the November 7 view and every later view; the November 6 view still shows the original.
4. At each as-of date, the latest visible, unreplaced record supplies the current category, source and amount. Superseded values are never double-counted.
5. A correction can change a cost's category (for example, Labor to Materials); the latest visible category determines whether it contributes to Labor actuals.
6. A correction cannot move a cost to a different payroll Friday, and the app has no way to reassign or delete a recorded cost.
7. Cyclic or missing-parent correction chains are rejected by state validation before persistence.

## Synthetic acceptance checks

- On 2026-11-09, the 2026-11-06 estimate is $21,000 and recorded Labor is $21,000: zero variance.
- The 2026-11-13 estimate is $22,500; that Friday's source records contain Materials but **no Labor actuals**, so recorded Labor must display **Unknown**, not $0.
- If a 2026-11-06 Labor entry originally $6,000 is corrected to $6,500 with a 2026-11-08 date, the November 7 as-of view retains $6,000 while November 9 attributes $6,500 to the original November 6 Friday.
- If that correction is instead dated 2026-11-13 (the next payroll Friday), the November 14 view still attributes $6,500 to November 6, and November 13 Labor stays **Unknown**.
- If that correction is dated 2026-11-07, it appears in the November 7 view as soon as it is saved, even though no correction existed when that date passed; the November 6 view keeps $6,000.
- Later revision of a prior payroll estimate cannot rewrite an as-of view before the revision was entered.

Use `npm test` to run the exact regression checks. The browser smoke suite remains separate; all records are synthetic and the app stays on loopback.
