import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteCompanyBatches } from "../artifacts/leadgen/src/lib/delete-company-batches.js";

test("deletes every selected company beyond 100 in bounded batches", async () => {
  const ids = Array.from({ length: 1251 }, (_, i) => String(i));
  const requests: string[][] = [], progress: number[] = [];
  await deleteCompanyBatches(ids, async batch => { requests.push(batch); }, done => progress.push(done));
  assert.deepEqual(requests.flat(), ids);
  assert.equal(requests.length, 13);
  assert.equal(requests.at(-1)?.length, 51);
  assert.equal(progress.at(-1), 1251);
});
test("stops on failure and resumes without repeating confirmed batches", async () => {
  const ids = Array.from({ length: 250 }, (_, i) => String(i));
  let processed = 0;
  await assert.rejects(deleteCompanyBatches(ids, async batch => { if (batch[0] === "100") throw new Error("Network failure"); }, done => { processed = done; }), /Network/);
  assert.equal(processed, 100);
  const retried: string[] = [];
  await deleteCompanyBatches(ids.slice(processed), async batch => { retried.push(...batch); }, () => {});
  assert.deepEqual(retried, ids.slice(100));
});
