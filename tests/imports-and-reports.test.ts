import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCSV } from "../artifacts/leadgen/src/lib/csv.js";
import { companyImportRow } from "../artifacts/api-server/src/lib/company-import.js";
import { companyCrmRequest } from "../artifacts/api-server/src/lib/company-crm.js";
import { leadReports } from "../artifacts/api-server/src/lib/lead-reports.js";

test("spreadsheet parsing and company import preserve quoted notes and optional fields", () => {
  assert.deepEqual(
    parseCSV(
      '\uFEFFCompany,Notes\r\n"Acme, Inc","Said ""yes""\nCall Monday"\r\n',
    ),
    {
      headers: ["Company", "Notes"],
      rows: [["Acme, Inc", 'Said "yes"\nCall Monday']],
    },
  );
  assert.throws(() => parseCSV('Company\n"Incomplete'), /unclosed/);
  const unnamed = companyImportRow({
    phone: "555-0100",
    name: "",
    city: "Phoenix",
  });
  assert.equal(unnamed.name, "Unnamed company");
  assert.equal(unnamed.needs_verification, true);
  assert.equal(unnamed.phone, "555-0100");
  const trial = companyImportRow({
    name: "Roofing Co",
    stage: "Trial Booked",
    trial_type: "Inbound",
    trial_start_date: "2026-09-10",
    tags: "roofing;local",
    expected_daily_leads: "10",
    website: "example.com",
  });
  assert.equal(trial.trial_end_date, "2026-09-14");
  assert.equal(trial.trial_capacity_slot, "solo-inbound");
  assert.equal(trial.website, "https://example.com");
  assert.deepEqual(trial.tags, ["roofing", "local"]);
  assert.throws(
    () => companyImportRow({ trial_start_date: "bad" }),
    /valid trial/,
  );
});

test("company import reports individual failures, preserves RLS and blocks viewers", async () => {
  process.env.SUPABASE_URL = "https://reports-test.invalid";
  process.env.SUPABASE_ANON_KEY = "test-key";
  const previous = globalThis.fetch;
  const saved: any[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://reports-test.invalid/rest/v1/companies");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer user-token",
    );
    const row = JSON.parse(String(init?.body));
    if (row.name === "Overlap")
      return Response.json({ code: "23P01" }, { status: 409 });
    saved.push(row);
    return Response.json([{ ...row, id: "test-id" }]);
  };
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    user_metadata: { role: "owner" },
  };
  try {
    const result = await companyCrmRequest(
      "POST",
      "/api/companies/import",
      "Bearer user-token",
      user,
      async () => ({
        companies: [
          { phone: "555" },
          { name: "Overlap" },
          { name: "Invalid", stage: "unknown" },
          { name: "Saved" },
        ],
      }),
    );
    assert.equal(result.status, 200);
    assert.equal((result.data as any).imported, 2);
    assert.equal((result.data as any).failed, 2);
    assert.match((result.data as any).errors[0], /Record 2:.*overlaps/);
    assert.match((result.data as any).errors[1], /Record 3:/);
    const denied = await companyCrmRequest(
      "POST",
      "/api/companies/import",
      "Bearer user-token",
      { ...user, user_metadata: { role: "viewer" } },
      async () => ({ companies: [{}] }),
    );
    assert.equal(denied.status, 403);
    assert.equal(saved.length, 2);
  } finally {
    globalThis.fetch = previous;
  }
});

test("reports count real records, blank sources, unassigned campaigns and UTC dates", () => {
  const report = leadReports(
    [
      {
        id: 1,
        status: "new",
        source: "",
        score: 0,
        created_at: "2026-09-07T00:00:00Z",
      },
      {
        id: 2,
        status: "converted",
        source: "CSV",
        score: 80,
        campaign_id: "campaign-1",
        created_at: "2026-09-06T23:59:00Z",
      },
    ],
    [{ id: "campaign-1", name: "Outbound" }],
    new Date("2026-09-07T12:00:00Z"),
  );
  assert.equal(report.overview.totalLeads, 2);
  assert.equal(report.overview.conversionRate, 50);
  assert.equal(report.overview.newLeadsToday, 1);
  assert.equal(report.overview.averageScore, 40);
  assert.deepEqual(report.timeline.slice(-2), [
    { date: "2026-09-06", count: 1 },
    { date: "2026-09-07", count: 1 },
  ]);
  assert.equal(
    report["by-campaign"].find((row) => row.campaignName === "No campaign")
      ?.count,
    1,
  );
  assert.equal(
    report["by-source"].find((row) => row.source === "Unknown")?.count,
    1,
  );
  assert.equal(leadReports([]).overview.totalLeads, 0);
});

test("production analytics endpoints page through records and retain client scope", async () => {
  process.env.SUPABASE_URL = "https://reports-test.invalid";
  process.env.SUPABASE_ANON_KEY = "test-key";
  const { default: handler } = await import("../api/[...path].js");
  const token = `e30.${Buffer.from(JSON.stringify({ sub: "user-id", crm_role: "owner", crm_client_account_id: "client-id" })).toString("base64url")}.sig`;
  const previous = globalThis.fetch;
  let pages = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        id: "user-id",
        user_metadata: { role: "owner", client_account_id: "client-id" },
      });
    if (url.pathname === "/rest/v1/portal_activity_log") return Response.json([]);
    if (url.pathname === "/rest/v1/campaigns") return Response.json([]);
    assert.equal(url.pathname, "/rest/v1/leads");
    assert.equal(url.searchParams.get("client_account_id"), "eq.client-id");
    pages++;
    const length = url.searchParams.get("offset") === "0" ? 500 : 1;
    return Response.json(
      Array.from({ length }, (_, index) => ({
        id: index,
        status: "new",
        source: null,
        score: 0,
        created_at: "2026-09-07T00:00:00Z",
      })),
    );
  };
  try {
    let result: any;
    const res = {
      statusCode: 0,
      setHeader() {},
      end(body?: string) {
        result = JSON.parse(body!);
      },
    };
    await handler(
      {
        method: "GET",
        url: "/api/analytics/overview",
        headers: { authorization: `Bearer ${token}` },
        on() {},
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(result.totalLeads, 501);
    assert.equal(pages, 2);
    for (const route of ["by-status", "by-source", "by-campaign", "timeline", "attribution"]) {
      await handler({ method: "GET", url: `/api/analytics/${route}`, headers: { authorization: `Bearer ${token}` }, on() {} }, res);
      assert.equal(res.statusCode, 200, route);
      if (route === "attribution") {
        assert.equal(result.total, 501);
        assert.equal(result.bySource[0].count, 501);
        assert.equal(result.byCampaign[0].campaignName, "No campaign");
      } else assert.ok(Array.isArray(result) && result.length > 0, route);
    }
    globalThis.fetch = async (input) =>
      String(input).includes("/auth/")
        ? Response.json({ id: "user-id", user_metadata: { role: "owner" } })
        : Response.json(
            { message: "Report database unavailable" },
            { status: 503 },
          );
    await handler(
      {
        method: "GET",
        url: "/api/analytics/overview",
        headers: { authorization: `Bearer ${token}` },
        on() {},
      },
      res,
    );
    assert.ok(res.statusCode >= 400);
    assert.match(JSON.stringify(result), /Report database unavailable/);
  } finally {
    globalThis.fetch = previous;
  }
});
