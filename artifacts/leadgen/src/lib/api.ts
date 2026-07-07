import { supabase } from "./supabase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}/api${path.startsWith("/") ? path : `/${path}`}`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(opts?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, {
    ...opts,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
