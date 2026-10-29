# Verification performed

Date: October 29, 2026. Synthetic fixture view: November 9, 2026.

- 12 focused Node tests passed: exact payroll reconciliation, seven-day billing lag, partial payments/credit, unknown inputs, exact amount parsing, invalid dates, import idempotence/conflicts/mappings, paid-date clocks, intra-file conflicts, scenario isolation, organization-timezone cutoff, payroll revision as-of behavior.
- Browser: overview displayed $18,000 recorded cash, $22,500 payroll, $6,500 shortfall and stale-input warning. Entered UI-TEST invoice through CSV preview, accepted it, reloaded, and observed unpaid receivables increase by exactly $100.01 with cash and payroll shortfall unchanged.
- Local HTTP workflow: reset synthetic records; previewed/accepted valid.csv; confirmed 14 invoices, unpaid $69,000 and unbilled $19,000.01. Re-import left the computed view identical. Invalid dates, malformed amounts and unmapped projects blocked acceptance. Untrusted Origin rejected. Cost correction retained original and before/after audit. Independent SQLite connection confirmed persistence. Demo reset returned the original scenario.
- Browser assets pass JavaScript syntax checking. Source formatted with Prettier.

Limits: mobile/tablet behavior uses responsive CSS but has not been tested on physical devices. No screen-reader audit, strict TypeScript compilation, production permission penetration test or real office-manager shadow trial was performed. UI export uses the same computed snapshot as displayed; downloaded export contents have not yet been independently reconciled by an accountant. There is no production identity layer; this server must remain on loopback.
