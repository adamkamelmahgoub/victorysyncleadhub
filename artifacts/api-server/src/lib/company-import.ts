import { trialEndDate, validateCompany } from "./company-model.js";

export function companyImportRow(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected company fields.");
  const row = { ...input } as Record<string, unknown>;
  // Blank spreadsheet cells use database defaults, including optional dates/numbers.
  for (const key of Object.keys(row))
    if (typeof row[key] === "string" && !row[key].trim()) delete row[key];
  if (!row.name) {
    row.name = "Unnamed company";
    row.needs_verification = true;
  }
  row.stage ??= "new";
  for (const field of ["stage", "trial_type"])
    if (typeof row[field] === "string")
      row[field] = row[field].trim().toLowerCase().replace(/[ -]+/g, "_");
  if (typeof row.needs_verification === "string") {
    const value = row.needs_verification.trim().toLowerCase();
    if (!["true", "false", "yes", "no", "1", "0"].includes(value))
      throw new Error("Verification must be yes/no or true/false.");
    row.needs_verification = ["true", "yes", "1"].includes(value);
  }
  if (typeof row.tags === "string")
    row.tags = row.tags
      .split(/[;,]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  for (const field of ["expected_daily_leads", "proposed_monthly_price"])
    if (typeof row[field] === "string") row[field] = Number(row[field]);
  if (typeof row.currency === "string")
    row.currency = row.currency.toUpperCase();
  if (
    typeof row.website === "string" &&
    !/^[a-z][a-z\d+.-]*:/i.test(row.website)
  )
    row.website = `https://${row.website}`;
  if (typeof row.trial_start_date === "string" && !row.trial_end_date)
    row.trial_end_date = trialEndDate(row.trial_start_date);
  if (row.trial_type === "inbound") row.trial_capacity_slot ??= "solo-inbound";
  if (row.trial_type === "outbound") row.trial_capacity_slot ??= "outbound";
  return validateCompany(row);
}
