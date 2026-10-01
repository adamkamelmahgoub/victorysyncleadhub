export const COMPANY_STAGES = [
  "new",
  "contacted",
  "engaged",
  "qualified",
  "meeting_booked",
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
export interface CompanyContact {
  name: string;
  role: string;
  email: string;
  phone: string;
}
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
  meeting_at?: string | null;
  meeting_timezone?: string | null;
  meeting_booked_by?: string | null;
  meeting_booked_at?: string | null;
  created_at: string;
  updated_at: string;
  email?: string;
  website?: string;
  address?: string;
  postal_code?: string;
  country?: string;
  tags?: string[];
  contacts?: CompanyContact[];
  custom_fields?: Record<string, string>;
  next_action?: string;
  next_follow_up_at?: string | null;
  coverage_hours?: string;
  coverage_timezone?: string;
  expected_daily_leads?: number | null;
  trial_success_criteria?: string;
  trial_results?: string;
  proposed_monthly_price?: number | null;
  currency?: string;
  close_call_at?: string | null;
  close_notes?: string;
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
export interface CompanyTask {
  id: string;
  company_id: string;
  title: string;
  kind: "task" | "callback" | "email" | "meeting" | "close_call";
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "normal" | "high";
  due_at: string | null;
  assignee: string;
  notes: string;
  created_by: string;
  created_at: string;
}
export interface CompanyFile {
  id: string;
  company_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by: string;
}
export function validateTask(
  input: unknown,
  partial = false,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected task fields.");
  const body = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ["title", "assignee", "notes"])
    if (key in body) {
      if (
        typeof body[key] !== "string" ||
        body[key].length > (key === "notes" ? 10000 : 500)
      )
        throw new Error(`Invalid task ${key}.`);
      result[key] = body[key].trim();
    }
  if ((!partial || "title" in body) && !result.title)
    throw new Error("Task title is required.");
  for (const [key, values] of Object.entries({
    kind: ["task", "callback", "email", "meeting", "close_call"],
    status: ["pending", "in_progress", "completed"],
    priority: ["low", "normal", "high"],
  }))
    if (key in body) {
      if (!values.includes(String(body[key])))
        throw new Error(`Invalid task ${key}.`);
      result[key] = body[key];
    }
  if ("due_at" in body) {
    const value = body.due_at;
    if (
      value !== null &&
      (typeof value !== "string" ||
        !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
        Number.isNaN(Date.parse(value)))
    )
      throw new Error("Choose a valid task due time.");
    result.due_at = value;
  }
  return result;
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
    "email",
    "website",
    "address",
    "postal_code",
    "country",
    "next_action",
    "coverage_hours",
    "coverage_timezone",
    "trial_success_criteria",
    "trial_results",
    "currency",
    "close_notes",
  ]) {
    if (field in body) {
      if (
        typeof body[field] !== "string" ||
        body[field].length >
          ([
            "fit_notes",
            "trial_results",
            "trial_success_criteria",
            "close_notes",
          ].includes(field)
            ? 10000
            : 500)
      )
        throw new Error(`Invalid ${label(field)}.`);
      result[field] = body[field].trim();
    }
  }
  if ((!partial || "name" in body) && !result.name)
    throw new Error("Company name is required.");
  if (
    typeof result.email === "string" &&
    result.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)
  )
    throw new Error("Enter a valid company email.");
  if (typeof result.website === "string" && result.website) {
    let url: URL;
    try {
      url = new URL(result.website);
    } catch {
      throw new Error("Website must start with https:// or http://.");
    }
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("Website must use https:// or http://.");
  }
  if ("tags" in body) {
    if (
      !Array.isArray(body.tags) ||
      body.tags.length > 30 ||
      body.tags.some((tag) => typeof tag !== "string" || tag.trim().length > 60)
    )
      throw new Error("Use up to 30 tags, each under 60 characters.");
    result.tags = [
      ...new Set(body.tags.map((tag: string) => tag.trim()).filter(Boolean)),
    ];
  }
  if ("contacts" in body) {
    if (!Array.isArray(body.contacts) || body.contacts.length > 30)
      throw new Error("Use up to 30 company contacts.");
    result.contacts = body.contacts.map((contact) => {
      if (!contact || typeof contact !== "object" || Array.isArray(contact))
        throw new Error("Invalid company contact.");
      const row: Record<string, string> = {};
      for (const key of ["name", "role", "email", "phone"]) {
        if (typeof contact[key] !== "string" || contact[key].length > 500)
          throw new Error(`Invalid contact ${key}.`);
        row[key] = contact[key].trim();
      }
      if (!row.name) throw new Error("Each contact needs a name.");
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
        throw new Error("Enter a valid contact email.");
      return row;
    });
  }
  if ("custom_fields" in body) {
    const fields = body.custom_fields;
    if (
      !fields ||
      typeof fields !== "object" ||
      Array.isArray(fields) ||
      Object.keys(fields).length > 30
    )
      throw new Error("Use up to 30 custom fields.");
    const entries = Object.entries(fields);
    if (
      entries.some(
        ([key, value]) =>
          !key.trim() ||
          key.length > 60 ||
          ["__proto__", "constructor", "prototype"].includes(key.trim()) ||
          typeof value !== "string" ||
          value.length > 2000,
      )
    )
      throw new Error(
        "Custom fields need a name (up to 60 characters) and a text value (up to 2,000 characters).",
      );
    result.custom_fields = Object.fromEntries(
      entries.map(([key, value]) => [key.trim(), (value as string).trim()]),
    );
  }
  for (const field of ["next_follow_up_at", "close_call_at", "meeting_at"]) {
    if (field in body) {
      const value = body[field];
      if (
        value !== null &&
        (typeof value !== "string" ||
          !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
          Number.isNaN(Date.parse(value)))
      )
        throw new Error(`Choose a valid ${label(field)}.`);
      result[field] = value;
    }
  }
  for (const field of ["expected_daily_leads", "proposed_monthly_price"]) {
    if (field in body) {
      const value = body[field];
      if (
        value !== null &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          (field === "expected_daily_leads" &&
            (!Number.isInteger(value) || value > 2147483647)))
      )
        throw new Error(`Invalid ${label(field)}.`);
      result[field] = value;
    }
  }
  if (result.currency && !/^[A-Z]{3}$/.test(String(result.currency)))
    throw new Error("Currency must be a three-letter code, such as USD.");
  if (result.coverage_timezone) {
    try {
      new Intl.DateTimeFormat("en", {
        timeZone: String(result.coverage_timezone),
      });
    } catch {
      throw new Error(
        "Enter a valid coverage timezone, such as America/New_York.",
      );
    }
  }
  if ("stage" in body) {
    if (!COMPANY_STAGES.includes(body.stage as CompanyStage))
      throw new Error("Invalid company stage.");
    result.stage = body.stage;
    if (body.stage === "meeting_booked" &&
        (typeof body.meeting_at !== "string" || Number.isNaN(Date.parse(body.meeting_at))))
      throw new Error("Meeting date and time are required for Meeting Booked.");
  }
  if ("meeting_timezone" in body) {
    if (body.meeting_timezone !== null &&
        (typeof body.meeting_timezone !== "string" || body.meeting_timezone.length > 100))
      throw new Error("Invalid meeting timezone.");
    result.meeting_timezone = body.meeting_timezone;
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
