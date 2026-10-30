# Eastbank · Payroll readiness

A working local demo for a fictional painting subcontractor: see whether recorded cash covers the next payroll, then trace billing delays and collection balances. Synthetic data only. No bank feeds, payroll execution, model calls, paid services or credentials.

## Run

Requires Node.js 24. No dependencies to install.

```sh
npm start
# Open http://localhost:48739
npm test
```

Or run `node server.ts` and `node --test test.ts triage.test.ts integrity.test.ts integration.test.ts backup.test.ts` directly. The server binds to 127.0.0.1. If the port is occupied, stop your own previous Eastbank process before restarting. `.env.example` documents the credential-free configuration. The SQLite database initializes automatically from fixtures; migration 1 is in `schema.sql` and applied by the server.

The app uses TypeScript executed by Node's built-in type stripping, built-in HTTP and SQLite, and a small browser interface. It intentionally has no framework/dependency installation for this single-organization local prototype. Type stripping is not static type checking; a strict compiler setup remains future engineering work.

## Operator guide

1. Open **Payroll readiness**, with demo as-of **2026-11-09**. Recorded cash is **$18,000**, payroll is **$22,500**, commitments are **$2,000**, projected shortfall is **$6,500**. The November 5 cash snapshot is stale.
2. Inspect the payroll bridge and invoices. The $12,000 invoice expected November 16 is outside the November 13 payroll horizon; it never reduces this shortfall. The what-if toggle separately includes expected receipts only when they fall within the selected horizon.
2a. Open **Collections action desk** for an as-of priority queue: overdue, unbilled work, due within seven days, or missing due dates. Filters and amounts are derived from the existing invoice/payment ledger; see [collections rules](docs/COLLECTIONS_DESK.md).
3. Use **Weekly workspace** to add a sourced cash snapshot, payroll estimate, estimates/actuals by project, or a commitment. Timestamps must include timezone offsets. Select a correction target to append a replacement without deleting history.
4. Use **Invoices & collections** to inspect clocks and record partial/full payments. A payment does not automatically update cash. EB-1001 has a seven-calendar-day billing lag.
5. Use **Import invoices** with `samples/valid.csv`. Preview, review, then accept. Re-import it: totals must remain unchanged. Try `duplicates.csv`, `invalid.csv`, and `renamed-project.csv`. Map Riverside Residences to Riverside Apartments to resolve the renamed project.
6. Use **Project budgets** for original/approved budgets, active actual costs and remaining budget. Estimates are shown separately. Create projects or approved change orders here.
7. Export the weekly Markdown brief from the overview; it uses the exact displayed snapshot. Change the as-of date to inspect freshness and historical effective dates.
8. Settings provides timezone/category configuration, change history, **versioned JSON export with validated, confirmed restore**, and demo reset. See [backup and recovery instructions](docs/BACKUP_RECOVERY.md). Records survive page reloads and server restarts in `data/eastbank.sqlite`.

Import header, exactly:

```csv
external_key,project,completion_date,invoice_date,due_date,amount,credit,payment,payment_date
```

See [model and rules](docs/MODEL.md) for signs, states, persistence, security, retention, and limitations. See [pilot proposal](docs/PILOT.md) for discovery, measurements, success and stop criteria.

## Acceptance and verification

`npm test` runs financial, collections, integrity and isolated HTTP integration tests covering the $6,500 shortfall; seven-day billing lag; exact money; partial payments/credit; unknown inputs; invalid dates; duplicate, conflict and mapping handling; payment-date clocks; receipt-scenario isolation; timezone boundaries; and revised estimates. GitHub Actions runs the tests on Node 24. The HTTP integration suite creates its own temporary SQLite database, checks server-origin rejection, re-imports after a later manual payment, restarts the server and verifies persistence without touching the operator's demo data. Optional environment variables `EASTBANK_PORT` and `EASTBANK_DATA_DIR` are documented in `.env.example`.

Seed: three projects, twelve invoices, two partial payments, one credit, two weeks of payroll/job estimates and job actuals, approved change order, two commitments and a stale cash snapshot. `samples/expected.md` records expected import effects. The running application has been reviewed in a browser; see `docs/VERIFICATION.md` for actual results and remaining gaps.

## Status

- [x] Local persistent demo, deterministic calculations and sourced snapshots
- [x] As-of readiness, explicit commitments, missing/stale inputs, separate receipt scenario
- [x] CSV preview, server validation, explicit job mapping, duplicate/conflict handling
- [x] Collections action desk with overdue, unbilled, due-soon and missing-deadline prioritization
- [x] Partial payments, original invoice values and effective credits
- [x] Job budgets/change orders, weekly estimates/actuals, corrections and history
- [x] Operating brief, versioned demo backup, validated restore and synthetic-only reset
- [ ] Production authentication, normalized multi-tenant storage and deployment hardening
- [ ] Multiple dated credit notes, retainage and accounting-system adapters
- [ ] Strict TypeScript checking and comprehensive automated browser/accessibility coverage
- [ ] Real office-manager pilot; no customer validation or time-saving claim


Eastbank Painting and every record are fictional. This is an operating visibility prototype, not accounting advice, production payroll software or a guarantee of future cash.
