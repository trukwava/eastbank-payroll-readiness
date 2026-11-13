import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./core.ts";
import { payrollHistory } from "./reconciliation.ts";

test("Friday payroll reconciliation uses original sourced Labor actuals", () => {
  const history = payrollHistory(seed(), "2026-11-09");
  assert.equal(history.length, 1);
  assert.equal(history[0].payrollDate, "2026-11-06");
  assert.equal(history[0].estimate, 2100000);
  assert.equal(history[0].actual, 2100000);
  assert.equal(history[0].variance, 0);
  assert.equal(history[0].recordedJobs, 3);
  assert.equal(history[0].sources.length, 3);
});

test("missing Labor actuals produce unknown, never a fake zero", () => {
  const rows = payrollHistory(seed(), "2026-11-14");
  assert.equal(rows[0].payrollDate, "2026-11-13");
  assert.equal(rows[0].estimate, 2250000);
  assert.equal(rows[0].actual, null);
  assert.equal(rows[0].variance, null);
  assert.match(rows[0].interpretation, /unknown/);
});

test("correction effective after payroll belongs to original Friday, historically scoped", () => {
  const s = seed();
  s.costActuals.push({
    id: "correct-payroll", jobId: "j1", kind: "actual", category: "Labor",
    date: "2026-11-08", amount: 650000, source: "Reconciled register",
    replaces: "a0",
  });
  assert.equal(payrollHistory(s, "2026-11-07")[0].actual, 2100000);
  const revised = payrollHistory(s, "2026-11-09")[0];
  assert.equal(revised.actual, 2150000);
  assert.equal(revised.variance, 50000);
  assert.equal(revised.sources.find((x) => x.jobId === "j1").originalPayrollDate, "2026-11-06");
  assert.equal(revised.sources.find((x) => x.jobId === "j1").effectiveDate, "2026-11-08");
});

test("second correction keeps lineage and does not double count old revisions", () => {
  const s = seed();
  s.costActuals.push({
    id: "c1", jobId: "j1", kind: "actual", category: "Labor",
    amount: 650000, date: "2026-11-08", source: "Correction one", replaces: "a0",
  });
  s.costActuals.push({
    id: "c2", jobId: "j1", kind: "actual", category: "Labor",
    amount: 675000, date: "2026-11-10", source: "Correction two", replaces: "c1",
  });
  assert.equal(payrollHistory(s, "2026-11-09")[0].actual, 2150000);
  assert.equal(payrollHistory(s, "2026-11-10")[0].actual, 2175000);
  assert.equal(payrollHistory(s, "2026-11-10")[0].sources.length, 3);
});

test("a future payroll estimate revision cannot rewrite an earlier as-of comparison", () => {
  const s = seed();
  s.weeklyEstimates.push({
    id: "revision-future", payrollDate: "2026-11-06", payroll: 2300000,
    enteredAt: "2026-11-11T15:00:00Z", source: "Late estimate revision",
  });
  assert.equal(payrollHistory(s, "2026-11-09")[0].estimate, 2100000);
  assert.equal(payrollHistory(s, "2026-11-12")[0].estimate, 2300000);
});

test("correcting Labor classification removes it from payroll sum at the effective date", () => {
  const s = seed();
  s.costActuals.push({
    id: "classified", jobId: "j1", kind: "actual", category: "Materials",
    amount: 600000, date: "2026-11-08", source: "Correct cost category",
    replaces: "a0",
  });
  assert.equal(payrollHistory(s, "2026-11-07")[0].actual, 2100000);
  assert.equal(payrollHistory(s, "2026-11-09")[0].actual, 1500000);
});

test("cycle in a corrupted cost correction chain does not hang reconciliation", () => {
  const s = seed();
  s.costActuals.push({id:"cyc1",jobId:"j1",kind:"actual",category:"Labor",amount:1,date:"2026-11-06",source:"corrupt",replaces:"cyc2"});
  s.costActuals.push({id:"cyc2",jobId:"j1",kind:"actual",category:"Labor",amount:1,date:"2026-11-06",source:"corrupt",replaces:"cyc1"});
  assert.throws(() => payrollHistory(s, "2026-11-09"), /Cyclic cost correction chain/);
});
