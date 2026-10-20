import type { IncomingMessage,ServerResponse } from 'node:http';
import { allowedEmail } from '../lib/mcp-auth.js';
import { socialOrganizationIds } from '../lib/social-auth.js';
import { socialRest } from '../lib/social-service.js';

export const config={api:{bodyParser:false},maxDuration:30};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const legacyOrg='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
function send(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
    const key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY,token=req.headers.authorization;
    if(!key||!process.env.SUPABASE_URL||typeof token!=='string'||!token.startsWith('Bearer '))throw new Error('Sign in first');
    const auth=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:key,authorization:token},signal:AbortSignal.timeout(10000)});
    if(!auth.ok)throw new Error('Session expired');
    const user=await auth.json() as{id:string;email:string;email_confirmed_at?:string};
    if(!user.email_confirmed_at||!allowedEmail(user.email))throw new Error('CRM administrator access required');
    let raw='';for await(const part of req){raw+=part;if(raw.length>15000)throw new Error('Request too large');}
    const input=JSON.parse(raw||'{}') as{ids?:unknown;entity_type?:unknown};
    const ids=Array.isArray(input.ids)?[...new Set(input.ids)]:[];
    if(input.entity_type!=='company'||ids.length>200||ids.some((id)=>typeof id!=='string'||!uuid.test(id)))throw new Error('Invalid company selection');
    if(!ids.length)return send(res,200,{handles:[]});
    const orgs=await socialOrganizationIds(user.id);
    const [crm,legacy]=await Promise.all([
      socialRest<Array<{id:string;organization_id:string}>>(`crm_companies?id=in.(${ids.join(',')})&select=id,organization_id`),
      orgs.includes(legacyOrg)?socialRest<Array<{id:string}>>(`companies?id=in.(${ids.join(',')})&select=id`):Promise.resolve([]),
    ]);
    const valid=new Set([...crm.filter((row)=>orgs.includes(row.organization_id)).map((row)=>row.id),...legacy.map((row)=>row.id)]);
    if(valid.size!==ids.length)throw new Error('Organization access denied');
    const handles=await socialRest(`social_primary_handles?organization_id=in.(${orgs.join(',')})&entity_type=eq.company&entity_id=in.(${ids.join(',')})&select=entity_id,instagram,facebook,linkedin,x,tiktok,youtube,threads`);
    return send(res,200,{handles});
  }catch(error){return send(res,400,{error:error instanceof Error?error.message:'Could not load social handles'});}
}
