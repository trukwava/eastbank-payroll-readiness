import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, snapshot, money, date, preview } from "./core.ts";
test("exact payroll reconciliation; expected invoice excluded", () => {
  const s = seed(),
    v = snapshot(s, "2026-11-09");
  assert.equal(v.headroom, -650000);
  assert.equal(v.cash.amount, 1800000);
  assert.equal(v.stale, true);
  assert.equal(snapshot(s, "2026-11-09", true).headroom, -650000);
});
test("billing clock counts seven calendar days", () =>
  assert.equal(snapshot(seed(), "2026-11-09").invoices[0].billingLag, 7));
test("partial payments and credit reconcile exactly", () => {
  const v = snapshot(seed(), "2026-11-09");
  assert.equal(v.invoices[1].remaining, 250000);
  assert.equal(v.invoices[2].remaining, 250000);
  assert.equal(v.invoices[3].remaining, 400000);
});
test("unknown cash and payroll stay unknown", () => {
  assert.equal(snapshot(seed(), "2026-10-01").headroom, null);
  assert.equal(snapshot(seed(), "2026-12-01").payroll, null);
});
test("money parsing is exact and rejects malformed values", () => {
  assert.equal(money("10.01"), 1001);
  for (const x of ["-1", "1e3", "1.001", "NaN", "$10"])
    assert.throws(() => money(x));
});
test("invalid date rejected", () => assert.throws(() => date("2026-02-30")));
const header =
  "external_key,project,completion_date,invoice_date,due_date,amount,credit,payment,payment_date\n";
test("import duplicate, invalid date, renamed project and conflict", () => {
  const s = seed();
  let r = preview(
    s,
    header +
      "NEW,Riverside Apartments,2026-11-01,2026-11-08,,100.01,0,0,\nNEW,Riverside Apartments,2026-11-01,2026-11-08,,100.01,0,0,",
  );
  assert.deepEqual(
    r.map((x) => x.status),
    ["Ready", "Duplicate"],
  );
  s.invoices.push(r[0].normalized);
  assert.equal(
    preview(
      s,
      header + "NEW,Riverside Apartments,2026-11-01,2026-11-08,,100.01,0,0,",
    )[0].status,
    "Duplicate",
  );
  assert.equal(
    preview(
      s,
      header + "NEW,Riverside Apartments,2026-11-01,2026-11-08,,999,0,0,",
    )[0].status,
    "Conflict",
  );
  assert.equal(
    preview(s, header + "X,Renamed,2026-02-30,,,10,0,0,", { Renamed: "j1" })[0]
      .status,
    "Invalid",
  );
  assert.equal(
    preview(s, header + "X,Renamed,2026-11-01,,,10,0,0,")[0].status,
    "Invalid",
  );
  assert.equal(
    preview(s, header + "X,Renamed,2026-11-01,,,10,0,0,", { Renamed: "j1" })[0]
      .status,
    "Ready",
  );
});
test("paid invoices use payment date and historical view excludes future payment", () => {
  const s = seed();
  s.invoicePayments.push({
    id: "full",
    invoiceId: "inv1",
    amount: 1200000,
    date: "2026-11-12",
  });
  assert.equal(snapshot(s, "2026-11-13").invoices[0].clock, 4);
  assert.equal(snapshot(s, "2026-11-09").invoices[0].remaining, 1200000);
});
test("conflicting duplicate rows in one file stay outside acceptance", () => {
  const r = preview(
    seed(),
    header +
      "X,Riverside Apartments,2026-11-01,,,10,0,0,\nX,Riverside Apartments,2026-11-01,,,20,0,0,",
  );
  assert.equal(r[1].status, "Conflict");
});
test("explicit receipt scenario never changes recorded cash", () => {
  const s = seed();
  s.invoices[0].expectedDate = "2026-11-12";
  assert.equal(snapshot(s, "2026-11-09").headroom, -650000);
  const v = snapshot(s, "2026-11-09", true);
  assert.equal(v.headroom, 550000);
  assert.equal(v.cash.amount, 1800000);
});
test("cash as-of uses organization timezone", () => {
  const s = seed();
  s.cashSnapshots = [
    {
      id: "edge",
      amount: 100,
      at: "2026-11-10T02:00:00Z",
      source: "Time boundary",
    },
  ];
  assert.equal(snapshot(s, "2026-11-09").cash.amount, 100);
});
test("revised payroll estimate preserves prior as-of value", () => {
  const s = seed();
  s.weeklyEstimates.push({
    id: "revised",
    payrollDate: "2026-11-13",
    payroll: 2300000,
    enteredAt: "2026-11-10T14:00:00Z",
    source: "Revision",
  });
  assert.equal(snapshot(s, "2026-11-09").payroll.payroll, 2250000);
  assert.equal(snapshot(s, "2026-11-10").payroll.payroll, 2300000);
});

test("a separate receipt what-if cannot include work that has never been invoiced", () => {
  const s = seed();
  const unbilled = s.invoices[10];
  assert.equal(unbilled.invoiceDate, null);
  unbilled.expectedDate = "2026-11-12";
  assert.equal(snapshot(s, "2026-11-09").headroom, -650000);
  const ignored = snapshot(s, "2026-11-09", true);
  assert.equal(ignored.headroom, -650000);
  assert.equal(ignored.receipt, 0);
  assert.equal(ignored.unbilled > 0, true);
  unbilled.invoiceDate = "2026-11-08";
  unbilled.dueDate = "2026-11-23";
  const scenario = snapshot(s, "2026-11-09", true);
  assert.equal(scenario.receipt, unbilled.amount);
  assert.equal(scenario.headroom, -650000 + unbilled.amount);
  assert.equal(scenario.cash.amount, 1800000);
});
