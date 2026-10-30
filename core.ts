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
      const importedBaseline = s.importBatches
        .flatMap((batch) => batch.rows || [])
        .find((row) => row.status === "Ready" && row.normalized?.externalKey === key);
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
          same &&
          (importedBaseline ? importedBaseline.payment === p : oldPaid === p) &&
          (!p || (importedBaseline ? importedBaseline.paymentDate === paymentDate : oldPaymentDate === paymentDate))
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
  if (!s || !s.organization || s.organization.id !== "demo" || s.organization.currency !== "USD")
    throw Error("Only demo USD organization supported");
  new Intl.DateTimeFormat("en", { timeZone: s.organization.timezone });
  const present = (v: any, label: string) => {
    if (typeof v !== "string" || !v.trim() || v.length > 200)
      throw Error("Invalid or missing " + label);
  };
  const positiveCents = (v: any, label: string, allowZero = true) => {
    if (!Number.isSafeInteger(v) || v < (allowZero ? 0 : 1) || v > 1e12)
      throw Error("Invalid minor-unit money: " + label);
  };
  const validDate = (v: any, label: string) => {
    if (typeof v !== "string") throw Error("Missing date: " + label);
    date(v);
  };
  const instant = (v: any, label: string) => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v) ||
        !Number.isFinite(Date.parse(v)))
      throw Error("Invalid UTC timestamp: " + label);
    validDate(v.slice(0, 10), label);
  };
  if (!Array.isArray(s.organization.categories) || s.organization.categories.length !== 5 ||
    new Set(s.organization.categories).size !== 5)
    throw Error("Exactly five distinct categories required");
  for (const category of s.organization.categories) present(category, "category");

  const collections = [
    "jobs", "budgetVersions", "changeOrders", "weeklyEstimates",
    "costActuals", "cashSnapshots", "invoices", "invoicePayments",
    "commitments", "importBatches", "mappings", "auditEvents",
  ] as const;
  for (const name of collections) {
    if (!Array.isArray(s[name])) throw Error("Invalid collection: " + name);
    const ids = new Set<string>();
    for (const x of s[name]) {
      if (!x || typeof x !== "object") throw Error("Invalid record in " + name);
      present(x.id, name + " record ID");
      if (ids.has(x.id)) throw Error("Duplicate record ID in " + name);
      ids.add(x.id);
      for (const key of ["amount", "credit", "payroll", "budget"])
        if (x[key] != null) positiveCents(x[key], name + "." + key);
    }
  }
  const jobs = new Map(s.jobs.map((j) => [j.id, j]));
  for (const job of s.jobs) {
    present(job.name, "job name");
    positiveCents(job.budget, "original job budget");
  }
  for (const version of s.budgetVersions) {
    if (!jobs.has(version.jobId)) throw Error("Unknown budget project");
    validDate(version.date, "budget version");
    positiveCents(version.amount, "budget version");
  }
  for (const change of s.changeOrders) {
    if (!jobs.has(change.jobId) || change.status !== "approved")
      throw Error("Invalid approved change order");
    validDate(change.date, "change order");
    positiveCents(change.amount, "change order");
  }
  for (const estimate of s.weeklyEstimates) {
    validDate(estimate.payrollDate, "payroll date");
    instant(estimate.enteredAt, "payroll estimate entry");
    present(estimate.source, "payroll estimate source");
    positiveCents(estimate.payroll, "payroll estimate");
  }
  for (const cash of s.cashSnapshots) {
    instant(cash.at, "cash snapshot");
    present(cash.source, "cash snapshot source");
    positiveCents(cash.amount, "cash snapshot");
  }
  const invoices = new Map(s.invoices.map((i) => [i.id, i]));
  const keys = new Set<string>();
  for (const invoice of s.invoices) {
    present(invoice.externalKey, "invoice external key");
    if (keys.has(invoice.externalKey)) throw Error("Duplicate external key");
    keys.add(invoice.externalKey);
    if (!jobs.has(invoice.jobId)) throw Error("Unknown invoice project");
    validDate(invoice.completionDate, "work completion");
    if (invoice.invoiceDate != null) {
      validDate(invoice.invoiceDate, "invoice issue");
      if (invoice.invoiceDate < invoice.completionDate)
        throw Error("Invoice precedes completed work");
    }
    if (invoice.dueDate != null) {
      validDate(invoice.dueDate, "invoice due");
      if (invoice.invoiceDate && invoice.dueDate < invoice.invoiceDate)
        throw Error("Due date precedes invoice");
    }
    if (invoice.expectedDate != null) validDate(invoice.expectedDate, "expected receipt");
    positiveCents(invoice.amount, "original invoice");
    positiveCents(invoice.credit, "invoice credit");
    if (invoice.credit > invoice.amount) throw Error("Credit exceeds invoice");
    if (invoice.credit) {
      if (!invoice.invoiceDate || !invoice.creditDate)
        throw Error("Credited invoice must have an issue and credit date");
      validDate(invoice.creditDate, "invoice credit date");
      if (invoice.creditDate < invoice.invoiceDate)
        throw Error("Credit precedes invoice");
    } else if (invoice.creditDate != null) {
      validDate(invoice.creditDate, "invoice credit date");
    }
    if (invoice.source != null) present(invoice.source, "invoice source");
  }
  const payments = new Map<string, number>();
  for (const payment of s.invoicePayments) {
    const invoice = invoices.get(payment.invoiceId);
    if (!invoice || !invoice.invoiceDate)
      throw Error("Payment requires an issued invoice");
    validDate(payment.date, "payment");
    if (payment.date < invoice.invoiceDate)
      throw Error("Payment precedes invoice");
    positiveCents(payment.amount, "invoice payment", false);
    const total = (payments.get(payment.invoiceId) || 0) + payment.amount;
    payments.set(payment.invoiceId, total);
    if (!Number.isSafeInteger(total) || total + invoice.credit > invoice.amount)
      throw Error("Invoice is overpaid");
  }
  const costs = new Map(s.costActuals.map((c) => [c.id, c]));
  const corrections = new Set<string>();
  for (const cost of s.costActuals) {
    if (!jobs.has(cost.jobId)) throw Error("Unknown cost project");
    if (cost.kind !== "actual" && cost.kind !== "estimate")
      throw Error("Unknown cost entry kind");
    present(cost.category, "cost category");
    present(cost.source, "cost source");
    validDate(cost.date, "cost date");
    positiveCents(cost.amount, "cost amount");
    if (cost.replaces) {
      const original = costs.get(cost.replaces);
      if (!original || cost.replaces === cost.id || corrections.has(cost.replaces) ||
          original.jobId !== cost.jobId || original.kind !== cost.kind ||
          cost.date < original.date)
        throw Error("Invalid cost correction chain");
      corrections.add(cost.replaces);
    }
  }
  for (const commitment of s.commitments) {
    present(commitment.label, "commitment description");
    validDate(commitment.date, "commitment date");
    positiveCents(commitment.amount, "commitment");
    if (typeof commitment.included !== "boolean")
      throw Error("Commitment included flag must be boolean");
  }
  return s;
}
