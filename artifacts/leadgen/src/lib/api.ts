import { supabase } from "./supabase";
import { cacheScope, clearApiCache, isCacheablePath, readApiCache, writeApiCache } from "./api-cache";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function apiFetch(path: string, opts?: RequestInit) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = normalizedPath.startsWith("/api/")
    ? `${BASE}${normalizedPath}`
    : `${BASE}/api${normalizedPath}`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const method = (opts?.method ?? "GET").toUpperCase();
  const scope = data.session?.user.id ? cacheScope(data.session.user.id, token) : "";
  const useCache = method === "GET" && !!scope && isCacheablePath(normalizedPath) && !opts?.signal;
  if (useCache) {
    const cached = readApiCache(scope, normalizedPath);
    if (cached !== undefined) return cached;
  }
  const headers = new Headers(opts?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, {
    ...opts,
    headers,
  });
  if(!['GET','HEAD'].includes((opts?.method??'GET').toUpperCase())&&!normalizedPath.startsWith('/api/activity/'))void import('./activity').then(({recordActivity})=>recordActivity('api','data_changed',{pagePath:window.location.pathname,target:normalizedPath,requestMethod:(opts?.method??'GET').toUpperCase(),requestStatus:res.status}));
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      const data = JSON.parse(text) as { error?: string; message?: string; supabaseError?: string; errors?: string[] };
      const validationErrors = Array.isArray(data.errors) ? data.errors.join("; ") : undefined;
      throw new Error([data.error ?? data.message ?? validationErrors, data.supabaseError].filter(Boolean).join(": ") || `HTTP ${res.status} for ${url}`);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(text || `HTTP ${res.status} for ${url}`);
      throw error;
    }
  }
  if (method !== "GET" && normalizedPath !== "/api/contacts/last-activity") clearApiCache();
  if (res.status === 204) return null;
  const result = await res.json();
  if (useCache) writeApiCache(scope, normalizedPath, result);
  return result;
}


export async function apiDownloadCsv(path: string, body: unknown, filename = "contacts.csv") {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(data.session?.access_token ? { authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(error.error || `Export failed (${response.status})`);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
