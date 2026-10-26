export const DISPOSITIONS = [
  "no_answer",
  "voicemail",
  "gatekeeper",
  "wrong_number",
  "not_interested",
  "callback_scheduled",
  "meeting_booked",
  "dnc",
] as const;
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Adak",
  "Pacific/Honolulu",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Indiana/Knox",
  "America/Indiana/Tell_City",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Vevay",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Menominee",
  "America/North_Dakota/Beulah",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/Toronto",
  "Europe/Amsterdam",
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];
export function terminal(disposition: string | null) {
  return (
    disposition !== null &&
    ["wrong_number", "not_interested", "dnc"].includes(disposition)
  );
}
export function validateNextAction(
  disposition: string | null,
  nextActionAt: string | null,
) {
  if (
    disposition !== null &&
    !(DISPOSITIONS as readonly string[]).includes(disposition)
  )
    throw new Error("Invalid disposition");
  if (!terminal(disposition) && !nextActionAt)
    throw new Error("A next action is required");
  if (
    nextActionAt &&
    (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(nextActionAt) ||
      !Number.isFinite(Date.parse(nextActionAt)))
  )
    throw new Error("Next action must be an ISO date with a timezone offset");
}
export function parseCall(input: unknown) {
  const body = input as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.disposition !== "string" ||
    !(DISPOSITIONS as readonly string[]).includes(body.disposition)
  )
    throw new Error("Choose a fixed call disposition");
  if (
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.requestId,
    )
  )
    throw new Error("A UUID requestId is required");
  const nextActionAt =
    typeof body.nextActionAt === "string" ? body.nextActionAt : null;
  validateNextAction(body.disposition, nextActionAt);
  if (
    body.notes !== undefined &&
    (typeof body.notes !== "string" || body.notes.length > 10000)
  )
    throw new Error("Notes must be at most 10000 characters");
  return {
    p_disposition: body.disposition as Disposition,
    p_next_action_at: terminal(body.disposition) ? null : nextActionAt,
    p_notes: String(body.notes ?? ""),
    p_request_id: body.requestId,
  };
}
export function parseOutreachUpdate(input: unknown) {
  const b = input as Record<string, unknown> | null;
  if (!b || typeof b !== "object")
    throw new Error("An outreach update is required");
  const values: Record<string, unknown> = {};
  if (b.timezone !== undefined) {
    if (
      typeof b.timezone !== "string" ||
      !(TIMEZONES as readonly string[]).includes(b.timezone)
    )
      throw new Error("Choose a supported timezone");
    values.timezone = b.timezone;
    values.timezone_confirmed = true;
  }
  for (const [key, field] of [
    ["avgJobValue", "avg_job_value"],
    ["missedCallsPerWeek", "missed_calls_per_week"],
  ] as const) {
    if (b[key] === undefined) continue;
    if (
      b[key] !== null &&
      (typeof b[key] !== "number" ||
        !Number.isFinite(b[key]) ||
        b[key] < 0 ||
        (key === "missedCallsPerWeek" && !Number.isInteger(b[key])))
    )
      throw new Error(`${key} must be a non-negative number`);
    values[field] = b[key];
  }
  if (b.afterHoursCoverage !== undefined) {
    if (
      b.afterHoursCoverage !== null &&
      (typeof b.afterHoursCoverage !== "string" ||
        b.afterHoursCoverage.length > 2000)
    )
      throw new Error("Invalid after-hours coverage");
    values.after_hours_coverage = b.afterHoursCoverage;
  }
  if (b.usesAnsweringService !== undefined) {
    if (
      b.usesAnsweringService !== null &&
      typeof b.usesAnsweringService !== "boolean"
    )
      throw new Error("Invalid answering service value");
    values.uses_answering_service = b.usesAnsweringService;
  }
  if (b.suppressedReason !== undefined) {
    if (
      !["dnc", "unsubscribed", "bounced_hard", "manual_exclude"].includes(
        String(b.suppressedReason),
      )
    )
      throw new Error("Invalid suppression reason");
    values.suppressed_reason = b.suppressedReason;
    if (b.suppressedReason === "dnc") values.dnc = true;
  }
  if (!Object.keys(values).length)
    throw new Error("No outreach fields supplied");
  return values;
}
