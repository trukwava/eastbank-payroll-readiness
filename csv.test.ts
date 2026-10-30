import { test } from "node:test";
import assert from "node:assert/strict";
import { csvParse, preview, seed } from "./core.ts";

test("parses UTF-8 BOM and CRLF from spreadsheet exports", () => {
  assert.deepEqual(csvParse("\uFEFFfirst,second\r\nfoo,bar\r\n"), [
    ["first", "second"], ["foo", "bar"]
  ]);
});
test("supports quoted commas, escaped quotes and embedded line breaks", () => {
  assert.deepEqual(csvParse('key,"a,b","say ""hello""","line one\nline two"\r\n'), [
    ["key", "a,b", 'say "hello"', "line one\nline two"]
  ]);
});
test("rejects malformed CSV quotes and stray carriage returns", () => {
  for (const source of ['key,"never closed', 'key,ab"cd', 'key,"value"x', 'key,"value""x', 'key,ab\rcd']) {
    assert.throws(() => csvParse(source), /CSV/);
  }
});
test("import preview accepts Excel BOM header without silently changing amounts", () => {
  const file = "\uFEFFexternal_key,project,completion_date,invoice_date,due_date,amount,credit,payment,payment_date\r\n" +
    "CSV-100,Riverside Apartments,2026-11-01,2026-11-08,2026-11-30,100.01,0,0,\r\n";
  const result = preview(seed(), file);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "Ready");
  assert.equal(result[0].normalized.amount, 10001);
});
test("rejects oversized CSV input rather than parsing an unbounded payload", () => {
  assert.throws(() => csvParse("x".repeat(1000001)), /1 MB/);
});
