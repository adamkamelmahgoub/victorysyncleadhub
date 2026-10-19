import assert from "node:assert/strict";
import test from "node:test";
import { cacheScope, clearApiCache, isCacheablePath, readApiCache, writeApiCache } from "../artifacts/leadgen/src/lib/api-cache";

const entries = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  get length() { return entries.size; },
  key(index: number) { return [...entries.keys()][index] ?? null; },
  getItem(key: string) { return entries.get(key) ?? null; },
  setItem(key: string, value: string) { entries.set(key, value); },
  removeItem(key: string) { entries.delete(key); },
} });

test("contact data cache is scoped and cleared after edits", () => {
  const path = "/api/leads?page=1&includeActivity=false";
  assert.equal(isCacheablePath(path), true);
  assert.equal(isCacheablePath("/api/leads/123"), false);
  writeApiCache("user-a", path, { leads: [{ id: "1" }] });
  assert.deepEqual(readApiCache("user-a", path), { leads: [{ id: "1" }] });
  assert.equal(readApiCache("user-b", path), undefined);
  clearApiCache();
  assert.equal(readApiCache("user-a", path), undefined);
});

test("cache scope changes with permissions", () => {
  const token = (role: string) => `header.${btoa(JSON.stringify({ crm_role: role }))}.signature`;
  assert.notEqual(cacheScope("user-a", token("owner")), cacheScope("user-a", token("client")));
});
