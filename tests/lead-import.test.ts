import assert from "node:assert/strict";
import { test } from "node:test";
import { ImportLeadsBody } from "../lib/api-zod/src/generated/api.js";

test("import accepts partial and empty records without inventing names or emails", async () => {
  process.env.SUPABASE_URL = "https://import-test.invalid";
  process.env.SUPABASE_ANON_KEY = "test-key";
  const { default: handler } = await import("../api/[...path].js");
  const leads = [{ phone: "555-0100" }, { company: "Roofing Co" },
    { customFields: { city: "Phoenix" } }, {}, { email: "alex@example.com" }];
  assert.equal(ImportLeadsBody.safeParse({ leads }).success, true);
  const originalFetch = globalThis.fetch;
  const token = `e30.${Buffer.from(JSON.stringify({ sub: "00000000-0000-4000-8000-000000000001", crm_role: "owner" })).toString("base64url")}.sig`;
  let saved: any[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({
      id: "00000000-0000-4000-8000-000000000001", user_metadata: { role: "owner" },
    });
    if (String(url).endsWith("/rest/v1/leads")) {
      saved = JSON.parse(String(init?.body));
      return Response.json(saved.map((lead, index) => ({ ...lead, id: index + 1 })));
    }
    if (String(url).endsWith("/rest/v1/activities")) return Response.json([]);
    if (String(url).includes("/rest/v1/portal_activity_log")) return Response.json([]);
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    let result: any;
    const res = { statusCode: 0, setHeader() {}, end(body?: string) { result = JSON.parse(body!); } };
    await handler({ method: "POST", url: "/api/leads/import", headers: { authorization: `Bearer ${token}` }, body: { leads }, on() {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(result.imported, 5);
    assert.equal(result.failed, 0);
    assert.equal(saved[0].phone, "555-0100");
    assert.equal(saved[1].company, "Roofing Co");
    assert.deepEqual(saved[2].custom_fields, { city: "Phoenix" });
    for (const lead of saved) {
      assert.equal(lead.first_name, "");
      assert.equal(lead.last_name, "");
    }
    assert.equal(saved[3].email, "");
    assert.equal(saved[4].email, "alex@example.com");
  } finally { globalThis.fetch = originalFetch; }
});
