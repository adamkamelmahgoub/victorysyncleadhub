import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSegmentFilters, segmentFilterSummary } from "../lib/segment-filters.ts";

test("legacy tagged segment becomes a smart filter", () => {
  assert.deepEqual(normalizeSegmentFilters({ tags: ["top3-prospect"] }), {
    op: "and", conditions: [{ field: "tags", operator: "has_any", value: ["top3-prospect"] }],
  });
});

test("nested AND and OR groups are retained and summarized", () => {
  const filters = normalizeSegmentFilters({ op: "and", conditions: [
    { field: "state", operator: "eq", value: "TX" },
    { op: "or", conditions: [
      { field: "tags", operator: "has_any", value: ["roofing"] },
      { field: "custom_fields.trade", operator: "eq", value: "roofing" },
    ] },
  ] });
  assert.equal(filters.conditions.length, 2);
  assert.match(segmentFilterSummary(filters), /state eq TX AND/);
});
