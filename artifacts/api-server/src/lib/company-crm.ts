import {
  validDate,
  validateActivity,
  validateCompany,
} from "./company-model.js";

type User = { id: string; user_metadata?: Record<string, unknown> };
type Result = { status: number; data: unknown };
class CrmError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Shared by Vercel and Express. Forward the user's JWT, so database RLS also applies.
export async function companyCrmRequest(
  method: string,
  url: string,
  token: string,
  user: User,
  readBody: () => Promise<unknown>,
): Promise<Result> {
  const parsed = new URL(url, "https://local.invalid");
  const path = parsed.pathname.replace(/^\/leadgen(?=\/api\/)/, "");
  const metadata = user.user_metadata ?? {};
  if (
    metadata.client_account_id ||
    ["inactive", "deactivated"].includes(String(metadata.status)) ||
    (method !== "GET" && metadata.role === "viewer") ||
    (metadata.role !== "owner" &&
      Array.isArray(metadata.page_permissions) &&
      !metadata.page_permissions.includes("pipeline"))
  ) {
    return {
      status: 403,
      data: { error: "Company CRM requires internal pipeline access." },
    };
  }
  async function rest<T = unknown[]>(
    resource: string,
    init: RequestInit = {},
  ): Promise<T> {
    const base = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!base || !key) throw new CrmError(503, "Supabase is not configured.");
    const response = await fetch(`${base}/rest/v1/${resource}`, {
      ...init,
      headers: {
        apikey: key,
        authorization: token,
        "content-type": "application/json",
        prefer: "return=representation",
      },
    });
    const data = (await response.json()) as { code?: string; message?: string };
    if (!response.ok) {
      if (data.code === "23P01")
        throw new CrmError(
          409,
          "This inbound trial overlaps another booked or active trial. Choose a different start date in the trial queue.",
        );
      if (["42P01", "PGRST205", "PGRST202"].includes(data.code ?? ""))
        throw new CrmError(
          503,
          "Company CRM needs the 20260905_company_trials.sql migration applied to Supabase.",
        );
      if (data.code === "23514")
        throw new CrmError(
          400,
          "Trials need an inbound/outbound type, three business days starting on a weekday, and a capacity slot. Inbound trials use solo-inbound.",
        );
      if (data.code === "23503") throw new CrmError(404, "Company not found.");
      throw new CrmError(
        response.status,
        data.message || "Company CRM request failed.",
      );
    }
    return data as T;
  }
  try {
    if (path === "/api/company-crm/kpis" && method === "GET") {
      const from = parsed.searchParams.get("from");
      const to = parsed.searchParams.get("to");
      const timezone = parsed.searchParams.get("timezone") ?? "UTC";
      if (
        !validDate(from) ||
        !validDate(to) ||
        to < from ||
        (Date.parse(to) - Date.parse(from)) / 86400000 > 366
      )
        throw new CrmError(
          400,
          "Choose a valid report window of at most 367 days.",
        );
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone });
      } catch {
        throw new CrmError(400, "Invalid report timezone.");
      }
      return {
        status: 200,
        data: await rest("rpc/company_crm_kpis", {
          method: "POST",
          body: JSON.stringify({
            from_date: from,
            to_date: to,
            report_timezone: timezone,
          }),
        }),
      };
    }
    if (path === "/api/companies" && method === "GET") {
      const rows: unknown[] = [];
      // Explicit paging avoids Supabase's default 1,000-row cap hiding companies/bookings.
      for (let offset = 0; ; offset += 500) {
        const page = (await rest(
          `companies?select=*&order=created_at.desc,id.desc&limit=500&offset=${offset}`,
        )) as unknown[];
        rows.push(...page);
        if (page.length < 500) break;
      }
      return { status: 200, data: rows };
    }
    if (path === "/api/companies" && method === "POST") {
      const data = validateCompany(await readBody());
      const rows = await rest("companies", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return { status: 201, data: rows[0] };
    }
    const match = path.match(
      /^\/api\/companies\/([0-9a-f-]{36})(\/activities)?$/i,
    );
    if (!match)
      return { status: 404, data: { error: "Company route not found." } };
    const [, id, activities] = match;
    const rows = await rest(`companies?id=eq.${id}&select=*&limit=1`);
    if (!rows.length)
      return { status: 404, data: { error: "Company not found." } };
    if (!activities && method === "GET") return { status: 200, data: rows[0] };
    if (!activities && method === "PATCH") {
      const data = validateCompany(await readBody(), true);
      const saved = await rest(`companies?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return { status: 200, data: saved[0] };
    }
    if (activities && method === "GET") {
      const offset = Number(parsed.searchParams.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new CrmError(400, "Invalid activity page.");
      const items = await rest(
        `company_activities?company_id=eq.${id}&select=*&order=occurred_at.desc,id.desc&limit=50&offset=${offset}`,
      );
      return {
        status: 200,
        data: { items, nextOffset: items.length === 50 ? offset + 50 : null },
      };
    }
    if (activities && method === "POST") {
      const data = validateActivity(await readBody(), user.id);
      const saved = await rest("company_activities", {
        method: "POST",
        body: JSON.stringify({ ...data, company_id: id }),
      });
      return { status: 201, data: saved[0] };
    }
    return { status: 405, data: { error: "Method not allowed." } };
  } catch (error) {
    return {
      status:
        error instanceof CrmError
          ? error.status
          : error instanceof TypeError
            ? 502
            : 400,
      data: {
        error:
          error instanceof Error
            ? error.message
            : "Company CRM request failed.",
      },
    };
  }
}
