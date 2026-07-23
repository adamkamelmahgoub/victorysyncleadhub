import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, leadsTable, insertProspectSchema } from "@workspace/db/schema";
import { eq, desc, ilike, or, and, inArray, sql } from "drizzle-orm";

const router = Router();

router.get("/prospects", async (req, res) => {
  const { search, title, company, industry, companySize, seniority, country, minIntent, limit = "50", offset = "0" } = req.query as Record<string, string>;

  let dbProspects = await db.select().from(prospectsTable).orderBy(desc(prospectsTable.intentScore)).limit(parseInt(limit)).offset(parseInt(offset));

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
