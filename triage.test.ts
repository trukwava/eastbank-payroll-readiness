import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, snapshot, preview } from "./core.ts";
import { collectionsDesk } from "./triage.ts";

test("collections action desk groups due dates with inclusive 7-day boundary", () => {
  const s = seed();
  s.invoices[0].dueDate = "2026-11-08";
  s.invoices[1].dueDate = "2026-11-09";
  s.invoices[2].dueDate = "2026-11-16";
  s.invoices[3].dueDate = null;
  s.invoices[4].dueDate = "2026-11-17";
  const d = collectionsDesk(s, "2026-11-09");
  assert.equal(d.summary.overdue.count, 1);
  assert.equal(d.summary.overdue.amount, 1200000);
  assert.equal(d.summary.dueSoon.count, 2);
  assert.equal(d.summary.missingDue.count, 1);
  assert.equal(d.summary.unbilled.count, 2);
  assert.equal(d.items[0].kind, "overdue");
  assert.equal(d.items[0].clockDays, -1);
  assert.equal(d.items.find((x) => x.externalKey === "EB-1003")?.clockDays, 7);
  assert.equal(d.items.find((x) => x.externalKey === "EB-1005")?.kind, "scheduled");
});

test("a completed payment removes invoice from collections queue", () => {
  const s = seed();
  s.invoices[0].dueDate = "2026-11-08";
  assert.equal(collectionsDesk(s, "2026-11-09").summary.overdue.count, 1);
  s.invoicePayments.push({ id: "paid-now", invoiceId: "inv1", amount: 1200000, date: "2026-11-09" });
  const d = collectionsDesk(s, "2026-11-09");
  assert.equal(d.summary.overdue.count, 0);
  assert.equal(d.items.some((x) => x.invoiceId === "inv1"), false);
});

test("collections totals use minor units and never update recorded cash", () => {
  const s = seed();
  const before = snapshot(s, "2026-11-09").headroom;
  const d = collectionsDesk(s, "2026-11-09");
  assert.equal(d.attentionTotal, ["overdue", "unbilled", "dueSoon", "missingDue"].reduce((n, k) => n + d.summary[k].amount, 0));
  assert.equal(snapshot(s, "2026-11-09").headroom, before);
  assert.equal(before, -650000);
});

test("future work is excluded from earlier as-of collections queue", () => {
  assert.equal(collectionsDesk(seed(), "2026-10-01").items.length, 0);
  assert.throws(() => collectionsDesk(seed(), "2026-11-09", -1));
  assert.throws(() => collectionsDesk(seed(), "2026-11-09", 1.5));
});

test("re-import of original CSV stays duplicate after later manual payment", () => {
  const s = seed();
  const header = "external_key,project,completion_date,invoice_date,due_date,amount,credit,payment,payment_date\n";
  const row = "NEW-101,Riverside Apartments,2026-11-01,2026-11-08,,100.01,0,10.00,2026-11-08";
  const first = preview(s, header + row)[0];
  assert.equal(first.status, "Ready");
  s.invoices.push(first.normalized);
  s.invoicePayments.push({ id: "original-101", invoiceId: first.normalized.id, amount: 1000, date: "2026-11-08" });
  s.importBatches.push({ id: "batch-101", rows: [first] });
  s.invoicePayments.push({ id: "later-101", invoiceId: first.normalized.id, amount: 2000, date: "2026-11-09" });
  assert.equal(preview(s, header + row)[0].status, "Duplicate");
  assert.equal(
    preview(s, header + row.replace("100.01", "101.01"))[0].status,
    "Conflict",
  );
});
