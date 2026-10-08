import test from "node:test";
import assert from "node:assert/strict";
import { plainAssistantText } from "../lib/plain-assistant-text.js";

test("turns CRM Markdown tables into readable text and hides record IDs", () => {
  const input = `Here's what the CRM has on **MBC Plumbing**:

| Record ID | Status | Location | Notes |
|---|---|---|---|
| **f9e0e7e9-96a3-4bca-b2b5-3fce1b71a315** | new | Tulsa | AI research says it works in Eureka. |

**Key takeaways**
- The location needs checking.
1. **Enrich** the bare record.`;
  const result = plainAssistantText(input);
  assert.match(result, /MBC Plumbing/);
  assert.match(result, /Status: new/);
  assert.match(result, /Location: Tulsa/);
  assert.match(result, /Key takeaways/);
  assert.doesNotMatch(result, /\*\*|\|---|f9e0e7e9/);
  assert.match(plainAssistantText(input, true), /f9e0e7e9/);
});

test("unwraps an accidental JSON answer", () => {
  assert.equal(plainAssistantText('{"answer":"**Hello** from the CRM."}'), "Hello from the CRM.");
});
