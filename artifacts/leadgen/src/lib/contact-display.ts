export type ContactDisplay = {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
};

export function getDisplayName(contact: ContactDisplay): string {
  const name = [contact.firstName, contact.lastName].filter((part) => typeof part === "string" && part.trim()).map((part) => part!.trim()).join(" ");
  return name || contact.company?.trim() || contact.email?.trim() || contact.phone?.trim() || "Unnamed contact";
}

export function getInitials(contact: ContactDisplay): string {
  const first = contact.firstName?.trim();
  const last = contact.lastName?.trim();
  if (first || last) return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  const fallback = getDisplayName(contact);
  return fallback === "Unnamed contact" ? "?" : (fallback[0]?.toUpperCase() ?? "?");
}
