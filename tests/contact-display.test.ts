import assert from "node:assert/strict";
import test from "node:test";
import { getDisplayName, getInitials } from "../artifacts/leadgen/src/lib/contact-display.ts";

test("contact display tolerates empty production fields", () => {
  const cases = [
    [{ firstName: null, lastName: null, email: null, company: "Acme", phone: "", tags: [] }, "Acme", "A"],
    [{ firstName: "", lastName: "", email: null, company: "", phone: "", tags: [] }, "Unnamed contact", "?"],
    [{ firstName: " Ada ", lastName: null, email: null, company: "", phone: "", tags: [] }, "Ada", "A"],
    [{ firstName: null, lastName: "", email: "ada@example.com", company: "", phone: "", tags: [] }, "ada@example.com", "A"],
  ] as const;
  for (const [contact, name, initials] of cases) {
    assert.equal(getDisplayName(contact), name);
    assert.equal(getInitials(contact), initials);
  }
});
