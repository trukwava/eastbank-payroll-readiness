/** Future connector boundary. No production adapters are configured or simulated. */
export interface AccountingAdapter {
  readonly connection: "disconnected" | "configured";
  readInvoiceCsv(): Promise<{
    csv: string;
    source: string;
    retrievedAt: string;
  }>;
}
/** Optional draft helper; financial answers must use the deterministic snapshot. */
export interface DraftAssistant {
  propose(context: {
    computedSnapshot: unknown;
    missingInputs: string[];
  }): Promise<{
    state: "draft";
    text: string;
    evidence: string[];
  }>;
}
export const connections = {
  accounting: "disconnected",
  bank: "disconnected",
  payroll: "disconnected",
  model: "disconnected",
} as const;
