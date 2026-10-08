import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type FoundContact = { firstName: string; lastName: string; email: string;
  phone: string | null; company: string | null; title: string | null;
  sourceUrl: string; confidence: "high" | "medium" | "low" };

function publicAddress(address: string): boolean {
  if (address.includes(":")) {
    const lower = address.toLowerCase();
    return !(lower === "::1" || lower === "::" || lower.startsWith("fe80:") ||
      lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("::ffff:"));
  }
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 ||
    a === 192 && b === 0 || a === 198 && (b === 18 || b === 19));
}

export async function safeWebsiteUrl(value: string): Promise<URL> {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.port && !['80', '443'].includes(url.port) || isIP(url.hostname) ||
      !url.hostname.includes('.') || url.hostname.length > 253 ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname))
    throw new Error("Enter a public website URL or domain");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
    throw new Error("This website does not resolve to a public address");
  return url;
}

function decodeHtml(value: string): string {
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(?:amp|quot|apos|lt|gt);/gi, (entity) => ({
      '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>',
    }[entity.toLowerCase()] || entity));
}

export function extractWebsiteContacts(html: string, sourceUrl: string): FoundContact[] {
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/<[^>]*>/g, "").split(/[|–—]/)[0].trim().slice(0, 100);
  const company = title || new URL(sourceUrl).hostname.replace(/^www\./, "");
  const clean = decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " "));
  const matches = clean.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = new Set<string>();
  return matches.flatMap((raw) => {
    const email = raw.toLowerCase().replace(/\.(?:png|jpg|jpeg|gif|svg)$/i, "");
    if (seen.has(email) || email.length > 254 || /^(?:noreply|no-reply|example|test)@/.test(email)) return [];
    seen.add(email);
    const local = email.split("@")[0].split(/[+_\-.]/).filter(Boolean);
    const named = local.length >= 2 && local.every((part) => /^[a-z]{2,25}$/.test(part));
    const human = (part: string) => part[0].toUpperCase() + part.slice(1);
    return [{ firstName: named ? human(local[0]) : "", lastName: named ? human(local[1]) : "",
      email, phone: null, company, title: null, sourceUrl,
      confidence: named ? "medium" as const : "low" as const }];
  }).slice(0, 100);
}

export async function fetchWebsiteContacts(value: string): Promise<{ leads: FoundContact[]; pageTitle: string }> {
  let url = await safeWebsiteUrl(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetch(url, { redirect: 'manual', headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(12000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Website redirected without a destination');
      url = await safeWebsiteUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
    if (!(response.headers.get('content-type') || '').includes('text/html'))
      throw new Error('The URL does not contain an HTML page');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 2_000_000) throw new Error('Website page is too large');
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error('Website page is too large');
    return { leads: extractWebsiteContacts(html, url.href), pageTitle: url.hostname };
  }
  throw new Error('Website redirected too many times');
}

export async function scanDomain(value: string): Promise<{ leads: FoundContact[]; pagesChecked: number; emailPatterns: string[] }> {
  const origin = await safeWebsiteUrl(value);
  const base = `${origin.protocol}//${origin.host}`;
  const paths = ['/', '/about', '/team', '/people', '/contact'];
  const results = await Promise.allSettled(paths.map((path) => fetchWebsiteContacts(base + path)));
  const byEmail = new Map<string, FoundContact>();
  let pagesChecked = 0;
  for (const result of results) if (result.status === 'fulfilled') {
    pagesChecked++;
    for (const lead of result.value.leads) byEmail.set(lead.email, lead);
  }
  if (!pagesChecked) throw new Error('Could not read this website. Try a direct public page URL.');
  return { leads: [...byEmail.values()], pagesChecked, emailPatterns: [] };
}
