# Friday payroll reconciliation

## What the operator sees

The **Weekly workspace → Friday payroll reconciliation** section shows each completed payroll Friday with:
- The most recent Monday payroll estimate **known by the selected as-of date**.
- The sum of active Labor actual-cost records attributable to that payroll Friday, or **Unknown** if no Labor actuals were entered.
- **Variance = recorded Labor actuals − latest known estimate**, in exact integer USD cents. Positive is over estimate, negative is under estimate.
- Job coverage and the sources/amounts supporting that figure.

The screen does not infer that Labor records are complete or constitute a paid payroll register. Coverage (e.g., 3 of 3 projects) means only that at least one Labor actual is recorded for each of those jobs. No bank payment or payroll execution is performed.

## Correction lineage

Each cost correction is an append-only record with a `replaces` parent ID and an effective `date`. For reconciliation:
1. The **first/original** record in its correction chain determines which payroll Friday the cost belongs to.
2. At each as-of date, the latest effective, unreplaced record supplies the current category, source and amount.
3. Corrections dated later than the as-of view are not visible. Superseded values are never double-counted.
4. A correction can change a cost's category (for example, Labor to Materials); the latest active category determines whether it contributes to Labor actuals.
5. Cyclic or missing-parent correction chains are rejected by state validation before persistence.

## Synthetic acceptance checks

- On 2026-11-09, the 2026-11-06 estimate is $21,000 and recorded Labor is $21,000: zero variance.
- The 2026-11-13 estimate is $22,500; that Friday's source records contain Materials but **no Labor actuals**, so recorded Labor must display **Unknown**, not $0.
- If a 2026-11-06 Labor entry originally $6,000 is corrected to $6,500 effective 2026-11-08, the November 7 as-of view retains $6,000 while November 9 attributes $6,500 to the original November 6 Friday.
- Later revision of a prior payroll estimate cannot rewrite an as-of view before the revision was entered.

Use `npm test` to run the exact regression checks. The browser smoke suite remains separate; all records are synthetic and the app stays on loopback.
