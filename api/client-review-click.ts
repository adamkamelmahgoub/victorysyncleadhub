import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';

const tokenSchema=z.string().uuid();
type RequestRow={id:string;clicked_at:string|null;sub_accounts:{google_review_link:string|null}|null};
export default async function handler(req:IncomingMessage,res:ServerResponse) {
  if(req.method!=='GET'){res.statusCode=405;res.end('Method not allowed');return}
  const match=(req.url||'').match(/^\/r\/([0-9a-fA-F-]{36})(?:\?|$)/);
  const parsed=tokenSchema.safeParse(match?.[1]);
  if(!parsed.success){res.statusCode=404;res.end('Review link unavailable');return}
  const base=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;
  if(!base||!key){res.statusCode=503;res.end('Review link unavailable');return}
  const headers={apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'};
  try {
    const response=await fetch(`${base}/rest/v1/review_requests?click_token=eq.${parsed.data}&select=id,clicked_at,sub_accounts(google_review_link)&limit=1`,{headers,signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Lookup failed');
    const rows=await response.json() as RequestRow[];
    const target=rows[0]?.sub_accounts?.google_review_link;
    if(!target||!/^https:\/\//i.test(target)){res.statusCode=404;res.end('Review link unavailable');return}
    if(!rows[0].clicked_at)await fetch(`${base}/rest/v1/review_requests?id=eq.${rows[0].id}&clicked_at=is.null`,{method:'PATCH',headers:{...headers,prefer:'return=minimal'},body:JSON.stringify({clicked_at:new Date().toISOString(),status:'clicked'}),signal:AbortSignal.timeout(10000)});
    res.statusCode=302;res.setHeader('location',target);res.setHeader('cache-control','no-store');res.end();
  } catch {res.statusCode=503;res.end('Review link temporarily unavailable')}
}
