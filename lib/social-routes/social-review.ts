import type { IncomingMessage, ServerResponse } from 'node:http';
import { socialActor, socialActorOrganizations } from '../social-workspace-auth.js';
import { socialRest } from '../social-service.js';

export const config = { api: { bodyParser: false }, maxDuration: 30 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status; res.setHeader('content-type','application/json'); res.end(JSON.stringify(data));
}
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const user=await socialActor(req);
    const orgs=socialActorOrganizations(user,'socials_manage');
    if(req.method==='GET'){
      if(!orgs.length)return send(res,200,{profiles:[]});
      const profiles=await socialRest(`social_profiles?organization_id=in.(${orgs.join(',')})&confidence=lt.70&review_status=eq.pending&select=id,organization_id,entity_type,entity_id,platform,handle,profile_url,confidence,source,created_at&order=created_at.desc&limit=200`);
      return send(res,200,{profiles});
    }
    if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>2000)throw new Error('Request too large');}
    const input=JSON.parse(raw||'{}') as{profile_id?:string;action?:string};
    if(!input.profile_id||!uuid.test(input.profile_id)||!['approve','reject'].includes(input.action||''))throw new Error('Invalid review action');
    const rows=await socialRest<Array<{id:string;organization_id:string;entity_type:string;entity_id:string;platform:string}>>(`social_profiles?id=eq.${input.profile_id}&select=id,organization_id,entity_type,entity_id,platform&limit=1`);
    const profile=rows[0];if(!profile||!orgs.includes(profile.organization_id))throw new Error('Organization access denied');
    if(input.action==='reject'){
      await socialRest(`social_profiles?id=eq.${profile.id}`,{method:'PATCH',body:JSON.stringify({review_status:'rejected'})});
      return send(res,200,{rejected:true});
    }
    await socialRest(`social_profiles?id=eq.${profile.id}`,{method:'PATCH',body:JSON.stringify({confidence:100,verified:true,source:'manual',review_status:'approved'})});
    const primaries=await socialRest<Array<{id:string}>>(`social_profiles?organization_id=eq.${profile.organization_id}&entity_type=eq.${profile.entity_type}&entity_id=eq.${profile.entity_id}&platform=eq.${profile.platform}&is_primary=eq.true&select=id&limit=1`);
    if(!primaries.length)await socialRest('rpc/social_set_primary',{method:'POST',body:JSON.stringify({p_profile_id:profile.id})});
    return send(res,200,{approved:true});
  }catch(error){return send(res,400,{error:error instanceof Error?error.message:'Social review failed'});}
}
