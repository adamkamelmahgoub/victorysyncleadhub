export function asArray<T>(value: T[] | unknown): T[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data as T[];
  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record.results)) return record.results as T[];

  return [];
}

export type ArrayElement<T> = T extends readonly (infer Item)[] ? Item : never;
