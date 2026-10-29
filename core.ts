export type RecordSet = {
  organization: any;
  jobs: any[];
  budgetVersions: any[];
  changeOrders: any[];
  weeklyEstimates: any[];
  costActuals: any[];
  cashSnapshots: any[];
  invoices: any[];
  invoicePayments: any[];
  commitments: any[];
  importBatches: any[];
  mappings: any[];
  auditEvents: any[];
};
export function date(v: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) !== v
  )
    throw Error("Use a valid YYYY-MM-DD date");
  return v;
}
export function money(v: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(v)))
    throw Error(
      "Amount must be positive dollars, with at most two decimal places",
    );
  const [a, b = ""] = String(v).split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 1e12)
    throw Error("Amount exceeds supported range");
  return n;
}
export function localDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
export const days = (a: string, b: string) =>
  Math.floor(
    (Date.parse(b + "T12:00Z") - Date.parse(a + "T12:00Z")) / 86400000,
  );
export function snapshot(s: RecordSet, asof: string, scenario = false) {
  date(asof);
  const cash = s.cashSnapshots
    .filter((x) => localDate(x.at, s.organization.timezone) <= asof)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const payroll = s.weeklyEstimates
    .filter(
      (x) =>
        x.payrollDate >= asof &&
        localDate(x.enteredAt, s.organization.timezone) <= asof,
    )
    .sort(
      (a, b) =>
        a.payrollDate.localeCompare(b.payrollDate) ||
        b.enteredAt.localeCompare(a.enteredAt),
    )[0];
  const commitments = s.commitments.filter(
    (x) =>
      x.date >= asof && payroll && x.date <= payroll.payrollDate && x.included,
  );
  const invoices = s.invoices
    .filter(
      (x) =>
        x.completionDate <= asof || (x.invoiceDate && x.invoiceDate <= asof),
    )
    .map((x) => {
      const payments = s.invoicePayments
        .filter((p) => p.invoiceId === x.id && p.date <= asof)
        .sort((a, b) => a.date.localeCompare(b.date));
      const paid = payments.reduce((a, p) => a + p.amount, 0);
      const credit = x.creditDate && x.creditDate <= asof ? x.credit : 0;
      const issued = x.invoiceDate && x.invoiceDate <= asof;
      const remaining = Math.max(0, x.amount - credit - paid);
      return {
        ...x,
        issued,
        credit,
        paid,
        remaining,
        status: !issued
          ? "Unbilled"
          : remaining === 0
            ? "Paid"
            : paid
              ? "Part paid"
              : "Unpaid",
        billingLag:
          issued && x.completionDate
            ? days(x.completionDate, x.invoiceDate)
            : null,
        clock: issued
          ? days(
              x.invoiceDate,
              remaining === 0
                ? [payments.at(-1)?.date, x.creditDate]
                    .filter(Boolean)
                    .sort()
                    .at(-1)
                : asof,
            )
          : null,
      };
    });
  const outgoing = commitments.reduce((a, x) => a + x.amount, 0);
  const receipt = scenario
    ? invoices
        .filter(
          (x) =>
            x.expectedDate &&
            x.expectedDate >= asof &&
            payroll &&
            x.expectedDate <= payroll.payrollDate,
        )
        .reduce((a, x) => a + x.remaining, 0)
    : 0;
  return {
    asof,
    cash: cash || null,
    stale: !cash || days(localDate(cash.at, s.organization.timezone), asof) > 3,
    payroll: payroll || null,
    commitments,
    outgoing,
    invoices,
    receipt,
    headroom:
      cash && payroll
        ? cash.amount - payroll.payroll - outgoing + receipt
        : null,
    unpaid: invoices
      .filter((x) => x.issued)
      .reduce((a, x) => a + x.remaining, 0),
    unbilled: invoices
      .filter((x) => !x.issued)
      .reduce((a, x) => a + x.remaining, 0),
  };
}
export function seed(): RecordSet {
  const jobs = [
    { id: "j1", name: "Riverside Apartments", budget: 12000000 },
    { id: "j2", name: "Oak Street School", budget: 8500000 },
    { id: "j3", name: "Harbor Medical Center", budget: 16000000 },
  ];
  return {
    organization: {
      id: "demo",
      name: "Eastbank Painting",
      currency: "USD",
      timezone: "America/New_York",
      categories: [
        "Labor",
        "Materials",
        "Equipment",
        "Subcontractors",
        "Other",
      ],
    },
    jobs,
    budgetVersions: jobs.map((x) => ({
      id: x.id + "-v1",
      jobId: x.id,
      amount: x.budget,
      date: "2026-10-01",
    })),
    changeOrders: [
      {
        id: "co1",
        jobId: "j1",
        amount: 500000,
        date: "2026-11-01",
        status: "approved",
      },
    ],
    weeklyEstimates: [
      {
        id: "w1",
        payrollDate: "2026-11-06",
        payroll: 2100000,
        enteredAt: "2026-11-02T14:00:00Z",
        source: "Monday office estimate",
      },
      {
        id: "w2",
        payrollDate: "2026-11-13",
        payroll: 2250000,
        enteredAt: "2026-11-09T14:00:00Z",
        source: "Monday office estimate",
      },
    ],
    costActuals: jobs.flatMap((j, i) => [
      {
        id: "estimate1-" + i,
        jobId: j.id,
        category: "Labor",
        amount: 650000 + i * 100000,
        date: "2026-11-02",
        source: "Monday job plan",
        kind: "estimate",
      },
      {
        id: "estimate2-" + i,
        jobId: j.id,
        category: "Labor",
        amount: 700000 + i * 50000,
        date: "2026-11-09",
        source: "Monday job plan",
        kind: "estimate",
      },
      {
        id: "a" + i,
        jobId: j.id,
        category: "Labor",
        amount: 600000 + i * 100000,
        date: "2026-11-06",
        source: "Friday payroll register",
        kind: "actual",
      },
      {
        id: "b" + i,
        jobId: j.id,
        category: "Materials",
        amount: 150000 + i * 10000,
        date: "2026-11-13",
        source: "Supplier receipt",
        kind: "actual",
      },
    ]),
    cashSnapshots: [
      {
        id: "c1",
        amount: 1800000,
        at: "2026-11-05T21:00:00Z",
        source: "Manual balance from accounting",
      },
    ],
    invoices: Array.from({ length: 12 }, (_, i) => ({
      id: "inv" + (i + 1),
      externalKey: "EB-" + (1001 + i),
      jobId: jobs[i % 3].id,
      completionDate: i === 0 ? "2026-11-01" : "2026-10-20",
      invoiceDate: i > 9 ? null : i === 0 ? "2026-11-08" : "2026-10-23",
      dueDate: i > 9 ? null : "2026-11-23",
      amount: i === 0 ? 1200000 : 300000 + i * 50000,
      credit: i === 3 ? 50000 : 0,
      creditDate: i === 3 ? "2026-11-04" : null,
      expectedDate: i === 0 ? "2026-11-16" : null,
      source: "Synthetic invoice register",
    })),
    invoicePayments: [
      { id: "p1", invoiceId: "inv2", amount: 100000, date: "2026-11-03" },
      { id: "p2", invoiceId: "inv3", amount: 150000, date: "2026-11-06" },
    ],
    commitments: [
      {
        id: "cm1",
        label: "Equipment rental",
        amount: 125000,
        date: "2026-11-12",
        included: true,
      },
      {
        id: "cm2",
        label: "Supplier payment",
        amount: 75000,
        date: "2026-11-13",
        included: true,
      },
    ],
    importBatches: [],
    mappings: [],
    auditEvents: [],
  };
}
export function csvParse(text: string) {
  if (text.length > 1000000) throw Error("CSV limit is 1 MB");
  const rows: string[][] = [];
  let row: string[] = [],
    v = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') {
        v += '"';
        i++;
      } else q = !q;
    } else if (!q && (c === "," || c === "\n")) {
      row.push(v.replace(/\r$/, ""));
      v = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else v += c;
  }
  if (q) throw Error("Unclosed CSV quote");
  if (v || row.length) {
    row.push(v);
    rows.push(row);
  }
  return rows.filter((r) => r.some(Boolean));
}
export function preview(s: RecordSet, text: string, mapping: any = {}) {
  const rows = csvParse(text),
    header = rows.shift();
  const columns = [
    "external_key",
    "project",
    "completion_date",
    "invoice_date",
    "due_date",
    "amount",
    "credit",
    "payment",
    "payment_date",
  ];
  if (JSON.stringify(header) !== JSON.stringify(columns))
    throw Error("CSV header must match the documented format exactly");
  const seen = new Map();
  return rows.map((r, index) => {
    try {
      if (r.length !== 9) throw Error("Expected 9 columns");
      const [
        key,
        project,
        completion,
        issued,
        due,
        amount,
        credit,
        payment,
        paymentDate,
      ] = r;
      if (!key.trim()) throw Error("Missing external key");
      const job = s.jobs.find(
        (j) => j.name === project || j.id === mapping[project],
      );
      if (!job) throw Error("Unresolved project: " + project);
      date(completion);
      if (issued) date(issued);
      if (due) date(due);
      if (due && issued && due < issued)
        throw Error("Due date precedes invoice");
      if (issued && issued < completion)
        throw Error("Invoice precedes completion");
      const a = money(amount),
        c = money(credit || "0"),
        p = money(payment || "0");
      if (c && !issued) throw Error("An invoice date is required for a credit");
      if (c + p > a) throw Error("Credits and payments exceed invoice amount");
      if (p && !issued) throw Error("Cannot pay unbilled work");
      if (paymentDate && issued && paymentDate < issued)
        throw Error("Payment precedes invoice");
      if (p && !paymentDate) throw Error("Payment date required");
      if (paymentDate) date(paymentDate);
      const normalized = {
        id: "import-" + key,
        externalKey: key,
        jobId: job.id,
        completionDate: completion,
        invoiceDate: issued || null,
        dueDate: due || null,
        amount: a,
        credit: c,
        creditDate: c ? issued : null,
        expectedDate: null,
        source: "CSV import",
      };
      const old = s.invoices.find((x) => x.externalKey === key);
      let status = "Ready";
      if (seen.has(key))
        status = seen.get(key) === JSON.stringify(r) ? "Duplicate" : "Conflict";
      else if (old) {
        const same = [
          "jobId",
          "completionDate",
          "invoiceDate",
          "dueDate",
          "amount",
          "credit",
        ].every((k) => old[k] === normalized[k]);
        const oldPaid = s.invoicePayments
          .filter((x) => x.invoiceId === old.id)
          .reduce((a, x) => a + x.amount, 0);
        const oldPaymentDate =
          s.invoicePayments
            .filter((x) => x.invoiceId === old.id)
            .map((x) => x.date)
            .sort()
            .at(-1) || "";
        status =
          same && oldPaid === p && (!p || oldPaymentDate === paymentDate)
            ? "Duplicate"
            : "Conflict";
      }
      seen.set(key, JSON.stringify(r));
      return {
        row: index + 2,
        status,
        normalized,
        payment: p,
        paymentDate,
        original: r,
      };
    } catch (e) {
      return {
        row: index + 2,
        status: "Invalid",
        error: (e as Error).message,
        original: r,
      };
    }
  });
}

export function validateState(s: RecordSet) {
  if (s.organization.id !== "demo" || s.organization.currency !== "USD")
    throw Error("Only demo USD organization supported");
  new Intl.DateTimeFormat("en", { timeZone: s.organization.timezone });
  const collections = [
    "jobs",
    "budgetVersions",
    "changeOrders",
    "weeklyEstimates",
    "costActuals",
    "cashSnapshots",
    "invoices",
    "invoicePayments",
    "commitments",
    "importBatches",
    "mappings",
    "auditEvents",
  ];
  for (const name of collections) {
    const ids = new Set();
    for (const x of s[name]) {
      if (!x.id || ids.has(x.id)) throw Error("Missing or duplicate record ID");
      ids.add(x.id);
      for (const key of ["amount", "credit", "payroll", "budget"])
        if (
          x[key] != null &&
          (!Number.isSafeInteger(x[key]) || x[key] < 0 || x[key] > 1e12)
        )
          throw Error("Invalid minor-unit money");
    }
  }
  const keys = new Set();
  for (const i of s.invoices) {
    if (keys.has(i.externalKey)) throw Error("Duplicate external key");
    keys.add(i.externalKey);
    if (!s.jobs.some((j) => j.id === i.jobId))
      throw Error("Unknown invoice project");
    if (
      i.credit +
        s.invoicePayments
          .filter((p) => p.invoiceId === i.id)
          .reduce((a, p) => a + p.amount, 0) >
      i.amount
    )
      throw Error("Invoice is overpaid");
  }
  for (const p of s.invoicePayments)
    if (!s.invoices.some((i) => i.id === p.invoiceId))
      throw Error("Unknown payment invoice");
  for (const c of s.costActuals)
    if (!s.jobs.some((j) => j.id === c.jobId))
      throw Error("Unknown cost project");
  return s;
}
