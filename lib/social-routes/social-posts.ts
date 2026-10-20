import type { IncomingMessage, ServerResponse } from 'node:http';
import { mcpPool } from '../mcp-auth.js';
import { socialActor, socialActorOrganizations, assertSocialPermission, SOCIAL_WORKSPACE_ORG_ID } from '../social-workspace-auth.js';
import { socialAccountToken, socialGraphVersion } from '../social-vault.js';

const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));}
async function body(req:IncomingMessage){let raw='';for await(const part of req){raw+=part;if(raw.length>100000)throw new Error('Request too large');}return JSON.parse(raw||'{}') as Record<string,unknown>;}
type Target={id:string;organization_id:string;post_id:string;connected_account_id:string;platform:string;connection_mode:string;external_account_id:string;status:string;body:string;media_url:string|null;media_type:string|null;post_type:string};
async function graph(path:string,token:string,params:Record<string,string>){
  const response=await fetch(`https://graph.facebook.com/${path}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(25000)});
  const data=await response.json() as {id?:string;error?:{message?:string}};
  if(!response.ok||!data.id)throw new Error(data.error?.message||'Social publish failed');
  return data.id;
}
async function threadsGraph(path:string,token:string,params:Record<string,string>){
  const response=await fetch(`https://graph.threads.net/${path}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(25000)});
  const data=await response.json() as{id?:string;error?:{message?:string}};
  if(!response.ok||!data.id)throw new Error(data.error?.message||'Threads publishing failed');
  return data.id;
}
export async function publishSocialTarget(target:Target){
  const token=await socialAccountToken(target.connected_account_id);
  let providerId:string;
  if(target.platform==='threads'){
    const params:Record<string,string>={text:target.body,media_type:target.media_url?target.media_type==='video'?'VIDEO':'IMAGE':'TEXT'};
    if(target.media_url)params[target.media_type==='video'?'video_url':'image_url']=target.media_url;
    const container=await threadsGraph('me/threads',token,params);
    for(let attempt=0;attempt<8;attempt++){
      const response=await fetch(`https://graph.threads.net/${container}?fields=status,error_message`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
      const state=await response.json() as{status?:string;error_message?:string};
      if(state.status==='FINISHED')break;
      if(state.status==='ERROR'||state.status==='EXPIRED')throw new Error(state.error_message||'Threads container failed');
      if(attempt===7)throw new Error('Threads media processing timed out');
      await new Promise((resolve)=>setTimeout(resolve,1500));
    }
    providerId=await threadsGraph('me/threads_publish',token,{creation_id:container});
  }else if(target.platform==='facebook'){
    const version=await socialGraphVersion(target.organization_id);
    if(target.media_url){providerId=await graph(`${version}/${target.external_account_id}/photos`,token,{url:target.media_url,caption:target.body});}
    else providerId=await graph(`${version}/${target.external_account_id}/feed`,token,{message:target.body});
  }else if(target.platform==='instagram'){
    const version=await socialGraphVersion(target.organization_id);
    if(!target.media_url)throw new Error('Instagram publishing requires a public media URL');
    const payload:Record<string,string>=target.post_type==='reel'?{media_type:'REELS',video_url:target.media_url,caption:target.body}:{image_url:target.media_url,caption:target.body};
    const container=await graph(`${version}/${target.external_account_id}/media`,token,payload);
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
    where t.status='published' and a.connection_mode='api' and t.provider_post_id is not null and (t.last_metrics_at is null or t.last_metrics_at<now()-interval '12 hours')
    order by t.last_metrics_at nulls first,t.published_at desc limit $1`,[limit]);
  let updated=0;
  for(const target of targets.rows){
    try{
      const token=await socialAccountToken(target.connected_account_id);
      if(target.platform==='threads'){
        const response=await fetch(`https://graph.threads.net/${target.provider_post_id}/insights?metric=views,likes,replies,reposts,quotes,shares`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
        if(!response.ok)continue;
        const insights=await response.json() as{data?:Array<{name:string;total_value?:{value?:number};values?:Array<{value:number}>}>};
        const values=Object.fromEntries((insights.data||[]).map((entry)=>[entry.name,entry.total_value?.value??entry.values?.[0]?.value??0]));
        const metrics={views:values.views||0,likes:values.likes||0,comments:values.replies||0,shares:(values.reposts||0)+(values.quotes||0)+(values.shares||0)};
        await mcpPool.query(`update public.social_post_targets set metrics=$2,metrics_source='api',last_metrics_at=now(),updated_at=now() where id=$1`,[target.id,metrics]);updated++;continue;
      }
      const version=await socialGraphVersion(target.organization_id);
      const fields=target.platform==='instagram'?'like_count,comments_count,permalink':'reactions.summary(true),comments.summary(true),shares,permalink_url';
      const response=await fetch(`https://graph.facebook.com/${version}/${target.provider_post_id}?fields=${encodeURIComponent(fields)}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
      if(!response.ok)continue;
      const data=await response.json() as{like_count?:number;comments_count?:number;reactions?:{summary?:{total_count?:number}};comments?:{summary?:{total_count?:number}};shares?:{count?:number};permalink?:string;permalink_url?:string};
      const metrics={likes:data.like_count??data.reactions?.summary?.total_count??0,comments:data.comments_count??data.comments?.summary?.total_count??0,shares:data.shares?.count??0};
      await mcpPool.query(`update public.social_post_targets set metrics=$2,permalink=$3,metrics_source='api',last_metrics_at=now(),updated_at=now() where id=$1`,[target.id,metrics,data.permalink||data.permalink_url||null]);updated++;
    }catch{/* Keep publishing independent from optional metrics. */}
  }
  return updated;
}
export async function processDueSocialPosts(limit=20){
  const rows=await mcpPool.query<Target>(`select t.id,t.organization_id,t.post_id,t.connected_account_id,t.status,p.body,p.media_url,p.media_type,p.post_type,a.platform,a.connection_mode,a.external_account_id
    from public.social_post_targets t join public.social_posts p on p.id=t.post_id join public.connected_accounts a on a.id=t.connected_account_id
    where t.status='scheduled' and p.status='scheduled' and p.scheduled_at<=now() order by p.scheduled_at,t.id limit $1`,[limit]);
  let published=0,failed=0;
  for(const target of rows.rows){
    if(target.connection_mode==='manual'){
      await mcpPool.query(`update public.social_post_targets set status='manual_required',updated_at=now() where id=$1 and status='scheduled'`,[target.id]);
      continue;
    }
    const claim=await mcpPool.query(`update public.social_post_targets set status='publishing',attempts=attempts+1,updated_at=now() where id=$1 and status='scheduled' returning id`,[target.id]);
    if(!claim.rowCount)continue;
    try{await publishSocialTarget(target);published++;}
    catch(error){failed++;await mcpPool.query(`update public.social_post_targets set status='failed',error=$2,updated_at=now() where id=$1`,[target.id,String(error instanceof Error?error.message:error).slice(0,500)]);}
    await mcpPool.query(`update public.social_posts set status=case when exists(select 1 from public.social_post_targets where post_id=$1 and status='failed') then 'failed' when not exists(select 1 from public.social_post_targets where post_id=$1 and status in ('scheduled','publishing','manual_required')) then 'published' else status end,updated_at=now() where id=$1`,[target.post_id]);
  }
  return {published,failed};
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    const actor=await socialActor(req);const data=req.method==='GET'?{}:await body(req);
    const url=new URL(req.url||'/','https://local.invalid');
    const requested=req.method==='GET'?url.searchParams.get('organization_id'):data.organization_id;
    const org=SOCIAL_WORKSPACE_ORG_ID;
    if(requested&&requested!==org)throw new Error('Social workspace is internal to Victory Sync');
    if(!idPattern.test(org))throw new Error('Choose an organization');
    if(req.method==='GET'){
      if(![...socialActorOrganizations(actor,'reports_view'),...socialActorOrganizations(actor,'posts_create')].includes(org))throw new Error('Social workspace access denied');
    }else assertSocialPermission(actor,org,'posts_create');
    if(req.method==='GET'){
      const posts=await mcpPool.query(`select p.*,coalesce(json_agg(json_build_object('id',t.id,'account_id',t.connected_account_id,'platform',coalesce(a.display_platform,a.platform),'connection_mode',a.connection_mode,'profile_url',a.profile_url,'account_label',a.label,'status',t.status,'error',t.error,'provider_post_id',t.provider_post_id,'permalink',t.permalink,'metrics',t.metrics)) filter(where t.id is not null),'[]'::json) targets
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
    if(data.action==='mark_published'||data.action==='update_metrics'){
      assertSocialPermission(actor,org,'posts_publish');
      const targetId=String(data.target_id||'');if(!idPattern.test(targetId))throw new Error('Invalid post target');
      const target=await mcpPool.query<{post_id:string;status:string;connection_mode:string;due:boolean}>(`select t.post_id,t.status,a.connection_mode,(p.status='scheduled' and p.scheduled_at<=now()) due from public.social_post_targets t
        join public.connected_accounts a on a.id=t.connected_account_id join public.social_posts p on p.id=t.post_id where t.id=$1 and t.organization_id=$2`,[targetId,org]);
      if(!target.rows[0]||target.rows[0].connection_mode!=='manual'||(data.action==='mark_published'?target.rows[0].status!=='manual_required'||!target.rows[0].due:target.rows[0].status!=='published'))throw new Error('Manual post is not in the required state');
      const permalink=data.permalink?String(data.permalink):null;
      if(permalink&&(!/^https:\/\//.test(permalink)||permalink.length>2000))throw new Error('Enter an HTTPS post link');
      const supplied=data.metrics&&typeof data.metrics==='object'?data.metrics as Record<string,unknown>:{};
      const metrics:Record<string,number>={};for(const key of ['likes','comments','shares','reach','views'])if(key in supplied){const value=Number(supplied[key]);if(!Number.isInteger(value)||value<0||value>1000000000)throw new Error(`Invalid ${key} count`);metrics[key]=value;}
      if(data.action==='mark_published'){
        await mcpPool.query(`update public.social_post_targets set status='published',permalink=$2,metrics=$3,metrics_source='manual',published_at=now(),updated_at=now() where id=$1`,[targetId,permalink,metrics]);
        await mcpPool.query(`update public.social_posts set status='published',updated_at=now() where id=$1 and not exists(select 1 from public.social_post_targets where post_id=$1 and status<>'published')`,[target.rows[0].post_id]);
      }else await mcpPool.query(`update public.social_post_targets set metrics=metrics||$2::jsonb,metrics_source='manual',last_metrics_at=now(),updated_at=now() where id=$1`,[targetId,JSON.stringify(metrics)]);
      await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id) values($1,$2,$3,'social_post_target',$4)`,[org,actor.id,data.action==='mark_published'?'manual_post_published':'manual_post_metrics_updated',targetId]);
      return send(res,200,{updated:true});
    }
    const content=String(data.body||'').trim(),media=data.media_url?String(data.media_url):null;
    if(!content||content.length>2200)throw new Error('Post text must be 1 to 2,200 characters');
    if(media&&(!/^https:\/\//.test(media)||media.length>2000))throw new Error('Use a public HTTPS media URL');
    const ids=Array.isArray(data.account_ids)?[...new Set(data.account_ids.map(String))]:[];
    if(!ids.length||ids.length>10||ids.some((id)=>!idPattern.test(id)))throw new Error('Choose 1 to 10 connected accounts');
    const accounts=await mcpPool.query<{id:string;platform:string;connection_mode:string;status:string}>(`select id,platform,connection_mode,status from public.connected_accounts where organization_id=$1 and id=any($2::uuid[])`,[org,ids]);
    if(accounts.rowCount!==ids.length||accounts.rows.some((a)=>a.status!=='active'))throw new Error('All accounts must be active in this organization');
    if(accounts.rows.some((a)=>a.connection_mode==='api'&&!['facebook','instagram','threads'].includes(a.platform)))throw new Error('API publishing currently supports Facebook Pages, Instagram Professional accounts, and Threads');
    if(accounts.rows.some((a)=>a.connection_mode==='api'&&a.platform==='instagram'&&!media))throw new Error('Instagram requires a public media URL');
    const postType=String(data.post_type||'feed');if(!['feed','reel','video'].includes(postType))throw new Error('Unsupported post type');
    if(postType==='reel'&&(!media||accounts.rows.some((a)=>a.connection_mode==='api'&&a.platform!=='instagram')))throw new Error('Reels require a public video URL and Instagram Professional API account');
    if(postType==='video'&&(!media||accounts.rows.some((a)=>a.connection_mode==='api'&&a.platform!=='threads')))throw new Error('Video posts require a public video URL and Threads API account');
    const scheduledAt=data.scheduled_at?new Date(String(data.scheduled_at)):null;
    if(scheduledAt&&(!Number.isFinite(scheduledAt.getTime())||scheduledAt.getTime()<Date.now()+60000))throw new Error('Schedule at least one minute ahead');
    if(scheduledAt)assertSocialPermission(actor,org,'posts_publish');
    const status=scheduledAt?'scheduled':'draft';
    const db=await mcpPool.connect();try{
      await db.query('begin');
      const post=await db.query<{id:string}>(`insert into public.social_posts(organization_id,body,media_url,media_type,post_type,status,scheduled_at,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$8) returning id`,[org,content,media,media?(['reel','video'].includes(postType)?'video':'image'):null,postType,status,scheduledAt,actor.id]);
      for(const id of ids)await db.query(`insert into public.social_post_targets(organization_id,post_id,connected_account_id,status) values($1,$2,$3,$4)`,[org,post.rows[0].id,id,status==='draft'?'manual_required':'scheduled']);
      await db.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id) values($1,$2,'post_created','social_post',$3)`,[org,actor.id,post.rows[0].id]);
      await db.query('commit');return send(res,201,{id:post.rows[0].id,status});
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }catch(error){return send(res,400,{error:error instanceof Error?error.message:'Post request failed'});}
}
