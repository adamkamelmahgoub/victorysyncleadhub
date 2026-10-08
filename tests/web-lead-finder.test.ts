import test from "node:test";
import assert from "node:assert/strict";
import { extractWebsiteContacts, safeWebsiteUrl } from "../lib/web-lead-finder.js";

test("extracts public business emails and ignores scripts and repeat addresses", () => {
  const contacts = extractWebsiteContacts(`<html><title>Acme Plumbing | Tulsa</title>
    <script>var email='hidden@example.com'</script>
    <a href="mailto:jane.doe@acmeplumbing.com">Jane</a>
    <p>jane.doe@acmeplumbing.com</p><p>info@acmeplumbing.com</p></html>`,
    "https://acmeplumbing.com/contact");
  assert.equal(contacts.length, 2);
  assert.deepEqual([contacts[0].firstName, contacts[0].lastName], ["Jane", "Doe"]);
  assert.equal(contacts[0].company, "Acme Plumbing");
  assert.equal(contacts[1].email, "info@acmeplumbing.com");
});

test("rejects private and credentialed URLs before fetching", async () => {
  await assert.rejects(safeWebsiteUrl("http://127.0.0.1/admin"), /public website/);
  await assert.rejects(safeWebsiteUrl("http://user:password@example.com"), /public website/);
  await assert.rejects(safeWebsiteUrl("http://localhost/admin"), /public website/);
});
