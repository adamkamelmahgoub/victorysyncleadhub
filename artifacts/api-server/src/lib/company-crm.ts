import {
  validDate,
  validateActivity,
  validateCompany,
  validateTask,
} from "./company-model.js";
import { companyImportRow } from "./company-import.js";
import { importedSocials } from "../../../../lib/social-import.js";
import { socialRest } from "../../../../lib/social-service.js";

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
      if (
        ["42P01", "42703", "PGRST204", "PGRST205", "PGRST202"].includes(
          data.code ?? "",
        )
      )
        throw new CrmError(
          503,
          resource.includes("crm_set_company_trash") || resource.includes("crm_deleted_companies")
            ? "Company deletion needs the database migration 20260907_company_trash.sql applied."
            : "Company CRM needs its database migrations applied: 20260905_company_trials.sql, then 20260906_company_workspace.sql.",
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
    if (path === "/api/company-crm/trash" && method === "GET") {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await rest(`rpc/crm_deleted_companies?limit=500&offset=${offset}`, { method: "POST", body: "{}" });
        rows.push(...page);
        if (page.length < 500) break;
      }
      return { status: 200, data: rows };
    }
    if ((path === "/api/companies" && method === "DELETE") || (path === "/api/company-crm/trash/restore" && method === "POST")) {
      const body = await readBody() as { ids?: unknown[] };
      if (!Array.isArray(body?.ids) || !body.ids.length || body.ids.length > 100 || body.ids.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))
        throw new CrmError(400, "Choose between 1 and 100 valid companies.");
      const rows = await rest("rpc/crm_set_company_trash", { method: "POST", body: JSON.stringify({ company_ids: [...new Set(body.ids)], restore: method === "POST" }) });
      return { status: 200, data: { changed: rows.length } };
    }
    if (path === "/api/companies/import" && method === "POST") {
      const body = await readBody() as { companies?: unknown[] };
      if (!Array.isArray(body?.companies) || !body.companies.length || body.companies.length > 20)
        throw new CrmError(400, "Send between 1 and 20 companies per batch.");
      const errors: string[] = [];
      let imported = 0;
      // Small batches keep requests within serverless time limits. SQL still guards trial overlap.
      for (let start = 0; start < body.companies.length; start += 5) {
        const results = await Promise.allSettled(body.companies.slice(start, start + 5).map(async input => {
          const data = companyImportRow(input);
          const inserted=await rest<Array<{id:string;custom_fields?:Record<string,unknown>}>>("companies", { method: "POST", body: JSON.stringify(data) });
          const row=inserted[0];
          if(!row?.id)return;
          try{
            for(const profile of importedSocials((row.custom_fields||data.custom_fields||{}) as Record<string,unknown>))
              await socialRest('social_profiles?on_conflict=organization_id,platform,normalized_handle,entity_type,entity_id',{
                method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=representation'},
                body:JSON.stringify({organization_id:'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',entity_type:'company',entity_id:row.id,
                  platform:profile.platform,handle:profile.handle,normalized_handle:profile.normalizedHandle,
                  profile_url:profile.profileUrl,source:'import',confidence:90}),
              });
          }catch(error){return `Company ${row.id}: social profile needs review (${error instanceof Error?error.message:String(error)})`;}
          return null;
        }));
        results.forEach((result, index) => {
          if (result.status === "fulfilled") { imported++;if(result.value)errors.push(result.value); }
          else errors.push(`Record ${start + index + 1}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
        });
      }
      return { status: 200, data: { imported, failed: body.companies.length - imported, total: body.companies.length, errors } };
    }
    if (path === "/api/company-crm/tasks" && method === "GET") {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await rest(
          `unified_tasks?select=*&order=due_at.asc.nullslast,created_at.desc,id.desc&limit=500&offset=${offset}`,
        );
        rows.push(...page);
        if (page.length < 500) break;
      }
      return { status: 200, data: rows };
    }
    const unifiedTask=path.match(/^\/api\/company-crm\/tasks\/([0-9a-f-]{36})$/i);
    if(unifiedTask&&method==='PATCH'){
      const body=await readBody() as {status?:unknown};
      if(body.status!=='completed'&&body.status!=='pending')throw new CrmError(400,'Choose a valid task status.');
      const found=await rest(`unified_tasks?id=eq.${unifiedTask[1]}&select=id,source&limit=1`) as Array<{id:string;source:string}>;
      if(!found.length)return {status:404,data:{error:'Task not found.'}};
      const source=found[0].source;
      const updated=await rest(`${source==='contact'?'contact_tasks':'company_tasks'}?id=eq.${unifiedTask[1]}`,
        {method:'PATCH',body:JSON.stringify(source==='contact'?{is_completed:body.status==='completed',
          completed_at:body.status==='completed'?new Date().toISOString():null}:{status:body.status})});
      return updated.length?{status:200,data:updated[0]}:{status:404,data:{error:'Task not found.'}};
    }
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
      /^\/api\/companies\/([0-9a-f-]{36})(\/(?:activities|tasks|files))?(?:\/([0-9a-f-]{36}))?$/i,
    );
    if (!match)
      return { status: 404, data: { error: "Company route not found." } };
    const [, id, child, childId] = match;
    const activities = child === "/activities";
    const rows = await rest(`companies?id=eq.${id}&select=*&limit=1`);
    if (!rows.length)
      return { status: 404, data: { error: "Company not found." } };
    if (!child && childId)
      return { status: 404, data: { error: "Company route not found." } };
    if (child === "/tasks" && method === "POST" && !childId) {
      const data = validateTask(await readBody());
      const saved = await rest("company_tasks", {
        method: "POST",
        body: JSON.stringify({ ...data, company_id: id, created_by: user.id }),
      });
      return { status: 201, data: saved[0] };
    }
    if (child === "/tasks" && method === "PATCH" && childId) {
      const data = validateTask(await readBody(), true);
      const saved = await rest(
        `company_tasks?id=eq.${childId}&company_id=eq.${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
      );
      return saved.length
        ? { status: 200, data: saved[0] }
        : { status: 404, data: { error: "Task not found." } };
    }
    if (
      (child === "/tasks" || child === "/files") &&
      method === "GET" &&
      !childId
    ) {
      const offset = Number(parsed.searchParams.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new CrmError(400, "Invalid page.");
      const table = child === "/tasks" ? "unified_tasks" : "company_files";
      const items = await rest(
        `${table}?company_id=eq.${id}&select=*&order=created_at.desc,id.desc&limit=50&offset=${offset}`,
      );
      return {
        status: 200,
        data: { items, nextOffset: items.length === 50 ? offset + 50 : null },
      };
    }
    if (child === "/files" && method === "POST" && !childId) {
      const input = (await readBody()) as Record<string, unknown>;
      if (
        !input ||
        typeof input !== "object" ||
        typeof input.file_name !== "string" ||
        !input.file_name.trim() ||
        input.file_name.length > 255 ||
        typeof input.storage_path !== "string" ||
        !input.storage_path.startsWith(`${id}/`) ||
        input.storage_path.includes("..") ||
        input.storage_path.length > 500 ||
        typeof input.mime_type !== "string" ||
        input.mime_type.length > 150 ||
        typeof input.size_bytes !== "number" ||
        !Number.isInteger(input.size_bytes) ||
        input.size_bytes < 1 ||
        input.size_bytes > 10485760
      )
        throw new CrmError(
          400,
          "Invalid file. Maximum attachment size is 10 MB.",
        );
      const saved = await rest("company_files", {
        method: "POST",
        body: JSON.stringify({
          company_id: id,
          file_name: input.file_name,
          storage_path: input.storage_path,
          mime_type: input.mime_type,
          size_bytes: input.size_bytes,
          uploaded_by: user.id,
        }),
      });
      return { status: 201, data: saved[0] };
    }
    if (!child && method === "GET") return { status: 200, data: rows[0] };
    if (!child && method === "PATCH") {
      const data = validateCompany(await readBody(), true);
      const saved = await rest(`companies?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return { status: 200, data: saved[0] };
    }
    if (activities && !childId && method === "GET") {
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
    if (activities && !childId && method === "POST") {
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
