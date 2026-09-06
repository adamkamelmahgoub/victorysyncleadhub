export const COMPANY_STAGES = [
  "new",
  "contacted",
  "engaged",
  "qualified",
  "trial_booked",
  "trial_active",
  "trial_completed",
  "client",
  "disqualified",
] as const;
export const CALL_OUTCOMES = [
  "no_answer",
  "voicemail",
  "not_interested",
  "conversation",
  "qualified",
  "trial_booked",
  "callback_requested",
  "appointment_booked",
] as const;
export type CompanyStage = (typeof COMPANY_STAGES)[number];
export type Direction = "inbound" | "outbound";
export interface Company {
  id: string;
  name: string;
  phone: string;
  city: string;
  state: string;
  industry: string;
  contact_name: string;
  fit_notes: string;
  source: string;
  stage: CompanyStage;
  needs_verification: boolean;
  trial_type: Direction | null;
  trial_start_date: string | null;
  trial_end_date: string | null;
  trial_capacity_slot: string | null;
  created_at: string;
  updated_at: string;
}
export interface CompanyActivity {
  id: string;
  company_id: string;
  direction: Direction;
  outcome: (typeof CALL_OUTCOMES)[number];
  response_time_minutes: number | null;
  notes: string;
  occurred_at: string;
  logged_by: string;
}
export interface CompanyKpis {
  daily: {
    day: string;
    outbound_dials: number;
    inbound_leads: number;
    appointments_booked: number;
    average_response_minutes: number | null;
    response_samples: number;
  }[];
  trials_active: number;
  trials_awaiting_close: number;
}
export const label = (value: string) =>
  value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function trialEndDate(start: string): string {
  if (!validDate(start)) throw new Error("Choose a valid trial start date.");
  const date = new Date(`${start}T12:00:00Z`);
  if ([0, 6].includes(date.getUTCDay()))
    throw new Error("Trials must start on a weekday.");
  let remaining = 2;
  while (remaining) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay())) remaining--;
  }
  return date.toISOString().slice(0, 10);
}
export function validateCompany(
  input: unknown,
  partial = false,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected company fields.");
  const body = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of [
    "name",
    "phone",
    "city",
    "state",
    "industry",
    "contact_name",
    "fit_notes",
    "source",
  ]) {
    if (field in body) {
      if (
        typeof body[field] !== "string" ||
        body[field].length > (field === "fit_notes" ? 10000 : 500)
      )
        throw new Error(`Invalid ${label(field)}.`);
      result[field] = body[field].trim();
    }
  }
  if ((!partial || "name" in body) && !result.name)
    throw new Error("Company name is required.");
  if ("stage" in body) {
    if (!COMPANY_STAGES.includes(body.stage as CompanyStage))
      throw new Error("Invalid company stage.");
    result.stage = body.stage;
  }
  if ("needs_verification" in body) {
    if (typeof body.needs_verification !== "boolean")
      throw new Error("Verification must be true or false.");
    result.needs_verification = body.needs_verification;
  }
  if ("trial_type" in body) {
    if (
      body.trial_type !== null &&
      body.trial_type !== "inbound" &&
      body.trial_type !== "outbound"
    )
      throw new Error("Choose inbound or outbound.");
    result.trial_type = body.trial_type;
  }
  for (const field of ["trial_start_date", "trial_end_date"]) {
    if (field in body) {
      if (body[field] !== null && !validDate(body[field]))
        throw new Error(`Invalid ${label(field)}.`);
      result[field] = body[field];
    }
  }
  if ("trial_capacity_slot" in body) {
    if (
      body.trial_capacity_slot !== null &&
      (typeof body.trial_capacity_slot !== "string" ||
        body.trial_capacity_slot.length > 100)
    )
      throw new Error("Invalid capacity slot.");
    result.trial_capacity_slot = body.trial_capacity_slot;
  }
  // SQL validates the complete resulting row, including partial stage/date changes.
  return result;
}
export function validateActivity(
  input: unknown,
  userId: string,
): Record<string, unknown> {
  if (!input || typeof input !== "object")
    throw new Error("Expected activity fields.");
  const body = input as Record<string, unknown>;
  if (body.direction !== "inbound" && body.direction !== "outbound")
    throw new Error("Choose an activity direction.");
  if (!CALL_OUTCOMES.includes(body.outcome as (typeof CALL_OUTCOMES)[number]))
    throw new Error("Choose a valid outcome.");
  const response = body.response_time_minutes ?? null;
  if (
    response !== null &&
    (typeof response !== "number" || !Number.isFinite(response) || response < 0)
  )
    throw new Error("Response time must be a non-negative number.");
  if (body.direction === "outbound" && response !== null)
    throw new Error("Response time is for inbound leads only.");
  if (
    typeof body.occurred_at !== "string" ||
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.occurred_at) ||
    Number.isNaN(Date.parse(body.occurred_at))
  )
    throw new Error("Choose a valid activity timestamp.");
  if (typeof body.notes !== "string" || body.notes.length > 10000)
    throw new Error("Notes must be text under 10,000 characters.");
  return {
    direction: body.direction,
    outcome: body.outcome,
    response_time_minutes: response,
    occurred_at: new Date(body.occurred_at).toISOString(),
    notes: body.notes.trim(),
    logged_by: userId,
  };
}
