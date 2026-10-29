# Product brief and state model

Primary user: fictional Eastbank Painting's office manager. Promise: explain whether sourced recorded cash covers the next payroll and explicitly included outgoings, and expose billing versus collection delays.

## P0

Cash snapshot → Monday payroll estimate → deterministic readiness → source inspection → Markdown operating brief. Supporting flows: invoice CSV preview/acceptance, payments, weekly job estimates versus actuals, corrections, project budgets and approved change orders, timezone/category settings, history and local persistence.

Parking lot: real bank/accounting connectors, payroll execution, taxes, multi-currency, multi-user permissions, autonomous messages, model Q&A, production hosting. No model is used in calculations.

## Logical schema

All records belong to the one server-selected demo aggregate; clients cannot choose an organization. IDs are unique within each collection. All money is nonnegative integer USD cents, maximum 1e12 per source amount. Derived balances are never stored.

| Entity         | Input fields and relationships                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Organization   | id=demo, name, USD, IANA timezone, five category names                                                                              |
| Job            | id, name, original budget cents                                                                                                     |
| BudgetVersion  | id, jobId, original amount, date                                                                                                    |
| ChangeOrder    | id, jobId, approved amount, effective date, approved status                                                                         |
| WeeklyEstimate | id, payrollDate, payroll cents, UTC enteredAt, source; revisions append                                                             |
| CostActual     | id, jobId, category, amount, date, source, kind=estimate/actual, optional replaces ID                                               |
| CashSnapshot   | id, amount, UTC instant at, source; append-only                                                                                     |
| Invoice        | id, stable externalKey, jobId, completion/invoice/due dates, original amount, credit and credit date, optional expectedDate, source |
| InvoicePayment | id, invoiceId, amount, date; append-only                                                                                            |
| Commitment     | id, description, date, amount, included=true                                                                                        |
| ImportBatch    | id, timestamp, accepted/duplicate counts, original rows and normalized candidates                                                   |
| Mapping        | id, explicit source-project → job mapping                                                                                           |
| AuditEvent     | id, UTC timestamp, action, before/after values                                                                                      |

SQLite migration 1 stores this small aggregate as validated JSON in one atomic row update. `validateState` enforces money, identity, external-key uniqueness and key references before persistent writes. This is deliberately a local single-process design, not a normalized multi-user accounting database. Migrating to production requires normalized constraints and authenticated organization scoping.

## States and clocks

CSV rows: Ready, Duplicate, Invalid, Conflict. Preview is transient; acceptance revalidates server-side. Any Invalid or Conflict blocks the whole batch; identical duplicates are skipped. Original strings are retained in ImportBatch for reconciliation. Renamed projects require an explicit mapping. Re-importing an unchanged accepted batch is idempotent. Conflicting imported amendments require an operator to repair the source; there is no automatic merge/overwrite.

Invoice status is computed: Unbilled, Unpaid, Part paid, Paid. Remaining = original − effective credits − dated payments. Credits do not rewrite original values. The CSV v1 supports one credit per invoice, effective on invoice date, and a cumulative payment. Subsequent payments use the payment-entry workflow. Multiple dated credit notes and credit amendments need a later schema version.

Calendar days: billing lag = invoice date − completion date; open invoice clock = as-of − invoice date; paid clock = final payment/credit settlement date − invoice date. Missing dates remain unknown. A credit-only settlement currently shares the paid-clock presentation; see limitations.

Cash uses the latest snapshot whose organization-local calendar date is on/before as-of. Cash older than three calendar days is stale. The next known payroll is the earliest payday on/after as-of, using the latest estimate known by as-of. Missing cash or payroll means unknown readiness. Commitments are included only from as-of through that payroll date inclusive. Receipts remain excluded unless the separate what-if toggle includes expected receipts through payroll; they never change recorded cash.

Budget remaining = original budget + dated approved changes − active actual costs. Corrections append a replacement and retain the prior entry/audit; historical views before the correction's effective date retain the original. Job cost estimates are stored separately by kind and do not consume budget. Actual payroll is the sum of active Labor actuals on a payroll date; absence means unknown, not zero. Existing category labels remain in budget breakdowns after settings changes.

As-of is an effective-date view of current known records, not a complete bitemporal accounting close. New jobs and organization settings are not versioned by as-of. Avoid interpreting a historical view as a previously certified report.

## Boundaries and retention

Bind only to loopback. Host and mutation Origin checks, bounded requests/CSVs, server-side parsing/validation, text escaping, CSP, and a fixed server-selected organization protect this local demonstration. There is no production authentication or network deployment support. Do not expose the server publicly or enter real payroll information.

Records persist in data/eastbank.sqlite until reset or deletion. Reset replaces only the demo aggregate. A JSON backup can be downloaded; recovery is manual by a developer from a trusted backup, with validation before insertion. The database and backups are excluded from source control. No raw sensitive payload logging or external requests exist in the app. No compliance certification is claimed.
