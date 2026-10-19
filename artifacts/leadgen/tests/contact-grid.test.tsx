import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { ContactGrid, type ContactRow } from "../src/components/contact-grid";

test("contact list renders sparse production records without losing other rows", () => {
  const contacts: ContactRow[] = [
    { id: "1", firstName: null, lastName: null, email: null, phone: "", company: "Acme", tags: [], status: "new" },
    { id: "2", firstName: "", lastName: "", email: null, phone: "", company: "", tags: [], status: "new" },
    { id: "3", firstName: "Ada", lastName: null, email: "ada@example.com", phone: null, company: null, tags: ["roofing"] },
  ];
  const html = renderToStaticMarkup(createElement(Router, { hook: () => ["/", () => {}] },
    createElement(ContactGrid, { contacts, selected: new Set<string>(), onSelect: () => {} })));
  assert.match(html, /Acme/);
  assert.match(html, /Unnamed contact/);
  assert.match(html, /ada@example.com/);
  assert.match(html, /roofing/);
});
