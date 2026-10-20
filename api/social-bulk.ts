import type { IncomingMessage, ServerResponse } from 'node:http';
import { allowedEmail } from '../lib/mcp-auth.js';
import { socialOrganizationIds } from '../lib/social-auth.js';
import { socialRest } from '../lib/social-service.js';
import { discoverWebsiteSocials, resolveAmbiguousSocials } from '../lib/social-discovery.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const legacyOrg = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data));
}
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    const bearer = req.headers.authorization;
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (typeof bearer !== 'string' || !bearer.startsWith('Bearer ') || !key || !process.env.SUPABASE_URL) throw new Error('Sign in first');
    const auth = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: key, authorization: bearer }, signal: AbortSignal.timeout(10000) });
    if (!auth.ok) throw new Error('Session expired');
    const user = await auth.json() as { id: string; email: string; email_confirmed_at?: string };
    if (!user.email_confirmed_at || !allowedEmail(user.email)) throw new Error('CRM administrator access required');
    let raw = '';
    for await (const part of req) { raw += part; if (raw.length > 10000) throw new Error('Request too large'); }
    const input = JSON.parse(raw || '{}') as { ids?: unknown; entity_type?: unknown };
    const ids = Array.isArray(input.ids) ? [...new Set(input.ids)] : [];
    if (!['lead','company'].includes(String(input.entity_type)) || !ids.length || ids.length > 25 || ids.some((id) => typeof id !== 'string' || !uuid.test(id)))
      throw new Error('Choose 1 to 25 records');
    const orgs = await socialOrganizationIds(user.id);
    type Row={id:string;organization_id:string|null;custom_fields:Record<string,any>|null;website?:string|null};
    let rows:Row[]=[];
    if(input.entity_type==='lead')rows=await socialRest<Row[]>(`leads?id=in.(${ids.join(',')})&select=id,organization_id,custom_fields`);
    else {
      const [crm,legacy]=await Promise.all([
        socialRest<Row[]>(`crm_companies?id=in.(${ids.join(',')})&select=id,organization_id,website,custom_fields`),
        orgs.includes(legacyOrg)?socialRest<Row[]>(`companies?id=in.(${ids.join(',')})&select=id,website,custom_fields`):Promise.resolve([]),
      ]);
      rows=[...new Map([...crm,...legacy.map((row)=>({...row,organization_id:legacyOrg}))].map((row)=>[row.id,row])).values()];
    }
    if (rows.length !== ids.length || rows.some((row) => !orgs.includes(row.organization_id || legacyOrg))) throw new Error('Organization access denied');
    let saved = 0, review = 0, missingWebsite = 0;
    const failures: Array<{ id: string; error: string }> = [];
    for (const row of rows) {
      const fields = row.custom_fields || {};
      const website = row.website || fields.website || fields.website_url || fields.open_places?.website || fields.google_places?.website;
      if (typeof website !== 'string' || !website.trim()) { missingWebsite++; continue; }
      try {
        const candidates = await resolveAmbiguousSocials(await discoverWebsiteSocials(website), website);
        for (const item of candidates) {
          const inserted = await socialRest<Array<{ id: string }>>('social_profiles?on_conflict=organization_id,platform,normalized_handle,entity_type,entity_id', {
            method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
            body: JSON.stringify({ organization_id: row.organization_id || legacyOrg, entity_type: input.entity_type, entity_id: row.id,
              platform: item.platform, handle: item.handle, normalized_handle: item.normalizedHandle, profile_url: item.profileUrl,
              confidence: item.confidence, source: item.source, is_primary: false }),
          });
          saved += inserted.length;
          if (item.confidence < 70) review++;
          if (item.confidence >= 70 && inserted.length) {
            const existing = await socialRest<Array<{ id: string }>>(`social_profiles?organization_id=eq.${row.organization_id || legacyOrg}&entity_type=eq.${input.entity_type}&entity_id=eq.${row.id}&platform=eq.${item.platform}&is_primary=eq.true&select=id&limit=1`);
            if (!existing.length) await socialRest('rpc/social_set_primary', { method: 'POST', body: JSON.stringify({ p_profile_id: inserted[0].id }) });
          }
        }
      } catch (error) { failures.push({ id: row.id, error: error instanceof Error ? error.message : 'Discovery failed' }); }
    }
    return send(res, 200, { processed: rows.length, saved, review, missingWebsite, failures });
  } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : 'Bulk discovery failed' }); }
}
