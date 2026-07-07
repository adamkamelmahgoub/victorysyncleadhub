import { Router } from "express";
import * as cheerio from "cheerio";

const router = Router();

export interface ScrapedLead {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  sourceUrl: string;
  confidence: "high" | "medium" | "low";
}

const EMAIL_RE = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
const TITLE_KW = [
  "CEO","CTO","CFO","CMO","COO","Founder","Co-Founder","President",
  "VP","Vice President","Director","Manager","Head of","Lead",
  "Senior","Principal","Engineer","Developer","Designer","Analyst",
  "Consultant","Partner","Associate","Recruiter",
];
const SKIP_EMAILS = /^(info|hello|contact|support|admin|help|sales|team|office|no-reply|noreply|feedback|privacy|legal|press|media|careers|jobs|hr)@/i;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

function companyFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const name = host.split(".")[0] ?? "";
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { return null; }
}

function parseName(raw: string): { firstName: string; lastName: string } | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,3}$/.test(cleaned)) return null;
  const parts = cleaned.split(" ");
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function inferNameFromEmail(email: string): { firstName: string; lastName: string } | null {
  const local = email.split("@")[0];
  if (!local) return null;
  if (local.includes(".")) {
    const [a, b] = local.split(".");
    if (!a || !b) return null;
    return {
      firstName: a.charAt(0).toUpperCase() + a.slice(1),
      lastName: b.charAt(0).toUpperCase() + b.slice(1),
    };
  }
  return null;
}

function findTitleNear(text: string): string | null {
  for (const kw of TITLE_KW) {
    const re = new RegExp(`\\b${kw}\\b[\\w\\s,/]{0,40}`, "i");
    const m = text.match(re);
    if (m) return m[0].trim().slice(0, 60);
  }
  return null;
}

function extractFromHtml(html: string, sourceUrl: string, pageTitle?: string): ScrapedLead[] {
  const $ = cheerio.load(html);
  const company = pageTitle?.split("|")[0]?.split("–")[0]?.split("-")[0]?.trim() ?? companyFromUrl(sourceUrl);

  // JSON-LD structured data (highest quality)
  const jsonLdLeads: ScrapedLead[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).text() ?? "{}");
      const items: unknown[] = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (typeof item !== "object" || !item) continue;
        const obj = item as Record<string, unknown>;
        if (obj["@type"] === "Person" || obj["@type"] === "Employee") {
          const name = typeof obj.name === "string" ? parseName(obj.name) : null;
          const email = typeof obj.email === "string" ? obj.email : null;
          const phone = typeof obj.telephone === "string" ? obj.telephone : null;
          const title = typeof obj.jobTitle === "string" ? obj.jobTitle : null;
          const org = typeof obj.worksFor === "object" && obj.worksFor !== null
            ? ((obj.worksFor as Record<string, unknown>).name as string) ?? company
            : company;
          if (name && email) {
            jsonLdLeads.push({ firstName: name.firstName, lastName: name.lastName, email, phone: phone ?? null, company: org ?? null, title, sourceUrl, confidence: "high" });
          }
        }
      }
    } catch {}
  });
  if (jsonLdLeads.length > 0) return jsonLdLeads;

  // Remove nav/footer/header noise
  $("nav, footer, header, script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ");
  const allEmails = [...new Set(text.match(EMAIL_RE) ?? [])];
  const personalEmails = allEmails.filter((e) => !SKIP_EMAILS.test(e));

  const leads: ScrapedLead[] = [];
  for (const email of personalEmails) {
    const idx = text.indexOf(email);
    if (idx === -1) continue;
    const before = text.slice(Math.max(0, idx - 400), idx);
    const after = text.slice(idx + email.length, idx + email.length + 150);
    const context = before + after;

    let nameResult: { firstName: string; lastName: string } | null = null;
    const nameRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,3})\b/g;
    const candidates: string[] = [];
    let m: RegExpExecArray | null;
    const searchWindow = before.slice(-200);
    while ((m = nameRe.exec(searchWindow)) !== null) candidates.push(m[1]!);
    for (const c of candidates.reverse()) {
      const p = parseName(c);
      if (p) { nameResult = p; break; }
    }
    if (!nameResult) nameResult = inferNameFromEmail(email);
    if (!nameResult) continue;

    const phone = context.match(PHONE_RE)?.[0] ?? null;
    const title = findTitleNear(before.slice(-300));
    leads.push({ firstName: nameResult.firstName, lastName: nameResult.lastName, email, phone, company: company ?? null, title, sourceUrl, confidence: "high" });
  }
  return leads;
}

function dedup(leads: ScrapedLead[]): ScrapedLead[] {
  const seen = new Set<string>();
  return leads.filter((l) => {
    const k = l.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function safeFetch(url: string, extraHeaders: Record<string, string> = {}, timeout = 12000) {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, ...extraHeaders },
    signal: AbortSignal.timeout(timeout),
    redirect: "follow",
  });
  return res;
}

// ─── POST /scraper/url ────────────────────────────────────────────────────────
router.post("/scraper/url", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url?.startsWith("http")) return res.status(400).json({ error: "A valid URL is required" });
  try {
    const response = await safeFetch(url);
    if (!response.ok) return res.status(422).json({ error: `Page returned ${response.status}` });
    const html = await response.text();
    const $ = cheerio.load(html);
    const pageTitle = $("title").first().text().trim() || url;
    const leads = dedup(extractFromHtml(html, url, pageTitle));
    return res.json({ leads, pageTitle, url, leadsFound: leads.length });
  } catch (err) {
    req.log.error({ err }, "scraper url error");
    return res.status(500).json({ error: "Failed to fetch the URL. It may block scrapers or require login." });
  }
});

// ─── POST /scraper/domain ─────────────────────────────────────────────────────
// Apollo-style: enter a company domain, auto-finds contacts from team/contact pages
router.post("/scraper/domain", async (req, res) => {
  const { domain } = req.body as { domain?: string };
  if (!domain) return res.status(400).json({ error: "domain is required" });

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? domain;
  const baseUrl = `https://${cleanDomain}`;

  // Common paths to check for team/contact info
  const paths = ["/team", "/about", "/people", "/contact", "/about-us", "/our-team", "/leadership", "/staff", "/directory"];

  const allLeads: ScrapedLead[] = [];
  const triedUrls: string[] = [];
  const errors: string[] = [];

  // Try paths in parallel (first 5)
  const results = await Promise.allSettled(
    paths.slice(0, 5).map(async (path) => {
      const url = `${baseUrl}${path}`;
      try {
        const r = await safeFetch(url, { Referer: baseUrl }, 10000);
        if (!r.ok) return { url, leads: [] };
        const html = await r.text();
        const $ = cheerio.load(html);
        const title = $("title").first().text().trim();
        triedUrls.push(url);
        return { url, leads: extractFromHtml(html, url, title) };
      } catch {
        errors.push(url);
        return { url, leads: [] };
      }
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") allLeads.push(...r.value.leads);
  }

  // Infer email patterns from found emails
  const emailPatterns: string[] = [];
  const found = dedup(allLeads);
  if (found.length > 0) {
    const patterns = new Set<string>();
    for (const l of found) {
      const local = l.email.split("@")[0] ?? "";
      const fn = l.firstName.toLowerCase();
      const ln = l.lastName.toLowerCase();
      if (local === `${fn}.${ln}`) patterns.add("firstname.lastname@" + cleanDomain);
      else if (local === `${fn}${ln}`) patterns.add("firstnamelastname@" + cleanDomain);
      else if (local === fn) patterns.add("firstname@" + cleanDomain);
      else if (local === `${fn[0]}${ln}`) patterns.add("flastname@" + cleanDomain);
    }
    emailPatterns.push(...patterns);
  } else {
    // Common patterns as fallback
    emailPatterns.push(
      `firstname.lastname@${cleanDomain}`,
      `firstname@${cleanDomain}`,
      `flastname@${cleanDomain}`,
    );
  }

  return res.json({
    domain: cleanDomain,
    leads: found,
    leadsFound: found.length,
    emailPatterns,
    pagesChecked: paths.slice(0, 5).length,
  });
});

// ─── POST /scraper/search ─────────────────────────────────────────────────────
// Uses Bing web search to find pages, then scrapes the most promising ones
router.post("/scraper/search", async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query?.trim()) return res.status(400).json({ error: "query is required" });

  try {
    // Try Bing first (more reliable than DuckDuckGo HTML)
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query + " email contact site")}&count=20&setmkt=en-US`;
    let resultUrls: string[] = [];

    try {
      const bingRes = await safeFetch(bingUrl, { Referer: "https://www.bing.com/" });
      const bingHtml = await bingRes.text();
      const $b = cheerio.load(bingHtml);

      // Bing result links: #b_results .b_algo h2 a
      $b("#b_results .b_algo h2 a, #b_results .b_algo .b_title a").each((_, el) => {
        const href = $b(el).attr("href");
        if (href?.startsWith("http")) {
          try {
            const u = new URL(href);
            // Skip search engines, social networks, ad domains
            const skip = ["bing.com","google.com","yahoo.com","facebook.com","twitter.com","instagram.com","youtube.com","linkedin.com","microsoft.com"];
            if (!skip.some((s) => u.hostname.includes(s)) && !resultUrls.includes(u.href)) {
              resultUrls.push(u.href);
            }
          } catch {}
        }
      });
    } catch {
      // Bing failed — try DuckDuckGo as backup
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " email contact")}`;
      const ddgRes = await safeFetch(ddgUrl, { Referer: "https://duckduckgo.com/" });
      const ddgHtml = await ddgRes.text();
      const $d = cheerio.load(ddgHtml);
      $d("a.result__url, .result__a, .result__snippet a").each((_, el) => {
        const href = $d(el).attr("href") ?? "";
        const match = href.match(/uddg=([^&]+)/);
        const raw = match ? decodeURIComponent(match[1]!) : href;
        try {
          const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
          if (u.hostname && !resultUrls.includes(u.href)) resultUrls.push(u.href);
        } catch {}
      });
    }

    if (resultUrls.length === 0) {
      return res.json({
        leads: [],
        query,
        pagesScraped: 0,
        message: "No search results found. Try the URL Scraper to paste a specific page, or use Company Domain to search by company.",
      });
    }

    // Scrape top results in parallel
    const topUrls = resultUrls.slice(0, 5);
    const scrapeResults = await Promise.allSettled(
      topUrls.map(async (u) => {
        const r = await safeFetch(u, {}, 10000);
        if (!r.ok) return [];
        const html = await r.text();
        const $ = cheerio.load(html);
        const title = $("title").first().text().trim();
        return extractFromHtml(html, u, title);
      })
    );

    const allLeads: ScrapedLead[] = [];
    for (const r of scrapeResults) {
      if (r.status === "fulfilled") allLeads.push(...r.value);
    }

    return res.json({ leads: dedup(allLeads), query, pagesScraped: topUrls.length });
  } catch (err) {
    req.log.error({ err }, "scraper search error");
    return res.status(500).json({ error: "Search failed. Please try again." });
  }
});

export default router;
