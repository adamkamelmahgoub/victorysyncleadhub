const PREFIX = "victorysync-api-cache-v1:";
const TTL_MS = 2 * 60_000;
const MAX_RESPONSE_BYTES = 300_000;
const memory = new Map<string, { expiresAt: number; value: unknown }>();

export function cacheScope(userId: string, token?: string): string {
  try {
    const claims = JSON.parse(atob((token ?? "").split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    return [userId, claims.crm_role, claims.crm_client_account_id, claims.crm_page_permissions, claims.org_id, claims.team_member_id].map((value) => JSON.stringify(value ?? null)).join(":");
  } catch { return userId; }
}

export function isCacheablePath(path: string): boolean {
  return /^\/api\/leads\?/.test(path) && new URLSearchParams(path.split("?")[1]).get("includeActivity") === "false"
    || path === "/api/companies"
    || path === "/api/segments"
    || path === "/api/contact-views";
}

function key(scope: string, path: string) { return `${PREFIX}${scope}:${path}`; }

export function readApiCache(scope: string, path: string): unknown | undefined {
  const cacheKey = key(scope, path);
  const inMemory = memory.get(cacheKey);
  if (inMemory) {
    if (inMemory.expiresAt > Date.now()) return inMemory.value;
    memory.delete(cacheKey);
  }
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as { expiresAt: number; value: unknown };
    if (entry.expiresAt <= Date.now()) { sessionStorage.removeItem(cacheKey); return undefined; }
    memory.set(cacheKey, entry);
    return entry.value;
  } catch { return undefined; }
}

export function writeApiCache(scope: string, path: string, value: unknown): void {
  const cacheKey = key(scope, path);
  const entry = { expiresAt: Date.now() + TTL_MS, value };
  const serialized = JSON.stringify(entry);
  if (serialized.length > MAX_RESPONSE_BYTES) return;
  memory.set(cacheKey, entry);
  try { sessionStorage.setItem(cacheKey, serialized); } catch { /* Storage may be unavailable or full. */ }
}

export function clearApiCache(): void {
  memory.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const cacheKey = sessionStorage.key(i);
      if (cacheKey?.startsWith(PREFIX)) sessionStorage.removeItem(cacheKey);
    }
  } catch { /* Storage may be unavailable. */ }
}
