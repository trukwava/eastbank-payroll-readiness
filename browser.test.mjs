import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = fileURLToPath(new URL(".", import.meta.url));
async function freePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw Error("No free test port");
  const port = address.port;
  socket.close();
  await once(socket, "close");
  return port;
}
async function start(port, dir) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.ts"], {
    cwd: root,
    env: { ...process.env, EASTBANK_PORT: String(port), EASTBANK_DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (buffer) => { output += String(buffer); });
  child.stderr.on("data", (buffer) => { output += String(buffer); });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw Error("Server exited: " + output);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(500) });
      if (response.ok) return { child, origin };
    } catch { /* still starting */ }
    await delay(100);
  }
  child.kill();
  throw Error("Server was not ready: " + output);
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const finished = once(child, "exit");
  child.kill("SIGTERM");
  await finished;
}
async function json(origin, suffix) {
  const response = await fetch(origin + suffix);
  assert.equal(response.status, 200);
  return response.json();
}

test("real Chromium: navigation, payroll, collections, invoice preview, persistence, export and mobile", { timeout: 90_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "eastbank-browser-"));
  const port = await freePort();
  let server;
  let browser;
  try {
    server = await start(port, directory);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 850 }, acceptDownloads: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin);
    await page.getByRole("heading", { name: "A clear view of Friday." }).waitFor();
    assert.equal(await page.locator("#asof").inputValue(), "2026-11-09");
    assert.equal((await json(server.origin, "/api/state?asof=2026-11-09")).view.headroom, -650000);

    await page.keyboard.press("Tab");
    assert.equal(await page.locator(".skip-link").evaluate((el) => document.activeElement === el), true,
      "First keyboard tab should reach skip navigation");

    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    await navigation.getByRole("button", { name: /Collections action desk/ }).click();
    await page.getByRole("heading", { name: "The collections action desk." }).waitFor();
    assert.equal(await page.locator('[data-page="triage"]').getAttribute("aria-current"), "page");
    const filter = page.locator("#triage-filter");
    await filter.selectOption("unbilled");
    assert.equal(await page.locator(".table-wrap tbody tr").count(), 2);
    assert.equal(await page.locator("#triage-filter").evaluate((el) => document.activeElement === el), true,
      "Changing filter should not lose keyboard focus");

    await navigation.getByRole("button", { name: /Weekly workspace/ }).click();
    await page.getByRole("heading", { name: "The weekly workspace" }).waitFor();
    const reconciliation = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: "Friday payroll reconciliation" }),
    });
    const firstFriday = reconciliation.locator("tbody tr").filter({ hasText: "2026-11-06" });
    assert.match(await firstFriday.textContent(), /\$21,000\.00/);
    assert.match(await firstFriday.textContent(), /Matches estimate/);
    await page.locator("#asof").fill("2026-11-14");
    const secondFriday = reconciliation.locator("tbody tr").filter({ hasText: "2026-11-13" });
    await secondFriday.waitFor();
    assert.match(await secondFriday.textContent(), /Unknown/);
    await page.locator("#asof").fill("2026-11-09");
    await page.getByRole("heading", { name: "The weekly workspace" }).waitFor();

    await navigation.getByRole("button", { name: /Import invoices/ }).click();
    await page.getByRole("heading", { name: "Bring your invoices into focus." }).waitFor();
    const csv = readFileSync(join(root, "samples", "valid.csv"), "utf8");
    await page.locator("#csv").fill(csv);
    await page.getByRole("button", { name: "Preview & validate" }).click();
    await page.locator("#accept").waitFor();
    assert.equal(await page.locator("#accept").isEnabled(), true);
    assert.equal((await json(server.origin, "/api/state?asof=2026-11-09")).state.invoices.length, 12,
      "Preview must not mutate published invoice totals");
    await page.getByRole("button", { name: "Accept validated batch" }).click();
    await page.getByText("Batch accepted. Duplicate rows skipped.").waitFor();
    assert.equal((await json(server.origin, "/api/state?asof=2026-11-09")).state.invoices.length, 14);

    await page.reload();
    await page.getByRole("heading", { name: "A clear view of Friday." }).waitFor();
    assert.equal((await json(server.origin, "/api/state?asof=2026-11-09")).state.invoices.length, 14,
      "Invoice acceptance must survive page reload");
    assert.equal((await json(server.origin, "/api/state?asof=2026-11-09")).view.headroom, -650000,
      "Importing expected invoices must not change recorded cash or payroll shortfall");

    await navigation.getByRole("button", { name: /Invoices & collections/ }).click();
    const expectedReceipts = page.locator(".card").filter({ hasText: "DATED EXPECTED RECEIPTS" }).locator(".metric");
    assert.equal(await expectedReceipts.textContent(), "$12,000.00");
    await page.locator("#asof").fill("2026-11-17");
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".card")].some((card) =>
        card.textContent.includes("DATED EXPECTED RECEIPTS") &&
        card.querySelector(".metric")?.textContent.trim() === "$0.00"));
    await page.locator("#asof").fill("2026-11-09");
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".card")].some((card) =>
        card.textContent.includes("DATED EXPECTED RECEIPTS") &&
        card.querySelector(".metric")?.textContent.trim() === "$12,000.00"));
    await navigation.getByRole("button", { name: /Payroll readiness/ }).click();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export weekly brief/ }).click();
    const downloaded = await downloadEvent;
    const downloadStream = await downloaded.createReadStream();
    assert.ok(downloadStream, "Weekly export should have readable contents");
    let brief = "";
    for await (const chunk of downloadStream) brief += String(chunk);
    assert.match(brief, /Recorded cash: \$18,000\.00/);
    assert.match(brief, /Signed projected headroom: -\$6,500\.00/);
    assert.match(brief, /DEMO-2001/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole("heading", { name: "A clear view of Friday." }).waitFor();
    const sizes = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
    }));
    assert.ok(sizes.scrollWidth <= sizes.width + 2, `Horizontal page overflow at mobile size: ${JSON.stringify(sizes)}`);
    await navigation.getByRole("button", { name: /Collections action desk/ }).click();
    await page.getByRole("heading", { name: "The collections action desk." }).waitFor();
    assert.deepEqual(errors, [], "The app should have no uncaught browser JavaScript exceptions");
  } finally {
    if (browser) await browser.close();
    if (server) await stop(server.child);
    rmSync(directory, { recursive: true, force: true });
  }
});
