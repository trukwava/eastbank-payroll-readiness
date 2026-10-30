import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seed, snapshot, preview, money, date, validateState } from "./core.ts";
import { collectionsDesk } from "./triage.ts";
const root = fileURLToPath(new URL(".", import.meta.url));
mkdirSync(root + "data", { recursive: true });
const db = new DatabaseSync(root + "data/eastbank.sqlite");
db.exec(
  "CREATE TABLE IF NOT EXISTS organization_state (id TEXT PRIMARY KEY CHECK(id='demo'), body TEXT NOT NULL CHECK(json_valid(body))); CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO schema_migrations VALUES(1)",
);
if (!db.prepare("SELECT id FROM organization_state").get())
  db.prepare("INSERT INTO organization_state VALUES (?,?)").run(
    "demo",
    JSON.stringify(seed()),
  );
const get = () =>
  JSON.parse(
    (
      db
        .prepare("SELECT body FROM organization_state WHERE id=?")
        .get("demo") as any
    ).body,
  );
const save = (s: any) => {
  validateState(s);
  db.prepare("UPDATE organization_state SET body=? WHERE id=?").run(
    JSON.stringify(s),
    "demo",
  );
};
const audit = (s: any, action: string, before: any, after: any) =>
  s.auditEvents.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    action,
    before,
    after,
  });
createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'",
  );
  try {
    if (
      !["localhost:48739", "127.0.0.1:48739"].includes(req.headers.host || "")
    )
      throw Error("Host not allowed");
    const u = new URL(req.url!, "http://localhost");
    if (req.method === "GET" && u.pathname === "/api/state") {
      const s = get();
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          state: s,
          view: snapshot(
            s,
            u.searchParams.get("asof") || "2026-11-09",
            u.searchParams.get("scenario") === "true",
          ),
          collectionsDesk: collectionsDesk(s, u.searchParams.get("asof") || "2026-11-09"),
        }),
      );
      return;
    }
    if (req.method === "POST" && u.pathname === "/api/action") {
      if (
        req.headers.origin &&
        !["http://localhost:48739", "http://127.0.0.1:48739"].includes(
          req.headers.origin,
        )
      )
        throw Error("Origin not allowed");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1100000) throw Error("Request too large");
      }
      const b = JSON.parse(raw),
        s = get();
      let result: any = { ok: true };
      const id = () => crypto.randomUUID();
      if (b.type === "preview") {
        result = { rows: preview(s, b.csv, b.mapping) };
      } else {
        if (b.type === "import") {
          const rows = preview(s, b.csv, b.mapping);
          if (
            rows.some((r) => r.status === "Invalid" || r.status === "Conflict")
          )
            throw Error(
              "Resolve invalid rows and conflicts before accepting the batch",
            );
          for (const r of rows.filter((r) => r.status === "Ready")) {
            s.invoices.push(r.normalized);
            if (r.payment)
              s.invoicePayments.push({
                id: id(),
                invoiceId: r.normalized.id,
                amount: r.payment,
                date: r.paymentDate,
              });
          }
          s.mappings.push({ id: id(), values: b.mapping || {} });
          s.importBatches.push({
            id: id(),
            at: new Date().toISOString(),
            accepted: rows.filter((r) => r.status === "Ready").length,
            duplicates: rows.filter((r) => r.status === "Duplicate").length,
            rows,
          });
          audit(s, "Import accepted", null, rows);
        } else if (b.type === "cash") {
          const x = {
            id: id(),
            amount: money(b.amount),
            at: new Date(b.at).toISOString(),
            source: String(b.source ?? "").trim().slice(0, 200),
          };
          if (!x.source) throw Error("Source required");
          s.cashSnapshots.push(x);
          audit(s, "Cash snapshot added", null, x);
        } else if (b.type === "weekly") {
          date(b.date);
          const x = {
            id: id(),
            payrollDate: b.date,
            payroll: money(b.amount),
            enteredAt: new Date(b.enteredAt).toISOString(),
            source: String(b.source ?? "").trim().slice(0, 200),
          };
          if (!x.source) throw Error("Source required");
          const previous = s.weeklyEstimates
            .filter((a) => a.payrollDate === x.payrollDate)
            .at(-1);
          s.weeklyEstimates.push(x);
          audit(s, "Payroll estimate saved", previous || null, x);
        } else if (b.type === "cost") {
          date(b.date);
          if (
            !s.jobs.some((j) => j.id === b.jobId) ||
            !s.organization.categories.includes(b.category)
          )
            throw Error("Unknown job or category");
          const old = b.correctId
            ? s.costActuals.find((x) => x.id === b.correctId)
            : null;
          if (b.correctId && !old) throw Error("Correction target missing");
          const x = {
            id: id(),
            jobId: b.jobId,
            category: b.category,
            amount: money(b.amount),
            date: b.date,
            source: String(b.source ?? "").trim().slice(0, 200),
            kind: b.kind === "estimate" ? "estimate" : "actual",
            replaces: old?.id,
          };
          if (!x.source) throw Error("Source required");
          if (old) {
            if (s.costActuals.some((a) => a.replaces === old.id))
              throw Error("Record already corrected");
            x.kind = old.kind;
          }
          s.costActuals.push(x);
          audit(s, old ? "Cost corrected" : "Weekly cost added", old, x);
        } else if (b.type === "payment") {
          date(b.date);
          const inv = s.invoices.find((x) => x.id === b.invoiceId);
          if (!inv || !inv.invoiceDate || b.date < inv.invoiceDate)
            throw Error("Payment must follow an issued invoice");
          const amount = money(b.amount);
          const balance =
            inv.amount -
            inv.credit -
            s.invoicePayments
              .filter((x) => x.invoiceId === inv.id)
              .reduce((a, x) => a + x.amount, 0);
          if (amount <= 0 || amount > balance)
            throw Error("Payment exceeds remaining balance");
          const x = { id: id(), invoiceId: inv.id, amount, date: b.date };
          s.invoicePayments.push(x);
          audit(s, "Payment recorded", null, x);
        } else if (b.type === "job") {
          const x = {
            id: id(),
            name: String(b.name).trim().slice(0, 100),
            budget: money(b.amount),
          };
          if (!x.name) throw Error("Name required");
          s.jobs.push(x);
          s.budgetVersions.push({
            id: id(),
            jobId: x.id,
            amount: x.budget,
            date: date(b.date),
          });
          audit(s, "Job created", null, x);
        } else if (b.type === "change") {
          if (!s.jobs.some((x) => x.id === b.jobId)) throw Error("Unknown job");
          const x = {
            id: id(),
            jobId: b.jobId,
            amount: money(b.amount),
            date: date(b.date),
            status: "approved",
          };
          s.changeOrders.push(x);
          audit(s, "Approved change order", null, x);
        } else if (b.type === "settings") {
          new Intl.DateTimeFormat("en", { timeZone: b.timezone });
          if (
            !Array.isArray(b.categories) ||
            b.categories.length !== 5 ||
            new Set(b.categories).size !== 5 ||
            b.categories.some((x) => !x.trim())
          )
            throw Error("Exactly five unique category names required");
          const before = structuredClone(s.organization);
          s.organization.timezone = b.timezone;
          s.organization.categories = b.categories.map((x) =>
            String(x).slice(0, 40),
          );
          audit(s, "Organization settings", before, s.organization);
        } else if (b.type === "commitment") {
          const x = {
            id: id(),
            label: String(b.label ?? "").trim().slice(0, 100),
            amount: money(b.amount),
            date: date(b.date),
            included: true,
          };
          if (!x.label) throw Error("Commitment description required");
          s.commitments.push(x);
          audit(s, "Commitment added", null, x);
        } else if (b.type === "reset") {
          save(seed());
          res.end('{"ok":true}');
          return;
        } else throw Error("Unknown action");
        save(s);
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
      return;
    }
    const files: any = {
      "/": "index.html",
      "/app.js": "app.js",
      "/style.css": "style.css",
    };
    if (files[u.pathname]) {
      res.setHeader(
        "Content-Type",
        u.pathname.endsWith(".js")
          ? "text/javascript"
          : u.pathname.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      res.end(readFileSync(root + "public/" + files[u.pathname]));
      return;
    }
    res.statusCode = 404;
    res.end("Not found");
  } catch (e) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(48739, "127.0.0.1", () =>
  console.log("Eastbank ready at http://localhost:48739"),
);
