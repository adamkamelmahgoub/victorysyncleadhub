export const PERSON_FIELDS = [
  ["name", "Full name"],
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["role", "Role / job title"],
  ["email", "Email"],
  ["phone", "Phone"],
] as const;
export type PersonField = (typeof PERSON_FIELDS)[number][0];
export type PersonMapping = Partial<Record<PersonField, string>>;
const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<PersonField, string[]> = {
  name: ["name", "full name"],
  first_name: ["first name"],
  last_name: ["last name"],
  role: ["role", "title", "job title", "position"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "direct phone"],
};

export function detectDecisionMakers(headers: string[]): PersonMapping[] {
  const groups: PersonMapping[] = [];
  for (let index = 1; index <= 30; index++) {
    const mapping: PersonMapping = {};
    for (const [field] of PERSON_FIELDS) {
      const candidates = aliases[field].flatMap((alias) =>
        ["decision maker", "contact", "person", "dm"].flatMap((prefix) => [
          `${prefix} ${index} ${alias}`,
          `${prefix} ${alias} ${index}`,
          ...(index === 1 ? [`${prefix} ${alias}`] : []),
        ]),
      );
      if (field === "name")
        candidates.push(
          `decision maker ${index}`,
          `contact ${index}`,
          `person ${index}`,
        );
      // Generic email/phone belong to the company unless explicitly mapped to a person.
      if (index === 1 && field === "name")
        candidates.push("full name", "decision maker", "owner");
      if (index === 1 && ["first_name", "last_name", "role"].includes(field))
        candidates.push(...aliases[field]);
      if (index === 1)
        candidates.push(
          ...aliases[field].flatMap((alias) => [
            `owner ${alias}`,
            `gm ${alias}`,
          ]),
        );
      const normalized = new Set(candidates.map(normalize));
      const match = headers.find((header) => normalized.has(normalize(header)));
      if (match) mapping[field] = match;
    }
    if (Object.keys(mapping).length) groups.push(mapping);
  }
  return groups.length ? groups : [{}];
}

export function mapDecisionMakers(
  headers: string[],
  row: string[],
  mappings: PersonMapping[],
) {
  const cell = (column?: string) =>
    column ? (row[headers.indexOf(column)] ?? "").trim() : "";
  return mappings
    .map((mapping) => ({
      name:
        cell(mapping.name) ||
        [cell(mapping.first_name), cell(mapping.last_name)]
          .filter(Boolean)
          .join(" "),
      role: cell(mapping.role),
      email: cell(mapping.email),
      phone: cell(mapping.phone),
    }))
    .filter((person) => Object.values(person).some(Boolean));
}
