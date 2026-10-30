import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, snapshot } from "./core.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, inspectBackup, makeBackup } from "./backup.ts";

test("versioned backup preserves the original cash and headroom", () => {
  const original = seed();
  const serialized = JSON.stringify(makeBackup(original, "2026-10-30T16:00:00Z"));
  const result = inspectBackup(JSON.parse(serialized));
  assert.equal(result.summary.jobs, 3);
  assert.equal(result.summary.invoices, 12);
  assert.equal(result.summary.exampleHeadroom, -650000);
  assert.equal(snapshot(result.state, "2026-11-09").cash.amount, 1800000);
});

test("original raw JSON exports remain restorable", () => {
  const restored = inspectBackup(JSON.parse(JSON.stringify(seed())));
  assert.equal(restored.state.organization.id, "demo");
  assert.equal(restored.summary.invoices, 12);
});

test("invalid, absent and unsupported backup envelopes are rejected", () => {
  for (const candidate of [null, [], "", { format: "untrusted", version: 1, state: seed() }, { format: BACKUP_FORMAT, version: 2, state: seed() }, { state: seed() }]) {
    assert.throws(() => inspectBackup(candidate));
  }
  assert.equal(BACKUP_VERSION, 1);
});

test("an external tenant cannot be restored into the local demo", () => {
  const foreign = seed();
  foreign.organization.id = "another-company";
  assert.throws(() => inspectBackup(foreign), /Only demo USD/);
});

test("overpayments and foreign invoice mappings cannot pass restore review", () => {
  const corrupt = seed();
  corrupt.invoicePayments[0].amount = 9999999;
  assert.throws(() => inspectBackup(corrupt), /overpaid/);
  const foreignJob = seed();
  foreignJob.invoices[0].jobId = "unmapped";
  assert.throws(() => inspectBackup(foreignJob), /Unknown invoice project/);
});

test("backup inspection does not mutate the original data or create ledger entries", () => {
  const original = seed();
  const before = JSON.stringify(original);
  const result = inspectBackup(makeBackup(original, "2026-10-30T16:00:00Z"));
  assert.equal(JSON.stringify(original), before);
  assert.equal(result.state.auditEvents.length, 0);
});

test("invalid money and dates fail before a backup is created", () => {
  const invalid = seed();
  invalid.cashSnapshots[0].amount = 0.01;
  assert.throws(() => makeBackup(invalid, "2026-10-30T16:00:00Z"), /Invalid minor-unit money/);
  assert.throws(() => makeBackup(seed(), "not-a-date"), /Invalid export timestamp/);
});
