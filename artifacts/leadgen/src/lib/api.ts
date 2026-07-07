const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}/api${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
