import { snapshot, validateState, type RecordSet } from "./core.ts";

export const BACKUP_FORMAT = "eastbank-demo-backup";
export const BACKUP_VERSION = 1;

export function makeBackup(state: RecordSet, exportedAt: string) {
  validateState(state);
  if (!Number.isFinite(Date.parse(exportedAt))) throw Error("Invalid export timestamp");
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, state };
}

export function inspectBackup(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw Error("Backup must be a JSON object");
  const record = payload as any;
  let state = record;
  if ("format" in record || "version" in record || "state" in record) {
    if (record.format !== BACKUP_FORMAT || record.version !== BACKUP_VERSION)
      throw Error("Unsupported Eastbank backup format or version");
    state = record.state;
  }
  if (!state || typeof state !== "object" || Array.isArray(state))
    throw Error("Backup state must be a JSON object");
  validateState(state as RecordSet);
  const view = snapshot(state as RecordSet, "2026-11-09");
  return {
    state: state as RecordSet,
    summary: {
      organization: state.organization.name,
      currency: state.organization.currency,
      jobs: state.jobs.length,
      invoices: state.invoices.length,
      payments: state.invoicePayments.length,
      cashSnapshots: state.cashSnapshots.length,
      weeklyEstimates: state.weeklyEstimates.length,
      changeEvents: state.auditEvents.length,
      exampleAsOf: "2026-11-09",
      exampleHeadroom: view.headroom,
    },
  };
}
