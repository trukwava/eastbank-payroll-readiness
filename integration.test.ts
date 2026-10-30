import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test port");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}
async function startServer(port: number, dataDirectory: string) {
  const process = spawn(
    processExec(),
    ["--disable-warning=ExperimentalWarning", "server.ts"],
    {
      cwd: new URL(".", import.meta.url).pathname,
      env: { ...globalThis.process.env, EASTBANK_PORT: String(port), EASTBANK_DATA_DIR: dataDirectory },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  process.stdout.on("data", (c) => { output += String(c); });
  process.stderr.on("data", (c) => { output += String(c); });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 70; attempt++) {
    if (process.exitCode !== null) throw Error("Server exited before ready: " + output);
    try {
      const response = await fetch(origin + "/", { signal: AbortSignal.timeout(500) });
      if (response.ok) return { process, origin };
    } catch { /* startup not complete */ }
    await delay(100);
  }
  process.kill();
  throw Error("Server did not start: " + output);
}
function processExec() { return globalThis.process.execPath; }
async function stopServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}

test("HTTP workflow: validation → import → payment → re-import → restart persistence", { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "eastbank-http-"));
  const port = await availablePort();
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  try {
    server = await startServer(port, dir);
    const origin = server.origin;
    async function state() {
      const response = await fetch(origin + "/api/state?asof=2026-11-09");
      assert.equal(response.status, 200);
      return response.json();
    }
    async function action(body: object, remoteOrigin = origin) {
      const response = await fetch(origin + "/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: remoteOrigin },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }

    let loaded = await state();
    assert.equal(loaded.view.headroom, -650000);
    assert.equal(loaded.view.cash.amount, 1800000);
    assert.equal(loaded.state.invoices.length, 12);
    assert.ok(Array.isArray(loaded.collectionsDesk.items));

    const csv = readFileSync(new URL("./samples/valid.csv", import.meta.url), "utf8");
    const preview = await action({ type: "preview", csv, mapping: {} });
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.body.rows.map((x: any) => x.status), ["Ready", "Ready"]);

    const blocked = await action({ type: "import", csv }, "https://untrusted.example");
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.error, /Origin not allowed/);
    assert.equal((await state()).state.invoices.length, 12);

    assert.equal((await action({ type: "import", csv, mapping: {} })).status, 200);
    loaded = await state();
    assert.equal(loaded.state.invoices.length, 14);
    assert.equal(loaded.view.headroom, -650000);

    const newInvoice = loaded.state.invoices.find((x: any) => x.externalKey === "DEMO-2001");
    assert.ok(newInvoice);
    assert.equal((await action({ type: "payment", invoiceId: newInvoice.id, amount: "100.01", date: "2026-11-09" })).status, 200);
    const secondPreview = await action({ type: "preview", csv, mapping: {} });
    assert.deepEqual(secondPreview.body.rows.map((x: any) => x.status), ["Duplicate", "Duplicate"]);
    assert.equal((await action({ type: "import", csv, mapping: {} })).status, 200);
    assert.equal((await state()).state.invoices.length, 14);

    await stopServer(server.process);
    server = null;
    server = await startServer(port, dir);
    loaded = await state();
    assert.equal(loaded.state.invoices.length, 14);
    assert.equal(loaded.state.invoicePayments.filter((x: any) => x.invoiceId === newInvoice.id).length, 2);
    assert.equal(loaded.view.headroom, -650000);
  } finally {
    if (server) await stopServer(server.process);
    rmSync(dir, { recursive: true, force: true });
  }
});
