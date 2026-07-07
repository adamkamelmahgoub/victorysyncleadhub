import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, leadsTable, insertProspectSchema } from "@workspace/db/schema";
import { eq, desc, ilike, or, and, inArray, sql } from "drizzle-orm";

const router = Router();

const SAMPLE_PROSPECTS = [
  { firstName: "Jordan", lastName: "Martinez", email: "j.martinez@techwave.io", title: "VP of Marketing", seniority: "vp", department: "marketing", company: "TechWave", companySize: "51-200", industry: "SaaS", city: "Austin", state: "TX", country: "US", technologies: ["HubSpot", "Salesforce", "Slack"], intentScore: 87, emailVerified: true },
  { firstName: "Alex", lastName: "Thompson", email: "alex.t@growthlab.com", title: "Head of Sales", seniority: "director", department: "sales", company: "GrowthLab", companySize: "11-50", industry: "Consulting", city: "Chicago", state: "IL", country: "US", technologies: ["Outreach", "LinkedIn Sales Navigator"], intentScore: 92, emailVerified: true },
  { firstName: "Riley", lastName: "Chen", email: "rchen@scalepeak.com", title: "CEO", seniority: "c_suite", department: "executive", company: "ScalePeak", companySize: "1-10", industry: "E-Commerce", city: "San Francisco", state: "CA", country: "US", technologies: ["Shopify", "Klaviyo", "Google Ads"], intentScore: 78, emailVerified: true },
  { firstName: "Morgan", lastName: "Davis", email: "morgan@nexusgrowth.com", title: "Director of Operations", seniority: "director", department: "operations", company: "Nexus Growth", companySize: "201-500", industry: "Real Estate", city: "Miami", state: "FL", country: "US", technologies: ["Salesforce", "DocuSign"], intentScore: 65, emailVerified: false },
  { firstName: "Casey", lastName: "Wilson", email: "c.wilson@launchify.co", title: "Founder & CEO", seniority: "c_suite", department: "executive", company: "Launchify", companySize: "1-10", industry: "SaaS", city: "New York", state: "NY", country: "US", technologies: ["Stripe", "Intercom", "Mixpanel"], intentScore: 95, emailVerified: true },
  { firstName: "Taylor", lastName: "Brown", email: "tbrown@marketedge.io", title: "CMO", seniority: "c_suite", department: "marketing", company: "MarketEdge", companySize: "51-200", industry: "Marketing Agency", city: "Denver", state: "CO", country: "US", technologies: ["HubSpot", "Semrush", "Hotjar"], intentScore: 81, emailVerified: true },
  { firstName: "Sam", lastName: "Lee", email: "s.lee@revampcrm.com", title: "Sales Manager", seniority: "manager", department: "sales", company: "RevampCRM", companySize: "11-50", industry: "CRM Software", city: "Seattle", state: "WA", country: "US", technologies: ["Salesforce", "Gong", "ZoomInfo"], intentScore: 73, emailVerified: true },
  { firstName: "Jamie", lastName: "Patel", email: "jpatel@brightloop.ai", title: "Growth Lead", seniority: "manager", department: "marketing", company: "BrightLoop AI", companySize: "1-10", industry: "AI / ML", city: "Boston", state: "MA", country: "US", technologies: ["OpenAI", "Zapier", "Notion"], intentScore: 88, emailVerified: true },
];

router.get("/prospects", async (req, res) => {
  const { search, title, company, industry, companySize, seniority, country, minIntent, limit = "50", offset = "0" } = req.query as Record<string, string>;

  let dbProspects = await db.select().from(prospectsTable).orderBy(desc(prospectsTable.intentScore)).limit(parseInt(limit)).offset(parseInt(offset));

  if (dbProspects.length === 0) {
    const filtered = SAMPLE_PROSPECTS.filter(p => {
      if (search && !`${p.firstName} ${p.lastName} ${p.company} ${p.email}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (title && !p.title.toLowerCase().includes(title.toLowerCase())) return false;
      if (industry && p.industry !== industry) return false;
      if (companySize && p.companySize !== companySize) return false;
      if (seniority && p.seniority !== seniority) return false;
      if (minIntent && p.intentScore < parseInt(minIntent)) return false;
      return true;
    });
    res.json({ prospects: filtered.map((p, i) => ({ ...p, id: i + 1, source: "sample", savedToLeads: false, tags: [], keywords: [] })), total: filtered.length }); return;
  }

  res.json({ prospects: dbProspects, total: dbProspects.length });
});

router.post("/prospects", async (req, res) => {
  const parsed = insertProspectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [prospect] = await db.insert(prospectsTable).values({ ...parsed.data }).returning();
  res.status(201).json(prospect);
});

router.post("/prospects/save-to-leads", async (req, res) => {
  const { prospects } = req.body as { prospects: Array<{ firstName: string; lastName: string; email?: string; phone?: string; title?: string; company?: string; industry?: string; city?: string }> };
  if (!prospects?.length) { res.status(400).json({ error: "prospects array required" }); return; }

  const inserted = [];
  for (const p of prospects) {
    try {
      const [lead] = await db.insert(leadsTable).values({
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email || `${p.firstName.toLowerCase()}.${p.lastName.toLowerCase()}@unknown.com`,
        phone: p.phone,
        title: p.title,
        company: p.company,
        source: "prospect_search",
        status: "new",
        score: 50,
        tags: [],
        customFields: { industry: p.industry || "", city: p.city || "" },
      }).returning();
      inserted.push(lead);
    } catch {}
  }
  res.json({ saved: inserted.length, leads: inserted });
});

router.get("/prospects/filters", async (_req, res) => {
  res.json({
    industries: ["SaaS", "E-Commerce", "Real Estate", "Marketing Agency", "Consulting", "Finance", "Healthcare", "AI / ML", "CRM Software", "Education", "Retail", "Manufacturing"],
    companySizes: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"],
    seniorities: ["individual_contributor", "manager", "director", "vp", "c_suite", "founder"],
    departments: ["sales", "marketing", "engineering", "operations", "executive", "finance", "hr", "product"],
    countries: ["US", "UK", "CA", "AU", "DE", "FR", "IN", "SG"],
  });
});

export default router;
