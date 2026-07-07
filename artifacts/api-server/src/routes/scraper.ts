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
const PHONE_RE =
  /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
const TITLE_KW = [
  "CEO", "CTO", "CFO", "CMO", "COO", "Founder", "Co-Founder", "President",
  "VP", "Vice President", "Director", "Manager", "Head of", "Lead",
  "Senior", "Principal", "Engineer", "Developer", "Designer", "Analyst",
  "Consultant", "Partner", "Associate", "Recruiter",
];

const SKIP_EMAILS = /^(info|hello|contact|support|admin|help|sales|team|office|no-reply|noreply|feedback|privacy|legal|press|media)@/i;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

function companyFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const name = host.split(".")[0] ?? "";
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

function parseName(raw: string): { firstName: string; lastName: string } | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  // Must look like a real name (2+ words, each starting uppercase)
  if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,3}$/.test(cleaned)) return null;
  const parts = cleaned.split(" ");
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function inferNameFromEmail(email: string): { firstName: string; lastName: string } | null {
  const local = email.split("@")[0];
  if (!local) return null;
  // john.doe@… or johndoe@…
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
  const company = pageTitle?.split("|")[0]?.split("–")[0]?.trim() ?? companyFromUrl(sourceUrl);

  // --- JSON-LD structured data (highest quality) ---
  const jsonLdLeads: ScrapedLead[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).text() ?? "{}");
      const items: unknown[] = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (typeof item !== "object" || !item) continue;
        const obj = item as Record<string, unknown>;
        // Person schema
        if (obj["@type"] === "Person" || obj["@type"] === "Employee") {
          const name = typeof obj.name === "string" ? parseName(obj.name) : null;
          const email = typeof obj.email === "string" ? obj.email : null;
          const phone = typeof obj.telephone === "string" ? obj.telephone : null;
          const title = typeof obj.jobTitle === "string" ? obj.jobTitle : null;
          const org =
            typeof obj.worksFor === "object" && obj.worksFor !== null
              ? ((obj.worksFor as Record<string, unknown>).name as string) ?? company
              : company;
          if (name && email) {
            jsonLdLeads.push({
              firstName: name.firstName,
              lastName: name.lastName,
              email,
              phone: phone ?? null,
              company: org ?? null,
              title,
              sourceUrl,
              confidence: "high",
            });
          }
        }
      }
    } catch {}
  });
  if (jsonLdLeads.length > 0) return jsonLdLeads;

  // --- Plain text / regex extraction ---
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

    // Attempt name from surrounding text — look for capitalized word sequences
    let nameResult: { firstName: string; lastName: string } | null = null;
    const nameRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,3})\b/g;
    const candidates: string[] = [];
    let m: RegExpExecArray | null;
    const searchWindow = before.slice(-200);
    while ((m = nameRe.exec(searchWindow)) !== null) {
      candidates.push(m[1]);
    }
    for (const c of candidates.reverse()) {
      const p = parseName(c);
      if (p) { nameResult = p; break; }
    }
    if (!nameResult) nameResult = inferNameFromEmail(email);
    if (!nameResult) continue;

    const phone = context.match(PHONE_RE)?.[0] ?? null;
    const title = findTitleNear(before.slice(-300));

    leads.push({
      firstName: nameResult.firstName,
      lastName: nameResult.lastName,
      email,
      phone,
      company: company ?? null,
      title,
      sourceUrl,
      confidence: nameResult.lastName ? "high" : "medium",
    });
  }

  return leads;
}

// Deduplicate by email
function dedup(leads: ScrapedLead[]): ScrapedLead[] {
  const seen = new Set<string>();
  return leads.filter((l) => {
    const k = l.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── POST /api/scraper/url ────────────────────────────────────────────────────
router.post("/scraper/url", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url?.startsWith("http")) {
    return res.status(400).json({ error: "A valid URL is required" });
  }

  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return res.status(422).json({ error: `Page returned ${response.status}` });
    }
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

// ─── POST /api/scraper/search ─────────────────────────────────────────────────
// Uses DuckDuckGo HTML search to find pages, then scrapes the most promising ones
router.post("/scraper/search", async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    // Step 1: Get DDG search results
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " contact email")}`;
    const ddgRes = await fetch(ddgUrl, {
      headers: { ...BROWSER_HEADERS, Referer: "https://duckduckgo.com/" },
      signal: AbortSignal.timeout(12_000),
    });
    const ddgHtml = await ddgRes.text();
    const $ddg = cheerio.load(ddgHtml);

    // Extract result URLs
    const resultUrls: string[] = [];
    $ddg("a.result__url, .result__a").each((_, el) => {
      const href = $ddg(el).attr("href") ?? "";
      // DDG wraps URLs in /l/?uddg=<encoded>
      const match = href.match(/uddg=([^&]+)/);
      const raw = match ? decodeURIComponent(match[1]) : href;
      try {
        const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
        if (u.hostname && !resultUrls.includes(u.href)) resultUrls.push(u.href);
      } catch {}
    });

    // Step 2: Scrape top 4 results in parallel
    const topUrls = resultUrls.slice(0, 4);
    const scrapeResults = await Promise.allSettled(
      topUrls.map(async (u) => {
        const r = await fetch(u, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(10_000),
        });
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
