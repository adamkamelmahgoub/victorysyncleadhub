export type SegmentCondition = { field: string; operator: string; value?: string | string[] | boolean };
export type SegmentGroup = { op: "and" | "or"; conditions: Array<SegmentGroup | SegmentCondition> };

const fields = new Set([
  "name", "search", "first_name", "last_name", "company", "email", "phone", "tags", "status", "source",
  "state", "city", "created_at", "last_activity", "has_email", "has_phone", "enrolled_in_sequence", "score",
]);
const operators = new Set(["eq", "neq", "contains", "is_empty", "is_not_empty", "has_any", "has_all", "has_none", "before", "after", "gte", "lte"]);

function condition(field: string, operator: string, value: unknown): SegmentCondition | null {
  if (!fields.has(field) && !/^(custom_fields|other)\.[A-Za-z0-9_]{1,80}$/.test(field)) return null;
  if (!operators.has(operator)) return null;
  if (field === "tags" && !["has_any", "has_all", "has_none"].includes(operator)) return null;
  if ((field === "has_email" || field === "has_phone") && (operator !== "eq" || ![true, false, "true", "false"].includes(value as string | boolean))) return null;
  if (["created_at", "last_activity"].includes(field) && ["before", "after", "gte", "lte"].includes(operator) && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value) || !Number.isFinite(Date.parse(value)))) return null;
  if (field === "score" && ["gte", "lte"].includes(operator) && !Number.isFinite(Number(value))) return null;
  if (Array.isArray(value)) return { field, operator, value: value.filter((item): item is string => typeof item === "string").slice(0, 30) };
  if (typeof value === "boolean") return { field, operator, value };
  if (typeof value === "string" || typeof value === "number") return { field, operator, value: String(value).slice(0, 500) };
  if (operator === "is_empty" || operator === "is_not_empty") return { field, operator };
  return null;
}

export function normalizeSegmentFilters(input: unknown, depth = 0): SegmentGroup {
  if (depth > 4 || !input || typeof input !== "object" || Array.isArray(input)) return { op: "and", conditions: [] };
  const source = input as Record<string, unknown>;
  if (Array.isArray(source.conditions)) {
    const conditions: Array<SegmentGroup | SegmentCondition> = [];
    for (const entry of source.conditions.slice(0, 30) as unknown[]) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const item = entry as Record<string, unknown>;
      if (Array.isArray(item.conditions)) { conditions.push(normalizeSegmentFilters(item, depth + 1)); continue; }
      const parsed = condition(String(item.field ?? ""), String(item.operator ?? "eq"), item.value);
      if (parsed) conditions.push(parsed);
    }
    return { op: source.op === "or" ? "or" : "and", conditions };
  }
  const conditions: SegmentCondition[] = [];
  for (const [key, field, operator] of [
    ["status", "status", "eq"], ["source", "source", "eq"], ["tag", "tags", "has_any"],
    ["tags", "tags", "has_any"], ["search", "search", "contains"],
    ["scoreMin", "score", "gte"], ["scoreMax", "score", "lte"],
  ]) {
    const value = source[key];
    if (value === null || value === undefined || value === "") continue;
    const parsed = condition(field, operator, value);
    if (parsed) conditions.push(parsed);
  }
  return { op: "and", conditions };
}

export function validateSegmentFilters(input: unknown, depth = 0): boolean {
  if (depth > 4 || !input || typeof input !== "object" || Array.isArray(input)) return false;
  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.conditions) || source.conditions.length > 30 || !["and", "or"].includes(String(source.op ?? ""))) return false;
  return source.conditions.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    if ("conditions" in item) return validateSegmentFilters(item, depth + 1);
    return condition(String(item.field ?? ""), String(item.operator ?? "eq"), item.value) !== null;
  });
}

export function segmentFilterSummary(group: SegmentGroup): string {
  if (!group.conditions.length) return "All contacts";
  return group.conditions.map((item) => "conditions" in item ? `(${segmentFilterSummary(item)})` :
    `${item.field.replace(/^custom_fields\./, "Custom: ").replace(/^other\./, "Field: ").replace(/_/g, " ")} ${item.operator.replace(/_/g, " ")} ${Array.isArray(item.value) ? item.value.join(", ") : String(item.value ?? "")}`)
    .join(group.op === "or" ? " OR " : " AND ");
}
