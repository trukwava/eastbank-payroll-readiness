let page = "overview",
  data,
  scenario = false,
  rows = [],
  csv = "",
  mapping = {},
  triageFilter = "all",
  backupPayload = null,
  backupSummary = null;
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  usd = (n) =>
    n == null
      ? "Unknown"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(n / 100),
  asof = () => $("#asof").value;
const job = (id) => data.state.jobs.find((j) => j.id === id)?.name || "Unknown";
async function load() {
  try {
    const r = await fetch(
      "/api/state?asof=" + asof() + "&scenario=" + scenario,
    );
    data = await r.json();
    if (!r.ok) throw Error(data.error);
    render();
  } catch (e) {
    notice("Unable to load saved records: " + e.message);
  }
}
async function action(b) {
  const r = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
    d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
function notice(t) {
  $("#notice").textContent = t;
}
function go(p) {
  page = p;
  notice("");
  render();
  document.querySelector("#content h1")?.focus();
}
const heading = (title, desc, button = "") =>
    `<div class="heading"><div><div class="eyebrow">EASTBANK / OPERATING DESK</div><h1 tabindex="-1">${title}</h1><p style="margin:0;font-size:12px">${desc}</p></div>${button}</div>`,
  card = (label, value, foot, cls = "") =>
    `<div class="card ${cls}"><div class="metric-label">${label}</div><div class="metric">${value}</div><small>${foot}</small></div>`,
  line = (a, b) => `<div class="line"><span>${a}</span><b>${b}</b></div>`;
function invoiceTable(list) {
  return `<div class="table-wrap"><table><thead><tr><th>INVOICE / PROJECT</th><th>STATUS</th><th>COMPLETED → BILLED</th><th>INVOICE CLOCK</th><th class="amount">ORIGINAL</th><th class="amount">CREDIT / PAID</th><th class="amount">REMAINING</th></tr></thead><tbody>${list.map((x) => `<tr><td class="project">${esc(x.externalKey)}<span class="sub">${esc(job(x.jobId))}</span></td><td><span class="tag ${x.status === "Paid" ? "green" : ""}">${x.status}</span></td><td>${x.billingLag == null ? "Unknown" : x.billingLag + " days"}<span class="sub">${x.completionDate} → ${x.invoiceDate || "Not billed"}</span></td><td>${x.clock == null ? "Unknown" : x.clock + " days"}<span class="sub">${x.status === "Paid" ? "Invoice → payment date" : "Invoice → as-of date"}</span></td><td class="amount">${usd(x.amount)}</td><td class="amount">${usd(x.credit)} / ${usd(x.paid)}</td><td class="amount">${usd(x.remaining)}</td></tr>`).join("")}</tbody></table></div>`;
}
const opts = (arr) =>
    arr
      .map(
        (x) => `<option value="${esc(x.id ?? x)}">${esc(x.name ?? x)}</option>`,
      )
      .join(""),
  field = (label, name, type = "text", value = "") =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" required></label>`,
  amount = () => field("Amount · USD", "amount"),
  jobField = () =>
    `<label>Project<select name="jobId">${opts(data.state.jobs)}</select></label>`,
  dateField = () => field("Date", "date", "date", asof()),
  form = (type, body) =>
    `<form class="form" data-action="${type}">${body}<button class="primary">Save record</button></form>`;
function render() {
  const { state: s, view: v } = data;
  document
    .querySelectorAll("nav button")
    .forEach((b) => {
      const active = b.dataset.page === page;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  let h = "";
  if (page === "overview") {
    h = heading(
      "A clear view of Friday.",
      `Payroll readiness · ${v.payroll?.payrollDate || "Payroll date unknown"}`,
      `<button class="btn" id="export">↓ &nbsp; Export weekly brief</button>`,
    );
    if (v.stale)
      h += `<div class="alert">⚠ &nbsp; <b>${v.cash ? "Cash snapshot needs a refresh." : "Cash snapshot missing."}</b> ${v.cash ? "Last recorded " + v.cash.at.slice(0, 10) + " · " + esc(v.cash.source) + "." : ""} Confirm the balance before making a payroll decision.</div>`;
    h += `<div class="cards">${card('RECORDED CASH <span class="tag">Snapshot</span>', usd(v.cash?.amount), esc(v.cash?.source || "Missing balance"))}${card("NEXT PAYROLL REQUIREMENT", usd(v.payroll?.payroll), esc(v.payroll?.source || "Missing estimate"))}${card(v.headroom == null ? "READINESS UNKNOWN" : v.headroom < 0 ? "PROJECTED SHORTFALL" : "PROJECTED HEADROOM", usd(v.headroom == null ? null : Math.abs(v.headroom)), "After payroll and included commitments", "short")}</div><div class="grid"><section class="panel"><div class="panel-head"><h2>The payroll bridge</h2><span class="muted">${asof()} · USD</span></div>${line("Recorded cash snapshot", usd(v.cash?.amount))}${line("Next payroll estimate", "− " + usd(v.payroll?.payroll))}${v.commitments.map((c) => line(esc(c.label) + " <small>· " + c.date + "</small>", "− " + usd(c.amount))).join("")}${scenario ? line("Scenario receipts through payroll", "+ " + usd(v.receipt)) : ""}<div class="line total"><span>Projected ${v.headroom < 0 ? "shortfall" : "headroom"}</span><strong>${usd(v.headroom == null ? null : Math.abs(v.headroom))}</strong></div><div class="note">Only listed commitments due between the as-of date and payroll are included. Receivables are excluded from recorded cash.<br><label><input type="checkbox" id="scenario" ${scenario ? "checked" : ""}> Separate what-if: include expected receipts due by payroll</label>${scenario ? "<br>Scenario only. Recorded cash is unchanged." : ""}</div></section><section class="panel"><div class="panel-head"><h2>This week’s priorities</h2><span class="tag">3 actions</span></div>${[
      [
        "Confirm the cash position",
        "Refresh the sourced cash balance.",
        "weekly",
        "Update cash snapshot",
      ],
      [
        usd(v.unbilled) + " completed, not billed",
        "Review completed work before preparing invoices.",
        "invoices",
        "Review billing queue",
      ],
      [
        usd(v.unpaid) + " still to collect",
        "Expected payments are plans, never available cash.",
        "triage",
        "Open collections",
      ],
    ]
      .map(
        (a, i) =>
          `<div class="action"><span class="number">${i + 1}</span><div><h3>${a[0]}</h3><p>${a[1]}</p><button data-go="${a[2]}">${a[3]} →</button></div></div>`,
      )
      .join(
        "",
      )}</section></div><section class="panel"><div class="panel-head"><div><h2>Invoices that need attention</h2><span class="muted">Elapsed calendar days · missing dates stay unknown</span></div><button class="secondary" data-go="invoices">View all invoices →</button></div>${invoiceTable(v.invoices.filter((x) => x.remaining > 0).slice(0, 4))}</section>`;
  }

  if (page === "triage") {
    const d = data.collectionsDesk;
    const labels = {
      overdue: "Overdue", unbilled: "Completed, not invoiced",
      dueSoon: "Due within 7 days", missingDue: "Due date missing",
      scheduled: "Scheduled later",
    };
    const clock = (x) => x.kind === "overdue"
      ? Math.abs(x.clockDays) + " days overdue"
      : x.kind === "unbilled"
        ? (x.clockDays == null ? "Age unknown" : x.clockDays + " days since completion")
        : x.kind === "dueSoon" || x.kind === "scheduled"
          ? x.clockDays + " days until due" : "Unknown due date";
    const matches = triageFilter === "all" ? d.items
      : d.items.filter((x) => x.kind === triageFilter);
    h = heading(
      "The collections action desk.",
      "A source-backed queue for billing and follow-ups—not a cash forecast.",
      '<button class="secondary" data-go="invoices">View invoice ledger</button>',
    );
    h += '<div class="alert"><b>Planning only.</b> Unpaid or expected invoices are not recorded cash. Check contractual terms and dated payments before contacting a customer.</div>';
    h += '<div class="cards">' +
      card("OVERDUE INVOICED", usd(d.summary.overdue.amount), d.summary.overdue.count + " outstanding invoices", "short") +
      card("COMPLETED, UNBILLED", usd(d.summary.unbilled.amount), d.summary.unbilled.count + " work items") +
      card("DUE WITHIN 7 DAYS", usd(d.summary.dueSoon.amount), d.summary.dueSoon.count + " invoices") +
      card("DUE DATE MISSING", usd(d.summary.missingDue.amount), d.summary.missingDue.count + " invoices need verification") + '</div>';
    const choices = Object.entries(labels).map(([key, label]) =>
      '<option value="' + key + '" ' + (triageFilter === key ? "selected" : "") + '>' + esc(label) + '</option>'
    ).join("");
    const tableRows = matches.map((x) =>
      '<tr><td><span class="tag ' + (x.kind === "scheduled" ? "green" : "") + '">' + esc(labels[x.kind]) + '</span></td>' +
      '<td class="project">' + esc(x.externalKey) + '<span class="sub">' + esc(job(x.jobId)) + '</span></td>' +
      '<td>' + usd(x.remaining) + '</td><td>' + esc(x.dueDate || x.completionDate || "Unknown") +
      '<span class="sub">' + esc(clock(x)) + '</span></td><td>' + esc(x.action) + '</td></tr>'
    ).join("") || '<tr><td colspan="5">No matching follow-ups for this as-of date.</td></tr>';
    h += '<section class="panel" style="margin-top:24px"><div class="panel-head"><div><h2>Prioritized follow-ups</h2><p>Remaining amounts include dated payments and effective credits.</p></div><label>Show <select id="triage-filter"><option value="all" ' + (triageFilter === "all" ? "selected" : "") + '>All work</option>' +
      choices + '</select></label></div><div class="table-wrap"><table><thead><tr><th>PRIORITY</th><th>INVOICE / PROJECT</th><th>REMAINING</th><th>DATE / CLOCK</th><th>NEXT REVIEW ACTION</th></tr></thead><tbody>' +
      tableRows + '</tbody></table></div><div class="note">Priority: overdue → unbilled → due soon → missing due date → scheduled. Due soon means 0–' + d.dueSoonDays + ' calendar days. No autonomous collections messages are sent.</div></section>';
  }
  if (page === "invoices")
    h =
      heading(
        "Billing & collections",
        "Two clocks reveal where work is waiting.",
      ) +
      `<div class="cards">${card("UNPAID INVOICED", usd(v.unpaid), "After dated credits and payments")}${card("COMPLETED, UNBILLED", usd(v.unbilled), "Separate from unpaid invoiced total")}${card("DATED EXPECTED RECEIPTS", usd(v.invoices.filter((x) => x.issued && x.remaining > 0 && x.expectedDate && x.expectedDate >= asof()).reduce((n, x) => n + x.remaining, 0)), "Unconfirmed plans · never recorded cash")}</div><section class="panel" style="margin-top:24px">${invoiceTable(v.invoices)}</section><section class="panel" style="margin-top:20px"><h2>Record a payment</h2><p>Payments reduce receivables; update the cash snapshot separately.</p>${form("payment", `<label>Invoice<select name="invoiceId">${opts(v.invoices.filter((x) => x.issued && x.remaining > 0).map((x) => ({ id: x.id, name: x.externalKey })))}</select></label>` + amount() + dateField())}</section>`;
  if (page === "weekly")
    h =
      heading(
        "The weekly workspace",
        "Monday plans and Friday records stay separate.",
      ) +
      `<div class="grid"><section class="panel"><h2>Record cash snapshot</h2><p>A sourced balance at a specific instant.</p>${form("cash", amount() + field("Timestamp with timezone offset", "at", "text", asof() + "T16:00:00-05:00") + field("Source", "source", "text", "Manual accounting balance"))}</section><section class="panel"><h2>Monday payroll estimate</h2><p>Unknown future payroll stays unknown.</p>${form("weekly", amount() + field("Payroll date", "date", "date", "2026-11-13") + field("Recorded at", "enteredAt", "text", asof() + "T09:00:00-05:00") + field("Source", "source", "text", "Monday office estimate"))}</section><section class="panel"><h2>Weekly job costs</h2><p>Friday payroll actuals use Labor. Estimates never consume budget.</p>${form("cost", jobField() + `<label>Category<select name="category">${opts(s.organization.categories)}</select></label><label>Entry type<select name="kind"><option value="actual">Actual cost</option><option value="estimate">Weekly estimate</option></select></label>` + amount() + dateField() + field("Source / correction reason", "source") + `<label>Correction target (optional)<select name="correctId"><option value="">New entry</option>${opts(s.costActuals.filter((x) => !s.costActuals.some((a) => a.replaces === x.id)).map((x) => ({ id: x.id, name: job(x.jobId) + " · " + x.category + " · " + usd(x.amount) })))}</select></label>`)}</section><section class="panel"><h2>Committed outgoing</h2><p>Included when due between the view date and payroll.</p>${form("commitment", field("Description", "label") + amount() + dateField())}</section></div><section class="panel"><h2>Source ledger</h2><div class="table-wrap"><table><tr><th>DATE</th><th>PROJECT</th><th>TYPE / CATEGORY</th><th>AMOUNT</th><th>SOURCE</th></tr>${s.costActuals.map((x) => `<tr><td>${x.date}</td><td>${esc(job(x.jobId))}</td><td>${x.kind} · ${esc(x.category)}${s.costActuals.some((a) => a.replaces === x.id) ? " · Superseded" : ""}</td><td>${usd(x.amount)}</td><td>${esc(x.source)}</td></tr>`).join("")}</table></div></section>`;
  if (page === "weekly") {
    const history = data.payrollHistory || [];
    h += '<section class="panel" style="margin-top:20px"><h2>Friday payroll reconciliation</h2>' +
      '<p>Compare the latest estimate known by this as-of date to recorded Labor costs. Corrections follow the original payroll Friday but become effective only when entered. This is not a certified payroll close.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>PAYROLL FRIDAY</th><th>LAST KNOWN ESTIMATE</th><th>RECORDED LABOR</th><th>ACTUAL − ESTIMATE</th><th>JOB COVERAGE</th></tr></thead><tbody>' +
      (history.map((w) =>
        '<tr><td class="project">' + esc(w.payrollDate) + '</td><td>' + usd(w.estimate) +
        '<span class="sub">' + esc(w.estimateSource) + '</span></td><td>' + usd(w.actual) +
        '</td><td>' + (w.variance == null ? 'Unknown' : ((w.variance > 0 ? '+' : '') + usd(w.variance))) +
        '<span class="sub">' + (w.variance == null ? 'Actual not recorded' : w.variance > 0 ? 'Over estimate' : w.variance < 0 ? 'Under estimate' : 'Matches estimate') + '</span></td>' +
        '<td>' + w.recordedJobs + ' of ' + w.totalJobs + ' projects<span class="sub">Coverage does not certify completeness</span></td></tr>'
      ).join('') || '<tr><td colspan="5">No completed payroll estimate is known by this as-of date.</td></tr>') +
      '</tbody></table></div>' +
      history.map((w) =>
        '<details><summary>' + esc(w.payrollDate) + ' · Inspect ' + w.sources.length + ' Labor source records</summary>' +
        '<p>' + esc(w.interpretation) + '</p>' +
        (w.sources.map((x) => line(
          esc(job(x.jobId)) + ' · ' + esc(x.source) + (x.corrected ? ' <small>(corrected ' + esc(x.effectiveDate) + '; original payroll date ' + esc(x.originalPayrollDate) + ')</small>' : ''),
          usd(x.amount)
        )).join('') || '<p>No Labor actuals recorded for this payroll Friday.</p>') +
        '</details>'
      ).join('') + '</section>';
  }
  if (page === "jobs") {
    h = heading(
      "Every project, accounted for.",
      "Approved budgets and actual costs reconciled to source records.",
    );
    h += s.jobs
      .map((j) => {
        const changes = s.changeOrders
            .filter((x) => x.jobId === j.id && x.date <= asof())
            .reduce((a, x) => a + x.amount, 0),
          active = s.costActuals.filter(
            (x) =>
              x.jobId === j.id &&
              x.date <= asof() &&
              !s.costActuals.some(
                (a) => a.replaces === x.id && a.date <= asof(),
              ),
          ),
          actual = active
            .filter((x) => x.kind === "actual")
            .reduce((a, x) => a + x.amount, 0),
          estimate = active
            .filter((x) => x.kind === "estimate")
            .reduce((a, x) => a + x.amount, 0);
        return `<section class="panel" style="margin-bottom:18px"><div class="panel-head"><h2>${esc(j.name)}</h2><span class="tag green">Active project</span></div><div class="cards">${card("APPROVED BUDGET", usd(j.budget + changes), "Original " + usd(j.budget) + " + changes " + usd(changes))}${card("ACTUAL COSTS", usd(actual), "Weekly estimates separately: " + usd(estimate))}${card("REMAINING BUDGET", usd(j.budget + changes - actual), "Approved budget less actual costs")}</div><div class="bar"><span style="width:${Math.min(100, (actual / (j.budget + changes)) * 100)}%"></span></div><details><summary>Inspect category totals</summary>${[...new Set([...s.organization.categories, ...active.map((x) => x.category)])].map((c) => line(esc(c), usd(active.filter((x) => x.kind === "actual" && x.category === c).reduce((a, x) => a + x.amount, 0)))).join("")}</details></section>`;
      })
      .join("");
    h += `<div class="grid"><section class="panel"><h2>Create project</h2>${form("job", field("Project name", "name") + amount() + dateField())}</section><section class="panel"><h2>Record approved change order</h2>${form("change", jobField() + amount() + dateField())}</section></div>`;
  }
  if (page === "import")
    h =
      heading(
        "Bring your invoices into focus.",
        "Preview → validate → accept. Preview never changes published totals.",
      ) +
      `<section class="panel"><h2>Invoice CSV · version 1</h2><p>Exact header required. Amounts use dollars without symbols or commas. Blank invoice dates represent unbilled work. Credits take effect on invoice date. Payment is the cumulative imported payment.</p><input type="file" id="file" accept=".csv,text/csv" aria-label="Select invoice CSV"><label class="sub" for="csv">Or paste CSV contents</label><textarea id="csv" placeholder="external_key,project,completion_date,invoice_date,due_date,amount,credit,payment,payment_date">${esc(csv)}</textarea><div class="form" style="margin:18px 0"><label>Renamed project in CSV<input id="alias" placeholder="Riverside Residences"></label><label>Map to existing project<select id="mapped">${opts(s.jobs)}</select></label></div><button class="secondary" id="map">Add project mapping</button> <button class="btn" id="preview">Preview & validate</button><p id="mapping">${esc(JSON.stringify(mapping))}</p>${rows.length ? `<h3>${rows.filter((x) => x.status === "Ready").length} ready · ${rows.filter((x) => x.status === "Duplicate").length} duplicates skipped</h3><table><tr><th>ROW</th><th>STATUS</th><th>DETAIL</th></tr>${rows.map((x) => `<tr><td>${x.row}</td><td>${x.status}</td><td>${esc(x.error || x.normalized?.externalKey)}</td></tr>`).join("")}</table><p>Conflicts remain outside totals. Edit the CSV or external key and preview again.</p><button class="btn" id="accept" ${rows.some((x) => ["Invalid", "Conflict"].includes(x.status)) ? "disabled" : ""}>Accept validated batch</button>` : ""}</section>`;
  if (page === "settings")
    h =
      heading(
        "Settings & accountability",
        "Local demo. No bank, payroll, or model connection is configured.",
      ) +
      `<div class="grid"><section class="panel"><h2>Organization settings</h2>${form("settings", field("Display timezone (IANA)", "timezone", "text", s.organization.timezone) + s.organization.categories.map((c, i) => field("Cost category " + (i + 1), "category" + i, "text", c)).join(""))}<div class="note">USD. Nonnegative integer cents. Credits and payments subtract from invoice value. Costs subtract from budget. Commitments subtract from cash headroom. Date-only deadlines use calendar days; exact instants store UTC.</div></section><section class="panel"><h2>Recovery & retention</h2><p>Records stay in local SQLite until reset or database deletion. Download a backup before resetting. Reset affects only the synthetic demo organization.</p><button class="secondary" id="backup">Download demo backup</button> <button class="secondary" id="reset">Reset synthetic demo</button><div class="note"><b>Restore an earlier demo backup</b><p>Replacing records is destructive. Download a current backup first. Only validated demo-organization JSON is accepted.</p><label for="restore-file">Select backup JSON</label><input type="file" id="restore-file" accept=".json,application/json"><button class="secondary" id="restore-preview" ${backupPayload ? "" : "disabled"}>Validate & preview</button>${backupSummary ? '<p id="restore-summary" role="status">Valid backup · ' + esc(backupSummary.jobs) + ' jobs · ' + esc(backupSummary.invoices) + ' invoices · ' + esc(backupSummary.cashSnapshots) + ' cash snapshots · ' + esc(backupSummary.changeEvents) + ' history events. Example November 9 headroom: ' + usd(backupSummary.exampleHeadroom) + '</p><button class="btn" id="restore-accept">Restore validated backup</button>' : ""}</div><div class="note">Recorded cash: point-in-time sourced balance.<br>Payroll estimate: selected Monday plan.<br>Actual payroll: active Labor actuals on payroll date.<br>Remaining budget: approved budget minus actual costs.<br>No forecast guarantee. Expected receipts never change recorded cash.</div></section></div><section class="panel"><h2>Change history</h2>${
        s.auditEvents.length
          ? s.auditEvents
              .slice()
              .reverse()
              .map(
                (x) =>
                  `<details><summary>${esc(x.action)} · ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: s.organization.timezone }).format(new Date(x.at))}</summary><pre>${esc(JSON.stringify({ before: x.before, after: x.after }, null, 2))}</pre></details>`,
              )
              .join("")
          : "<p>No edits yet. Accepted imports, entries, and corrections appear here.</p>"
      }</section>`;
  $("#content").innerHTML = h;
  document.querySelectorAll(".table-wrap").forEach((wrap) => {
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Scrollable data table");
  });
  bind();
}
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function bind() {
  document
    .querySelectorAll("[data-go]")
    .forEach((b) => (b.onclick = () => go(b.dataset.go)));
  document.querySelectorAll("form[data-action]").forEach(
    (f) =>
      (f.onsubmit = async (e) => {
        e.preventDefault();
        const b = {
          type: f.dataset.action,
          ...Object.fromEntries(new FormData(f)),
        };
        if (b.type === "settings")
          b.categories = Array.from({ length: 5 }, (_, i) => b["category" + i]);
        try {
          await action(b);
          await load();
          notice("Saved locally. Change history updated.");
        } catch (e) {
          notice(e.message);
        }
      }),
  );
  if ($("#triage-filter"))
    $("#triage-filter").onchange = (e) => {
      triageFilter = e.target.value;
      render();
      $("#triage-filter")?.focus();
    };
  if ($("#scenario"))
    $("#scenario").onchange = (e) => {
      scenario = e.target.checked;
      load();
    };
  if ($("#export"))
    $("#export").onclick = () => {
      const v = data.view;
      download(
        "eastbank-" + asof() + ".md",
        `# Eastbank weekly operating brief\nSynthetic demo · As of ${asof()} · ${data.state.organization.timezone}\n\nRecorded cash: ${usd(v.cash?.amount)}\nSnapshot: ${v.cash?.at || "Missing"} · ${v.cash?.source || "Unknown"} · ${v.stale ? "STALE" : "Fresh"}\nPayroll: ${usd(v.payroll?.payroll)} · ${v.payroll?.payrollDate || "Unknown"}\nIncluded commitments: ${usd(v.outgoing)}\n${v.commitments.map((x) => "- " + x.label + ": " + usd(x.amount) + " · " + x.date).join("\n")}\nSigned projected headroom: ${usd(v.headroom)}\nScenario: ${scenario}; included scenario receipts: ${usd(v.receipt)}\nUnpaid invoiced: ${usd(v.unpaid)}\nCompleted unbilled: ${usd(v.unbilled)}\n\nReceivables excluded from recorded cash. Only listed commitments included. Unknown inputs remain unknown. Clocks use elapsed calendar days.\n\n` +
          v.invoices
            .map(
              (x) =>
                `${x.externalKey} | ${job(x.jobId)} | ${x.status} | remaining ${usd(x.remaining)} | billing lag ${x.billingLag ?? "Unknown"} | invoice clock ${x.clock ?? "Unknown"}`,
            )
            .join("\n") +
          "\n\n## Friday payroll reconciliation\n" +
          (data.payrollHistory || []).map((w) =>
            w.payrollDate + " | estimate " + usd(w.estimate) +
            " | recorded Labor " + usd(w.actual) +
            " | actual minus estimate " + usd(w.variance) +
            " | sources " + w.sources.map((x) => job(x.jobId) + ": " + usd(x.amount) + " (" + x.source + ")").join("; ")
          ).join("\n") +
          "\n\nLabor actuals are unverified source entries, not a certified payroll close. Unknown actuals must not be interpreted as zero.\n",
      );
    };
  if ($("#backup"))
    $("#backup").onclick = () =>
      download(
        "eastbank-backup.json",
        JSON.stringify({ format: "eastbank-demo-backup", version: 1, exportedAt: new Date().toISOString(), state: data.state }, null, 2),
        "application/json",
      );
  if ($("#restore-file"))
    $("#restore-file").onchange = async (e) => {
      const file = e.target.files[0];
      backupPayload = null;
      backupSummary = null;
      if (!file) return;
      if (file.size > 900000) {
        notice("Restore files must be smaller than 900 KB.");
        render();
        return;
      }
      try {
        backupPayload = JSON.parse(await file.text());
        render();
        notice("Backup selected. Choose Validate & preview before restoring.");
      } catch (error) {
        notice("Invalid JSON backup: " + error.message);
      }
    };
  if ($("#restore-preview"))
    $("#restore-preview").onclick = async () => {
      try {
        backupSummary = (await action({ type: "restorePreview", backup: backupPayload })).summary;
        render();
        notice("Validation passed. Review record counts before restoring.");
      } catch (error) {
        backupSummary = null;
        render();
        notice("Restore blocked: " + error.message);
      }
    };
  if ($("#restore-accept"))
    $("#restore-accept").onclick = async () => {
      if (!backupSummary || !backupPayload) return;
      if (!confirm("REPLACE all current Eastbank demo records with this validated backup? Current edits will be lost."))
        return;
      try {
        await action({ type: "restore", backup: backupPayload, confirmation: "RESTORE DEMO" });
        backupPayload = null;
        backupSummary = null;
        await load();
        notice("Demo backup restored. The restoration is recorded in change history.");
      } catch (error) {
        notice("Restore failed; current data was not replaced: " + error.message);
      }
    };
  if ($("#reset"))
    $("#reset").onclick = async () => {
      if (
        confirm("Reset synthetic demo? Download a backup to preserve edits.")
      ) {
        await action({ type: "reset" });
        load();
      }
    };
  if ($("#file"))
    $("#file").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 1000000) {
        notice("CSV limit is 1 MB");
        return;
      }
      csv = await f.text();
      $("#csv").value = csv;
    };
  if ($("#map"))
    $("#map").onclick = () => {
      mapping[$("#alias").value] = $("#mapped").value;
      $("#mapping").textContent = JSON.stringify(mapping);
    };
  if ($("#preview"))
    $("#preview").onclick = async () => {
      csv = $("#csv").value;
      try {
        rows = (await action({ type: "preview", csv, mapping })).rows;
        render();
      } catch (e) {
        notice(e.message);
      }
    };
  if ($("#accept"))
    $("#accept").onclick = async () => {
      try {
        await action({ type: "import", csv, mapping });
        rows = [];
        await load();
        notice("Batch accepted. Duplicate rows skipped.");
      } catch (e) {
        notice(e.message);
      }
    };
}
document
  .querySelectorAll("nav button")
  .forEach((b) => (b.onclick = () => go(b.dataset.page)));
$("#asof").onchange = load;
load();
