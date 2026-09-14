import { supabase } from "./supabase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function apiFetch(path: string, opts?: RequestInit) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = normalizedPath.startsWith("/api/")
    ? `${BASE}${normalizedPath}`
    : `${BASE}/api${normalizedPath}`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
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
      throw new Error([data.error ?? data.message ?? validationErrors, data.supabaseError].filter(Boolean).join(" — ") || `HTTP ${res.status} for ${url}`);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(text || `HTTP ${res.status} for ${url}`);
      throw error;
    }
  }
  if (res.status === 204) return null;
  return res.json();
}
