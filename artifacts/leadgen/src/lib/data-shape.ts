export function asArray<T>(value: T[] | unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export type ArrayElement<T> = T extends readonly (infer Item)[] ? Item : never;
