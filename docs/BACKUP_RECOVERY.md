# Safe local demo backups and recovery

Eastbank Painting is a **synthetic, single-organization, local-only demo**. The Settings screen can export a complete JSON backup and restore one after server validation and an explicit confirmation.

## Back up

Go to **Settings & history** → **Download demo backup**. The file contains all synthetic jobs, estimates, invoices, payments, cash snapshots, import batches, mappings, cost corrections, and audit history. It is not encrypted. Keep the file in a location you control and do not upload any real payroll data to a public repository.

Version 1 of the format is:

```json
{
  "format": "eastbank-demo-backup",
  "version": 1,
  "exportedAt": "2026-10-30T16:00:00.000Z",
  "state": { "organization": { "id": "demo", "currency": "USD" } }
}
```

The `state` above is deliberately abbreviated; exported files contain every source record. Older raw-state JSON files downloaded by previous Eastbank versions are accepted for backward compatibility.

## Restore safely

1. **Download a new backup of current state** first. Restoration replaces the entire demo record set.
2. Choose **Select backup JSON** in Settings. Maximum size: 900 KB in the browser (server request limit is approximately 1.1 MB).
3. Select **Validate & preview**. This validates the same persistent-record invariants used by routine writes. The preview shows project, invoice, payment, cash snapshot and audit event counts, and the deterministic headroom for November 9, 2026. No records change in this step.
4. Choose **Restore validated backup**, then confirm the replacement. The server separately requires the literal confirmation `RESTORE DEMO`, revalidates the candidate, appends a restore audit event, and writes the whole aggregate in one SQLite UPDATE.
5. Reopen the dashboard and compare the restored amounts to the backed-up snapshot. The restore audit event is visible under **Change history**.

A rejected/invalid restore does not alter the SQLite aggregate. The UI never trusts the downloaded file's claimed summary, and imported data cannot bypass organization-ID, currency, invoice/payment, date, correction, or money checks.

## Important boundaries

- Restore is **destructive** for edits made after the backup. It is not a merge and does not automatically retain the previous state. Preserve the pre-restore export.
- This single-user demo has no authentication. Keep the Node server bound to `127.0.0.1`; never expose the restore endpoint on a public network.
- Backup format v1 replaces the entire demo aggregate. Future migrations must explicitly handle incompatible format versions rather than guessing.
- Human confirmation is a guard against accidents, **not** access control or authorization.
- The backup files themselves should be treated as potentially sensitive if the application is later extended to real data. No encryption, retention policy enforcement, or compliance certification is supplied.

Run `npm test` for pure backup validation tests and HTTP tests that preview, reject, restore, audit and reopen a disposable test database without touching the operator's SQLite file.
