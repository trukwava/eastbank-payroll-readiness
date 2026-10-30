import { days, snapshot, type RecordSet } from "./core.ts";

export type QueueKind = "overdue" | "unbilled" | "dueSoon" | "missingDue" | "scheduled";

const order: QueueKind[] = ["overdue", "unbilled", "dueSoon", "missingDue", "scheduled"];

export function collectionsDesk(state: RecordSet, asof: string, dueSoonDays = 7) {
  if (!Number.isSafeInteger(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 365)
    throw Error("Invalid collections window");
  const view = snapshot(state, asof);
  const items = view.invoices
    .filter((invoice) => invoice.remaining > 0)
    .map((invoice) => {
      let kind: QueueKind;
      let clockDays: number | null = null;
      let action: string;
      if (!invoice.issued) {
        kind = "unbilled";
        clockDays = invoice.completionDate ? days(invoice.completionDate, asof) : null;
        action = "Confirm completed work and prepare the invoice";
      } else if (!invoice.dueDate) {
        kind = "missingDue";
        action = "Confirm the contractual payment due date";
      } else {
        clockDays = days(asof, invoice.dueDate);
        if (clockDays < 0) {
          kind = "overdue";
          action = "Review payment status and contact the general contractor";
        } else if (clockDays <= dueSoonDays) {
          kind = "dueSoon";
          action = "Confirm expected payment and follow up before due date";
        } else {
          kind = "scheduled";
          action = "Monitor the scheduled due date";
        }
      }
      return {
        externalKey: invoice.externalKey,
        invoiceId: invoice.id,
        jobId: invoice.jobId,
        status: invoice.status,
        remaining: invoice.remaining,
        completionDate: invoice.completionDate || null,
        invoiceDate: invoice.invoiceDate || null,
        dueDate: invoice.dueDate || null,
        kind,
        clockDays,
        action,
      };
    })
    .sort((a, b) => {
      const category = order.indexOf(a.kind) - order.indexOf(b.kind);
      if (category) return category;
      if (a.kind === "overdue" && a.clockDays !== b.clockDays)
        return (a.clockDays ?? 0) - (b.clockDays ?? 0);
      if (a.kind === "dueSoon" && a.clockDays !== b.clockDays)
        return (a.clockDays ?? 0) - (b.clockDays ?? 0);
      return b.remaining - a.remaining || a.externalKey.localeCompare(b.externalKey);
    });
  const summary = Object.fromEntries(
    order.map((kind) => {
      const selected = items.filter((item) => item.kind === kind);
      return [kind, {
        count: selected.length,
        amount: selected.reduce((sum, item) => sum + item.remaining, 0),
      }];
    }),
  ) as Record<QueueKind, { count: number; amount: number }>;

  return {
    asof,
    dueSoonDays,
    items,
    summary,
    attentionTotal:
      summary.overdue.amount +
      summary.unbilled.amount +
      summary.dueSoon.amount +
      summary.missingDue.amount,
  };
}
