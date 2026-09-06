import assert from "node:assert/strict";
import { test } from "node:test";
import {
  trialEndDate,
  validDate,
  validateActivity,
  validateCompany,
  validateTask,
} from "../artifacts/api-server/src/lib/company-model.ts";
test("expanded company fields validate contacts, URLs, properties and follow-ups", () => {
  const input = {
    name: "Trade Co",
    email: "owner@example.com",
    website: "https://example.com",
    tags: ["HVAC", " HVAC "],
    contacts: [
      { name: "Owner", role: "GM", phone: "555", email: "owner@example.com" },
    ],
    custom_fields: { Territory: "West" },
    proposed_monthly_price: 1250,
    expected_daily_leads: 25,
    currency: "USD",
    next_follow_up_at: "2026-09-10T10:00:00Z",
  };
  assert.deepEqual(validateCompany(input).tags, ["HVAC"]);
  assert.throws(
    () => validateCompany({ ...input, website: "javascript:alert(1)" }),
    /Website/,
  );
  assert.throws(
    () =>
      validateCompany({
        ...input,
        contacts: [{ name: "", role: "", phone: "", email: "" }],
      }),
    /name/,
  );
  assert.throws(
    () => validateCompany({ ...input, proposed_monthly_price: -1 }),
    /price/i,
  );
  assert.throws(
    () => validateCompany({ ...input, next_follow_up_at: "tomorrow" }),
    /valid/,
  );
  assert.deepEqual(
    validateTask({ status: "completed", created_by: "forged" }, true),
    { status: "completed" },
  );
  assert.throws(() => validateTask({ title: "", kind: "task" }), /required/);
  assert.throws(
    () => validateTask({ title: "Call", due_at: "yesterday" }),
    /due/,
  );
});
import { companyCrmRequest } from "../artifacts/api-server/src/lib/company-crm.ts";

test("three-day trials include the start day and cross weekends, years and leap days", () => {
  assert.equal(trialEndDate("2026-09-07"), "2026-09-09");
  assert.equal(trialEndDate("2026-09-10"), "2026-09-14");
  assert.equal(trialEndDate("2026-09-11"), "2026-09-15");
  assert.equal(trialEndDate("2026-12-31"), "2027-01-04");
  assert.equal(trialEndDate("2028-02-28"), "2028-03-01");
  assert.throws(() => trialEndDate("2026-09-05"), /weekday/);
  assert.equal(validDate("2026-02-30"), false);
});
test("company input permits free-text industry and whitelists editable fields", () => {
  assert.deepEqual(
    validateCompany({
      name: " Acme ",
      industry: "Garage doors & HVAC",
      id: "forged",
      unknown: true,
    }),
    { name: "Acme", industry: "Garage doors & HVAC" },
  );
  assert.throws(() => validateCompany({ name: " " }), /required/);
  assert.throws(() => validateCompany({ stage: "trial" }, true), /stage/);
  assert.throws(
    () => validateCompany({ needs_verification: "false" }, true),
    /Verification/,
  );
});
test("activity validation preserves zero, excludes unmeasured response and overwrites forged user attribution", () => {
  const input = {
    direction: "inbound",
    outcome: "appointment_booked",
    notes: "",
    occurred_at: "2026-09-07T09:00:00-04:00",
    response_time_minutes: 0,
    logged_by: "forged",
  };
  assert.deepEqual(validateActivity(input, "real-user"), {
    ...input,
    logged_by: "real-user",
    occurred_at: "2026-09-07T13:00:00.000Z",
  });
  assert.equal(
    validateActivity({ ...input, response_time_minutes: null }, "real-user")
      .response_time_minutes,
    null,
  );
  assert.throws(
    () =>
      validateActivity({ ...input, response_time_minutes: -1 }, "real-user"),
    /non-negative/,
  );
  assert.throws(
    () =>
      validateActivity(
        { ...input, response_time_minutes: Infinity },
        "real-user",
      ),
    /non-negative/,
  );
  assert.throws(
    () => validateActivity({ ...input, direction: "outbound" }, "real-user"),
    /inbound/,
  );
});
test("API forwards user JWT, pages companies, blocks unauthorized writes and translates overlap errors", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = "https://test.invalid";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    user_metadata: { role: "owner" },
  };
  const requests: { url: string; init?: RequestInit }[] = [];
  let overlap = false;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer user-token",
    );
    if (overlap && init?.method === "PATCH")
      return new Response(JSON.stringify({ code: "23P01" }), { status: 409 });
    if (String(url).includes("id=eq.")) return Response.json([{ id: user.id }]);
    if (String(url).includes("offset=0"))
      return Response.json(Array.from({ length: 500 }, (_, id) => ({ id })));
    return Response.json([{ id: "last" }]);
  };
  try {
    const list = await companyCrmRequest(
      "GET",
      "/api/companies",
      "Bearer user-token",
      user,
      async () => ({}),
    );
    assert.equal((list.data as unknown[]).length, 501);
    assert.equal(requests.length, 2);
    for (const metadata of [
      { role: "viewer" },
      { role: "member", page_permissions: [] },
      { role: "owner", client_account_id: "client" },
      { status: "inactive" },
    ]) {
      const denied = await companyCrmRequest(
        "POST",
        "/api/companies",
        "Bearer user-token",
        { ...user, user_metadata: metadata },
        async () => ({ name: "Denied" }),
      );
      assert.equal(denied.status, 403);
    }
    assert.equal(requests.length, 2);
    overlap = true;
    const conflict = await companyCrmRequest(
      "PATCH",
      `/api/companies/${user.id}`,
      "Bearer user-token",
      user,
      async () => ({ stage: "trial_booked" }),
    );
    assert.equal(conflict.status, 409);
    assert.match(JSON.stringify(conflict.data), /overlaps/);
    const invalid = await companyCrmRequest(
      "GET",
      "/api/company-crm/kpis?from=bad&to=bad",
      "Bearer user-token",
      user,
      async () => ({}),
    );
    assert.equal(invalid.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = originalKey;
  }
});
