import type { IncomingMessage, ServerResponse } from 'node:http';
import { allowedEmail } from '../lib/mcp-auth.js';
import { normalizeSocial, SOCIAL_PLATFORMS, type SocialPlatform } from '../lib/social-handles.js';
import { discoverWebsiteSocials,resolveAmbiguousSocials } from '../lib/social-discovery.js';
import { socialRest } from '../lib/social-service.js';
import { assertSocialOrganization } from '../lib/social-auth.js';

export const config = { api: { bodyParser: false }, maxDuration: 30 };
const LEGACY_ORG = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage): Promise<any> {
  let raw = '';
  for await (const part of req) { raw += part; if (raw.length > 100_000) throw new Error('Request too large'); }
  return JSON.parse(raw || '{}');
}
async function admin(req: IncomingMessage) {
  const token = req.headers.authorization;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (typeof token !== 'string' || !token.startsWith('Bearer ') || !key || !process.env.SUPABASE_URL) throw new Error('Sign in first');
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey:key, authorization:token }, signal:AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Session expired');
  const user = await response.json() as { id: string; email: string; email_confirmed_at?: string };
  if (!user.email_confirmed_at || !allowedEmail(user.email)) throw new Error('CRM administrator access required');
  return user;
}
type Entity = { type: 'lead' | 'contact' | 'company'; id: string; org: string; website: string | null };
async function resolveEntity(type: string, id: string): Promise<Entity> {
  if (!uuid.test(id) || !['lead','contact','company'].includes(type)) throw new Error('Invalid entity');
  if (type === 'lead') {
    const rows = await socialRest<any[]>(`leads?id=eq.${id}&select=id,organization_id,custom_fields&limit=1`);
    if (rows.length) return { type:'lead',id,org:rows[0].organization_id || LEGACY_ORG,
      website: rows[0].custom_fields?.website || rows[0].custom_fields?.open_places?.website || rows[0].custom_fields?.google_places?.website || null };
  } else if (type === 'contact') {
    const rows = await socialRest<any[]>(`crm_contacts?id=eq.${id}&select=id,organization_id,custom_fields&limit=1`);
    if (rows.length) return { type:'contact',id,org:rows[0].organization_id,website:rows[0].custom_fields?.website || null };
  } else {
    const crm = await socialRest<any[]>(`crm_companies?id=eq.${id}&select=id,organization_id,website,custom_fields&limit=1`);
    if (crm.length) return { type:'company',id,org:crm[0].organization_id,website:crm[0].website || crm[0].custom_fields?.website || null };
    const legacy = await socialRest<any[]>(`companies?id=eq.${id}&select=id,website,custom_fields&limit=1`);
    if (legacy.length) return { type:'company',id,org:LEGACY_ORG,website:legacy[0].website || legacy[0].custom_fields?.website || null };
  }
  throw new Error('Entity not found');
}
function platform(value: unknown): SocialPlatform {
  if (typeof value !== 'string' || !SOCIAL_PLATFORMS.includes(value as SocialPlatform)) throw new Error('Invalid platform');
  return value as SocialPlatform;
}
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const user=await admin(req);
    const url = new URL(req.url || '/', 'https://local.invalid');
    const type = url.searchParams.get('entity_type') || '';
    const id = url.searchParams.get('entity_id') || '';
    const entity = await resolveEntity(type,id);
    await assertSocialOrganization(user.id,entity.org);
    if (req.method === 'GET') {
      const rows = await socialRest<any[]>(`social_profiles?organization_id=eq.${entity.org}&entity_type=eq.${entity.type}&entity_id=eq.${entity.id}&select=*&order=platform.asc,confidence.desc`);
      return reply(res,200,{ profiles:rows });
    }
    const input = await body(req);
    if (req.method === 'POST' && input.action === 'find') {
      if (!entity.website) return reply(res,400,{ error:'No company website is stored' });
      const candidates = await resolveAmbiguousSocials(await discoverWebsiteSocials(entity.website),entity.website);
      let saved = 0;
      for (const item of candidates) {
        const inserted = await socialRest<any[]>('social_profiles?on_conflict=organization_id,platform,normalized_handle,entity_type,entity_id', {
          method:'POST', headers:{prefer:'resolution=ignore-duplicates,return=representation'},
          body:JSON.stringify({ organization_id:entity.org,entity_type:entity.type,entity_id:entity.id,
            platform:item.platform,handle:item.handle,normalized_handle:item.normalizedHandle,profile_url:item.profileUrl,
            confidence:item.confidence,is_primary:false,source:item.source }),
        });
        saved += inserted.length;
        if(item.confidence>=70&&inserted.length){
          const current=await socialRest<any[]>(`social_profiles?organization_id=eq.${entity.org}&entity_type=eq.${entity.type}&entity_id=eq.${entity.id}&platform=eq.${item.platform}&is_primary=eq.true&select=id&limit=1`);
          if(!current.length)await socialRest('rpc/social_set_primary',{method:'POST',body:JSON.stringify({p_profile_id:inserted[0].id})});
        }
      }
      return reply(res,200,{ candidates,saved,review:candidates.filter((item)=>item.confidence<70) });
    }
    if (req.method === 'POST') {
      const normalized = normalizeSocial(platform(input.platform), String(input.handle || input.profile_url || ''));
      let rows = await socialRest<any[]>('social_profiles?on_conflict=organization_id,platform,normalized_handle,entity_type,entity_id', {
        method:'POST', headers:{prefer:'resolution=ignore-duplicates,return=representation'},
        body:JSON.stringify({ organization_id:entity.org,entity_type:entity.type,entity_id:entity.id,
          platform:normalized.platform,handle:normalized.handle,normalized_handle:normalized.normalizedHandle,
          profile_url:normalized.profileUrl,source:'manual',confidence:100,verified:Boolean(input.verified),is_primary:false }),
      });
      if (!rows.length) rows = await socialRest<any[]>(`social_profiles?organization_id=eq.${entity.org}&entity_type=eq.${entity.type}&entity_id=eq.${entity.id}&platform=eq.${normalized.platform}&normalized_handle=eq.${encodeURIComponent(normalized.normalizedHandle)}&select=*&limit=1`);
      if (input.is_primary) await socialRest('rpc/social_set_primary', { method:'POST', body:JSON.stringify({p_profile_id:rows[0].id}) });
      return reply(res,200,{ profile:rows[0] });
    }
    const profileId = String(input.profile_id || '');
    if (!uuid.test(profileId)) throw new Error('Invalid profile ID');
    const profile = await socialRest<any[]>(`social_profiles?id=eq.${profileId}&organization_id=eq.${entity.org}&entity_type=eq.${entity.type}&entity_id=eq.${entity.id}&select=*&limit=1`);
    if (!profile.length) return reply(res,404,{error:'Profile not found'});
    if (req.method === 'DELETE') {
      await socialRest(`social_profiles?id=eq.${profileId}`, { method:'DELETE' });
      return reply(res,200,{deleted:true});
    }
    if (req.method === 'PATCH') {
      if (input.is_primary === true) await socialRest('rpc/social_set_primary', { method:'POST', body:JSON.stringify({p_profile_id:profileId}) });
      const update: Record<string, unknown> = {};
      if ('handle' in input) {
        const normalized = normalizeSocial(profile[0].platform,String(input.handle));
        Object.assign(update,{handle:normalized.handle,normalized_handle:normalized.normalizedHandle,profile_url:normalized.profileUrl});
      }
      if ('verified' in input) update.verified = Boolean(input.verified);
      if ('notes' in input) update.notes = typeof input.notes === 'string' ? input.notes.slice(0,2000) : null;
      if (Object.keys(update).length) await socialRest(`social_profiles?id=eq.${profileId}`, { method:'PATCH', body:JSON.stringify(update) });
      return reply(res,200,{updated:true});
    }
    return reply(res,405,{error:'Method not allowed'});
  } catch (error) { return reply(res,400,{error:error instanceof Error ? error.message : 'Social request failed'}); }
}
