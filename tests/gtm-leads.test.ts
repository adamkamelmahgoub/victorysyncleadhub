import test from "node:test";
import assert from "node:assert/strict";
import { generateGtmLeads, scoreListing, usPhone } from "../lib/gtm-leads.js";

test("normalizes only valid US business phone numbers", () => {
  assert.equal(usPhone("(918) 555-0123"), "+19185550123");
  assert.equal(usPhone("+1 918 555 0123"), "+19185550123");
  assert.equal(usPhone("12345"), null);
});

test("ranks documented listing signals without inventing demand or intent", () => {
  const full = scoreListing({ place_id: "one", name: "Acme Roofing", phone: "9185550123",
    website: "https://acmeroofing.example", category: "roofing", confidence: 0.95,
    address: { locality: "Tulsa", region: "OK" }, operating_status: "open" }, "roofing");
  const bare = scoreListing({ place_id: "two", name: "Other", confidence: 0.75 }, "roofing");
  assert.ok(full.score > bare.score);
  assert.ok(full.reasons.includes("business phone listed"));
  assert.ok(full.reasons.includes("category matches search"));
  assert.equal(bare.reasons.includes("business website listed"), false);
});

test("only saves ranked, unsuppressed listings once", async () => {
  const calls: Array<{ action: string; places?: Array<{ place_id: string }> }> = [];
  const place = (id: string, phone: string, confidence = 0.9) => ({ place_id: id,
    name: `Roofing ${id}`, phone, website: "https://roofing.example",
    category: "roofing", confidence, address: { locality: "Tulsa", region: "OK" } });
  const result = await generateGtmLeads({ city: "Tulsa", state: "OK", category: "roofing",
    radius_mi: 20, max_results: 10, min_score: 65, require_website: true, save: true }, {
    call: async (_name, body) => {
      const request = body as { action: string; places?: Array<{ place_id: string }> };
      calls.push(request);
      return request.action === "preview" ? { api_calls: 1, places: [
        place("good", "9185550101"), place("duplicate", "9185550101", 0.72),
        place("suppressed", "9185550102"), place("weak", "", 0.3),
      ] } : { inserted: request.places?.length || 0, skipped: 0, lead_ids: ["new-lead"] };
    },
    existingPhones: async () => ["+19185550102"],
  });
  assert.equal(result.qualified, 1);
  assert.equal(result.saved.inserted, 1);
  assert.equal(calls[1].places?.[0].place_id, "good");
});
