import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectDecisionMakers,
  mapDecisionMakers,
} from "../artifacts/leadgen/src/lib/decision-maker-import.js";
import { companyImportRow } from "../artifacts/api-server/src/lib/company-import.js";
import { companyCrmRequest } from "../artifacts/api-server/src/lib/company-crm.js";

test("multiple decision-maker column groups map separately from company email and phone", () => {
  const headers = [
    "Company Name",
    "Email",
    "Phone",
    "Decision Maker 1 First Name",
    "Decision Maker 1 Last Name",
    "Decision Maker 1 Title",
    "Decision Maker 1 Email",
    "Decision Maker 1 Phone",
    "Contact 2 Name",
    "Contact 2 Role",
    "Contact 2 Email",
    "Contact 2 Phone",
  ];
  const values = [
    "Acme",
    "office@example.com",
    "555-0000",
    "Alex",
    "Smith",
    "Owner",
    "alex@example.com",
    "555-0001",
    "Sam Jones",
    "GM",
    "sam@example.com",
    "555-0002",
  ];
  const mapping = detectDecisionMakers(headers);
  const contacts = mapDecisionMakers(headers, values, mapping);
  assert.deepEqual(contacts, [
    {
      name: "Alex Smith",
      role: "Owner",
      email: "alex@example.com",
      phone: "555-0001",
    },
    {
      name: "Sam Jones",
      role: "GM",
      email: "sam@example.com",
      phone: "555-0002",
    },
  ]);
  const company = companyImportRow({
    name: "Acme",
    email: values[1],
    phone: values[2],
    contacts,
  });
  assert.deepEqual(company.contacts, contacts);
  assert.equal(company.contact_name, "Alex Smith");
  assert.equal(company.email, "office@example.com");
  assert.deepEqual(detectDecisionMakers(["Name", "Email", "Phone"]), [{}]);
});

test("blank people are skipped and incomplete people remain importable", () => {
  assert.deepEqual(
    mapDecisionMakers(
      ["Owner Name", "Owner Email"],
      ["", ""],
      [{ name: "Owner Name", email: "Owner Email" }],
    ),
    [],
  );
  const company = companyImportRow({
    name: "Acme",
    contact_name: "Existing primary",
    contacts: [{ email: "owner@example.com" }, {}, { name: "Sam" }],
  });
  assert.deepEqual(company.contacts, [
    {
      name: "Unnamed contact",
      role: "",
      email: "owner@example.com",
      phone: "",
    },
    { name: "Sam", role: "", email: "", phone: "" },
  ]);
  assert.equal(company.needs_verification, true);
  assert.equal(company.contact_name, "Existing primary");
  assert.throws(
    () =>
      companyImportRow({
        name: "Acme",
        contacts: [{ name: "Sam", email: "bad email" }],
      }),
    /valid contact email/,
  );
  assert.throws(
    () =>
      companyImportRow({
        name: "Acme",
        contacts: Array(31).fill({ name: "Sam" }),
      }),
    /30 decision-makers/,
  );
});

test("company import stores decision-makers in the same company insert", async () => {
  process.env.SUPABASE_URL = "https://people-test.invalid";
  process.env.SUPABASE_ANON_KEY = "test-key";
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://people-test.invalid/rest/v1/companies");
    writes.push(JSON.parse(String(init?.body)));
    return Response.json([{ id: "company-id", ...writes.at(-1) }]);
  };
  try {
    const response = await companyCrmRequest(
      "POST",
      "/api/companies/import",
      "Bearer user-token",
      { id: "user-id", user_metadata: { role: "owner" } },
      async () => ({
        companies: [
          {
            name: "Acme",
            contacts: [{ name: "Alex", role: "Owner" }, { phone: "555-0100" }],
          },
        ],
      }),
    );
    assert.equal(response.status, 200);
    assert.equal((response.data as any).imported, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].contacts.length, 2);
    assert.equal(writes[0].contacts[1].phone, "555-0100");
  } finally {
    globalThis.fetch = original;
  }
});
