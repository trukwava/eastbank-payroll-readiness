import { date, localDate, type RecordSet } from "./core.ts";

/**
 * A cost correction records when the correction became effective. Payroll
 * attribution, however, follows the date of the original cost being corrected.
 * This keeps a corrected Friday payroll amount on that Friday's cycle without
 * leaking later corrections into earlier as-of views.
 */
export function payrollHistory(state: RecordSet, asof: string) {
  date(asof);
  const entries = new Map(state.costActuals.map((entry) => [entry.id, entry]));
  const root = (entry: any) => {
    let current = entry;
    const seen = new Set<string>();
    while (current.replaces) {
      if (seen.has(current.id)) throw Error("Cyclic cost correction chain");
      seen.add(current.id);
      const parent = entries.get(current.replaces);
      if (!parent) throw Error("Missing cost correction parent");
      current = parent;
    }
    return current;
  };
  const effective = state.costActuals.filter((entry) => entry.date <= asof);
  // Detect malformed lineages even when cyclic entries would hide each other as superseded.
  for (const entry of effective) root(entry);
  const superseded = new Set(effective.map((entry) => entry.replaces).filter(Boolean));
  const active = effective.filter((entry) => !superseded.has(entry.id));
  const knownEstimates = state.weeklyEstimates.filter(
    (entry) => entry.payrollDate <= asof &&
      localDate(entry.enteredAt, state.organization.timezone) <= asof,
  );
  const cycles = [...new Set(knownEstimates.map((entry) => entry.payrollDate))]
    .sort((a, b) => b.localeCompare(a));
  return cycles.map((payrollDate) => {
    const estimate = knownEstimates
      .filter((entry) => entry.payrollDate === payrollDate)
      .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))[0];
    const labor = active
      .filter((entry) => entry.kind === "actual" && entry.category === "Labor" &&
        root(entry).date === payrollDate);
    const actual = labor.length
      ? labor.reduce((total, entry) => total + entry.amount, 0)
      : null;
    const variance = actual == null ? null : actual - estimate.payroll;
    return {
      payrollDate,
      estimate: estimate.payroll,
      estimateSource: estimate.source,
      estimateEnteredAt: estimate.enteredAt,
      actual,
      variance,
      recordedJobs: new Set(labor.map((entry) => entry.jobId)).size,
      totalJobs: state.jobs.length,
      sources: labor.map((entry) => ({
        id: entry.id, jobId: entry.jobId, amount: entry.amount,
        source: entry.source, effectiveDate: entry.date,
        originalPayrollDate: root(entry).date,
        corrected: Boolean(entry.replaces),
      })),
      interpretation: actual == null
        ? "No Labor actuals recorded; outcome unknown"
        : "Recorded Labor actuals only; not a certified payroll close",
    };
  });
}
