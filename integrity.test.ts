import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, validateState } from "./core.ts";

test("the original synthetic dataset satisfies persistent invariants", () => {
  assert.equal(validateState(seed()).invoices.length, 12);
});

test("cash and payroll require valid UTC timestamps and recorded sources", () => {
  const badCash = seed();
  badCash.cashSnapshots[0].at = "2026-11-05";
  assert.throws(() => validateState(badCash), /UTC timestamp/);
  const missingSource = seed();
  missingSource.weeklyEstimates[0].source = " ";
  assert.throws(() => validateState(missingSource), /source/);
});

test("incorrect invoice dates cannot reach storage", () => {
  const issuedBeforeCompletion = seed();
  issuedBeforeCompletion.invoices[0].invoiceDate = "2026-10-30";
  assert.throws(() => validateState(issuedBeforeCompletion), /Invoice precedes/);
  const dueBeforeIssue = seed();
  dueBeforeIssue.invoices[0].dueDate = "2026-10-30";
  assert.throws(() => validateState(dueBeforeIssue), /Due date precedes/);
});

test("payments require issued invoice, date and remaining balance", () => {
  const early = seed();
  early.invoicePayments[0].date = "2026-10-01";
  assert.throws(() => validateState(early), /Payment precedes invoice/);
  const overpaid = seed();
  overpaid.invoicePayments[0].amount = 900000;
  assert.throws(() => validateState(overpaid), /overpaid/);
  const unbilled = seed();
  unbilled.invoicePayments[0].invoiceId = "inv11";
  assert.throws(() => validateState(unbilled), /issued invoice/);
});

test("credit notes cannot exceed face value or predate invoice issue", () => {
  const tooLarge = seed();
  tooLarge.invoices[3].credit = 9999999;
  assert.throws(() => validateState(tooLarge), /Credit exceeds/);
  const creditBeforeInvoice = seed();
  creditBeforeInvoice.invoices[3].creditDate = "2026-10-01";
  assert.throws(() => validateState(creditBeforeInvoice), /Credit precedes/);
});

test("cost corrections preserve job, entry kind and temporal ordering", () => {
  const differentJob = seed();
  differentJob.costActuals.push({
    id: "correction", jobId: "j2", category: "Labor",
    kind: "actual", amount: 600000, date: "2026-11-07",
    source: "Correction", replaces: "a0",
  });
  assert.throws(() => validateState(differentJob), /correction chain/);
  const earlierDate = seed();
  earlierDate.costActuals.push({
    id: "correction", jobId: "j1", category: "Labor",
    kind: "actual", amount: 600000, date: "2026-11-05",
    source: "Correction", replaces: "a0",
  });
  assert.throws(() => validateState(earlierDate), /correction chain/);
});

test("a legitimate append-only correction remains valid", () => {
  const s = seed();
  s.costActuals.push({
    id: "correct-1", jobId: "j1", category: "Labor",
    kind: "actual", amount: 605000, date: "2026-11-08",
    source: "Reconciled receipt", replaces: "a0",
  });
  assert.doesNotThrow(() => validateState(s));
});

test("commitment flags and organization category configuration are validated", () => {
  const invalidFlag = seed();
  invalidFlag.commitments[0].included = "true";
  assert.throws(() => validateState(invalidFlag), /included flag/);
  const categories = seed();
  categories.organization.categories = ["Labor", "Labor", "Materials", "Other", "Equipment"];
  assert.throws(() => validateState(categories), /distinct categories/);
});

test("foreign project identifiers and duplicate external keys are rejected", () => {
  const missing = seed();
  missing.invoices[0].jobId = "unmapped";
  assert.throws(() => validateState(missing), /Unknown invoice project/);
  const duplicate = seed();
  duplicate.invoices[1].externalKey = duplicate.invoices[0].externalKey;
  assert.throws(() => validateState(duplicate), /Duplicate external key/);
});

test("backups with cyclic cost corrections cannot pass financial state validation", () => {
  const s = seed();
  s.costActuals.push({
    id: "cycle-one", jobId: "j1", kind: "actual", category: "Labor",
    amount: 600000, date: "2026-11-06", source: "Invalid correction",
    replaces: "cycle-two",
  });
  s.costActuals.push({
    id: "cycle-two", jobId: "j1", kind: "actual", category: "Labor",
    amount: 600000, date: "2026-11-06", source: "Invalid correction",
    replaces: "cycle-one",
  });
  assert.throws(() => validateState(s), /Cyclic cost correction chain/);
});
