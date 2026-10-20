import type { IncomingMessage, ServerResponse } from 'node:http';
import { mcpPool } from '../mcp-auth.js';
import { socialActor, assertSocialPermission } from '../social-workspace-auth.js';
import { socialAccountToken, socialGraphVersion } from '../social-vault.js';

const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));}
async function body(req:IncomingMessage){let raw='';for await(const part of req){raw+=part;if(raw.length>100000)throw new Error('Request too large');}return JSON.parse(raw||'{}') as Record<string,unknown>;}
type Target={id:string;organization_id:string;post_id:string;connected_account_id:string;platform:string;external_account_id:string;status:string;body:string;media_url:string|null;media_type:string|null};
async function graph(path:string,token:string,params:Record<string,string>){
  const response=await fetch(`https://graph.facebook.com/${path}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(25000)});
  const data=await response.json() as {id?:string;error?:{message?:string}};
  if(!response.ok||!data.id)throw new Error(data.error?.message||'Social publish failed');
  return data.id;
}
export async function publishSocialTarget(target:Target){
  const token=await socialAccountToken(target.connected_account_id);
  const version=await socialGraphVersion(target.organization_id);
  let providerId:string;
  if(target.platform==='facebook'){
    if(target.media_url){providerId=await graph(`${version}/${target.external_account_id}/photos`,token,{url:target.media_url,caption:target.body});}
    else providerId=await graph(`${version}/${target.external_account_id}/feed`,token,{message:target.body});
  }else if(target.platform==='instagram'){
    if(!target.media_url||target.media_type!=='image')throw new Error('Instagram publishing requires a public image URL');
    const container=await graph(`${version}/${target.external_account_id}/media`,token,{image_url:target.media_url,caption:target.body});
    let ready=false;
    for(let attempt=0;attempt<5;attempt++){
      await new Promise((resolve)=>setTimeout(resolve,2000));
      const response=await fetch(`https://graph.facebook.com/${version}/${container}?fields=status_code`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
      const state=await response.json() as{status_code?:string};
      if(state.status_code==='FINISHED'){ready=true;break;}
      if(state.status_code==='ERROR'||state.status_code==='EXPIRED')throw new Error(`Instagram media processing ${state.status_code.toLowerCase()}`);
    }
    if(!ready)throw new Error('Instagram media processing timed out; check the account before retrying');
    providerId=await graph(`${version}/${target.external_account_id}/media_publish`,token,{creation_id:container});
  }else throw new Error('This channel requires manual publishing');
  await mcpPool.query(`update public.social_post_targets set status='published',provider_post_id=$2,published_at=now(),error=null,updated_at=now() where id=$1`,[target.id,providerId]);
  return providerId;
}
export async function refreshSocialPostMetrics(limit=30){
  const targets=await mcpPool.query<{id:string;organization_id:string;connected_account_id:string;platform:string;provider_post_id:string}>(`select t.id,t.organization_id,t.connected_account_id,a.platform,t.provider_post_id
    from public.social_post_targets t join public.connected_accounts a on a.id=t.connected_account_id
    where t.status='published' and t.provider_post_id is not null and (t.last_metrics_at is null or t.last_metrics_at<now()-interval '12 hours')
    order by t.last_metrics_at nulls first,t.published_at desc limit $1`,[limit]);
  let updated=0;
  for(const target of targets.rows){
    try{
      const token=await socialAccountToken(target.connected_account_id),version=await socialGraphVersion(target.organization_id);
      const fields=target.platform==='instagram'?'like_count,comments_count,permalink':'reactions.summary(true),comments.summary(true),shares,permalink_url';
      const response=await fetch(`https://graph.facebook.com/${version}/${target.provider_post_id}?fields=${encodeURIComponent(fields)}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
      if(!response.ok)continue;
      const data=await response.json() as{like_count?:number;comments_count?:number;reactions?:{summary?:{total_count?:number}};comments?:{summary?:{total_count?:number}};shares?:{count?:number};permalink?:string;permalink_url?:string};
      const metrics={likes:data.like_count??data.reactions?.summary?.total_count??0,comments:data.comments_count??data.comments?.summary?.total_count??0,shares:data.shares?.count??0};
      await mcpPool.query(`update public.social_post_targets set metrics=$2,permalink=$3,last_metrics_at=now(),updated_at=now() where id=$1`,[target.id,metrics,data.permalink||data.permalink_url||null]);updated++;
    }catch{/* Keep publishing independent from optional metrics. */}
  }
  return updated;
}
export async function processDueSocialPosts(limit=20){
  const rows=await mcpPool.query<Target>(`select t.id,t.organization_id,t.post_id,t.connected_account_id,t.status,p.body,p.media_url,p.media_type,a.platform,a.external_account_id
    from public.social_post_targets t join public.social_posts p on p.id=t.post_id join public.connected_accounts a on a.id=t.connected_account_id
    where t.status='scheduled' and p.status='scheduled' and p.scheduled_at<=now() order by p.scheduled_at,t.id limit $1`,[limit]);
  let published=0,failed=0;
  for(const target of rows.rows){
    const claim=await mcpPool.query(`update public.social_post_targets set status='publishing',attempts=attempts+1,updated_at=now() where id=$1 and status='scheduled' returning id`,[target.id]);
    if(!claim.rowCount)continue;
    try{await publishSocialTarget(target);published++;}
    catch(error){failed++;await mcpPool.query(`update public.social_post_targets set status='failed',error=$2,updated_at=now() where id=$1`,[target.id,String(error instanceof Error?error.message:error).slice(0,500)]);}
    await mcpPool.query(`update public.social_posts set status=case when exists(select 1 from public.social_post_targets where post_id=$1 and status='failed') then 'failed' when not exists(select 1 from public.social_post_targets where post_id=$1 and status in ('scheduled','publishing')) then 'published' else status end,updated_at=now() where id=$1`,[target.post_id]);
  }
  return {published,failed};
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    const actor=await socialActor(req);const data=req.method==='GET'?{}:await body(req);
    const url=new URL(req.url||'/','https://local.invalid');
    const org=String(req.method==='GET'?url.searchParams.get('organization_id')||'':data.organization_id||'');
    if(!idPattern.test(org))throw new Error('Choose an organization');
    assertSocialPermission(actor,org,req.method==='GET'?'reports_view':'posts_create');
    if(req.method==='GET'){
      const posts=await mcpPool.query(`select p.*,coalesce(json_agg(json_build_object('id',t.id,'account_id',t.connected_account_id,'platform',a.platform,'account_label',a.label,'status',t.status,'error',t.error,'provider_post_id',t.provider_post_id,'metrics',t.metrics)) filter(where t.id is not null),'[]'::json) targets
        from public.social_posts p left join public.social_post_targets t on t.post_id=p.id left join public.connected_accounts a on a.id=t.connected_account_id
        where p.organization_id=$1 group by p.id order by p.created_at desc limit 200`,[org]);
      return send(res,200,{posts:posts.rows});
    }
    if(req.method==='PATCH'){
      const postId=String(data.id||'');if(!idPattern.test(postId))throw new Error('Invalid post');
      const existing=await mcpPool.query<{id:string;status:string}>(`select id,status from public.social_posts where id=$1 and organization_id=$2`,[postId,org]);
      if(!existing.rows[0]||!['draft','scheduled','failed'].includes(existing.rows[0].status))throw new Error('Only drafts or unpublished posts can be edited');
      const action=String(data.action||'');
      if(action==='cancel'){
        await mcpPool.query(`update public.social_posts set status='draft',scheduled_at=null,updated_by=$2,updated_at=now() where id=$1`,[postId,actor.id]);
        await mcpPool.query(`update public.social_post_targets set status='manual_required',updated_at=now() where post_id=$1 and status in ('scheduled','failed')`,[postId]);
      }else if(action==='reschedule'){
        assertSocialPermission(actor,org,'posts_publish');
        const when=new Date(String(data.scheduled_at||''));if(!Number.isFinite(when.getTime())||when.getTime()<Date.now()+60000)throw new Error('Schedule at least one minute ahead');
        await mcpPool.query(`update public.social_posts set status='scheduled',scheduled_at=$2,updated_by=$3,updated_at=now() where id=$1`,[postId,when,actor.id]);
        await mcpPool.query(`update public.social_post_targets set status='scheduled',error=null,updated_at=now() where post_id=$1 and status in ('manual_required','failed','scheduled')`,[postId]);
      }else throw new Error('Invalid post action');
      await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id) values($1,$2,$3,'social_post',$4)`,[org,actor.id,`post_${action}`,postId]);
      return send(res,200,{updated:true});
    }
    if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
    const content=String(data.body||'').trim(),media=data.media_url?String(data.media_url):null;
    if(!content||content.length>2200)throw new Error('Post text must be 1 to 2,200 characters');
    if(media&&(!/^https:\/\//.test(media)||media.length>2000))throw new Error('Use a public HTTPS media URL');
    const ids=Array.isArray(data.account_ids)?[...new Set(data.account_ids.map(String))]:[];
    if(!ids.length||ids.length>10||ids.some((id)=>!idPattern.test(id)))throw new Error('Choose 1 to 10 connected accounts');
    const accounts=await mcpPool.query<{id:string;platform:string;status:string}>(`select id,platform,status from public.connected_accounts where organization_id=$1 and id=any($2::uuid[])`,[org,ids]);
    if(accounts.rowCount!==ids.length||accounts.rows.some((a)=>a.status!=='active'))throw new Error('All accounts must be active in this organization');
    if(accounts.rows.some((a)=>!['facebook','instagram'].includes(a.platform)))throw new Error('API publishing currently supports Facebook Pages and Instagram Professional accounts');
    if(accounts.rows.some((a)=>a.platform==='instagram'&&!media))throw new Error('Instagram requires a public image URL');
    const scheduledAt=data.scheduled_at?new Date(String(data.scheduled_at)):null;
    if(scheduledAt&&(!Number.isFinite(scheduledAt.getTime())||scheduledAt.getTime()<Date.now()+60000))throw new Error('Schedule at least one minute ahead');
    if(scheduledAt)assertSocialPermission(actor,org,'posts_publish');
    const status=scheduledAt?'scheduled':'draft';
    const db=await mcpPool.connect();try{
      await db.query('begin');
      const post=await db.query<{id:string}>(`insert into public.social_posts(organization_id,body,media_url,media_type,status,scheduled_at,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$7) returning id`,[org,content,media,media?'image':null,status,scheduledAt,actor.id]);
      for(const id of ids)await db.query(`insert into public.social_post_targets(organization_id,post_id,connected_account_id,status) values($1,$2,$3,$4)`,[org,post.rows[0].id,id,status==='draft'?'manual_required':'scheduled']);
      await db.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id) values($1,$2,'post_created','social_post',$3)`,[org,actor.id,post.rows[0].id]);
      await db.query('commit');return send(res,201,{id:post.rows[0].id,status});
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }catch(error){return send(res,400,{error:error instanceof Error?error.message:'Post request failed'});}
}
