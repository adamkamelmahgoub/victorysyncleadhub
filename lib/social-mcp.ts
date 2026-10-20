import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {mcpPool,type McpIdentity} from './mcp-auth.js';
import {normalizeSocial,SOCIAL_PLATFORMS} from './social-handles.js';
import {discoverWebsiteSocials,resolveAmbiguousSocials} from './social-discovery.js';
import {renderDmTemplate} from './dm-template.js';
import {sendSocialReply} from './social-reply-service.js';
import {SOCIAL_WORKSPACE_ORG_ID} from './social-workspace-auth.js';

const id=z.string().uuid();
const entity=z.enum(['lead','contact','company']);
const platform=z.enum(SOCIAL_PLATFORMS);
const result=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});
async function run(who:McpIdentity,name:string,args:unknown,write:boolean,fn:(db:PoolClient,orgs:string[])=>Promise<unknown>){
  const db=await mcpPool.connect();
  try{
    await db.query('begin');await db.query(`select set_config('statement_timeout','15s',true)`);
    const admin=await db.query(`select 1 from public.profiles where id=$1 and global_role='platform_admin'`,[who.userId]);
    const orgs=admin.rowCount?(await db.query<{id:string}>(`select id from public.organizations`)).rows.map(x=>x.id)
      :(await db.query<{org_id:string}>(`select org_id from public.org_users where user_id=$1`,[who.userId])).rows.map(x=>x.org_id);
    const value=await fn(db,orgs);
    if(write)await db.query(`insert into public.mcp_audit_log(user_id,email,client_id,tool,arguments,result_status)
      values($1,$2,$3,$4,$5,'ok')`,[who.userId,who.email,who.clientId,name,JSON.stringify(args)]);
    await db.query('commit');return result(value);
  }catch(error){await db.query('rollback').catch(()=>{});
    if(write)await mcpPool.query(`insert into public.mcp_audit_log(user_id,email,client_id,tool,arguments,result_status,error_message)
      values($1,$2,$3,$4,$5,'error',$6)`,[who.userId,who.email,who.clientId,name,JSON.stringify(args),String(error).slice(0,500)]).catch(()=>{});
    return {isError:true,content:[{type:'text' as const,text:error instanceof Error?error.message:'Social tool failed'}]};
  }finally{db.release();}
}
function allowed(orgs:string[],org:string){if(org!==SOCIAL_WORKSPACE_ORG_ID||!orgs.includes(org))throw new Error('Internal social workspace access denied');}
function tool(server:McpServer,who:McpIdentity,name:string,description:string,shape:z.ZodRawShape,write:boolean,
  fn:(db:PoolClient,args:any,orgs:string[])=>Promise<unknown>){
  const inputSchema='organization_id' in shape?{...shape,organization_id:id.optional()}:shape;
  server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:!write,destructiveHint:false}},
    async(args:any)=>{const scoped={...args,organization_id:args.organization_id||SOCIAL_WORKSPACE_ORG_ID};
      return run(who,name,scoped,write,(db,orgs)=>fn(db,scoped,orgs));});
}
export function registerSocialMcpTools(server:McpServer,who:McpIdentity){
  tool(server,who,'list_social_team_access','List internal team social permissions. Client accounts are excluded.',{organization_id:id},false,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);return(await db.query(`select m.id,m.name,m.email,m.role,m.status,coalesce(p.permissions,'{}'::text[]) permissions
      from public.team_members m left join public.social_team_permissions p on p.team_member_id=m.id
      where m.org_id=$1 and m.client_account_id is null and m.role not in ('client','viewer') order by m.name`,[a.organization_id])).rows;});
  tool(server,who,'set_social_team_access','Set explicit social permissions for one active internal team member.',
    {organization_id:id,team_member_id:id,permissions:z.array(z.enum(['inbox_view','inbox_reply','queue_work','campaign_manage','socials_manage','accounts_manage','posts_create','posts_publish','reports_view','mcp_use']))},true,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);
      const owner=await db.query(`select 1 from public.team_members where auth_user_id=$1 and org_id=$2 and role='owner' and status='active'`,[who.userId,a.organization_id]);
      if(!owner.rowCount)throw new Error('Owner access required');
      const member=await db.query(`select id from public.team_members where id=$1 and org_id=$2 and status='active' and client_account_id is null and role not in ('owner','client','viewer')`,[a.team_member_id,a.organization_id]);
      if(!member.rowCount)throw new Error('Choose an active internal team member');
      await db.query(`insert into public.social_team_permissions(team_member_id,organization_id,permissions,updated_by) values($1,$2,$3,$4)
        on conflict(team_member_id) do update set permissions=excluded.permissions,updated_by=excluded.updated_by,updated_at=now()`,
        [a.team_member_id,a.organization_id,[...new Set(a.permissions)],who.userId]);return {updated:true};});
  tool(server,who,'list_social_posts','List scheduled, draft, and published posts with per-account status.',
    {organization_id:id,limit:z.number().int().min(1).max(100).optional()},false,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);return(await db.query(`select p.id,p.body,p.media_url,p.status,p.scheduled_at,p.created_at,
      coalesce(json_agg(json_build_object('account_id',t.connected_account_id,'status',t.status,'provider_post_id',t.provider_post_id,'metrics',t.metrics)) filter(where t.id is not null),'[]'::json) targets
      from public.social_posts p left join public.social_post_targets t on t.post_id=p.id where p.organization_id=$1 group by p.id order by p.created_at desc limit $2`,
      [a.organization_id,a.limit||50])).rows;});
  tool(server,who,'schedule_social_post','Create a draft or schedule a Facebook Page or Instagram Professional image post. Does not immediately publish.',
    {organization_id:id,body:z.string().min(1).max(2200),account_ids:z.array(id).min(1).max(10),media_url:z.string().url().optional(),scheduled_at:z.string().datetime().optional()},true,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);
      if(a.media_url&&!a.media_url.startsWith('https://'))throw new Error('Media URL must use HTTPS');
      const unique=[...new Set<string>(a.account_ids)];
      const accounts=await db.query<{id:string;platform:string;status:string}>(`select id,platform,status from public.connected_accounts where organization_id=$1 and id=any($2::uuid[])`,[a.organization_id,unique]);
      if(accounts.rows.length!==unique.length||accounts.rows.some(x=>x.status!=='active'||!['facebook','instagram'].includes(x.platform)))throw new Error('Choose active Facebook or Instagram accounts in this organization');
      if(accounts.rows.some(x=>x.platform==='instagram')&&!a.media_url)throw new Error('Instagram requires a public image URL');
      const when=a.scheduled_at?new Date(a.scheduled_at):null;if(when&&when.getTime()<Date.now()+60000)throw new Error('Schedule at least one minute ahead');
      const status=when?'scheduled':'draft';const post=await db.query<{id:string}>(`insert into public.social_posts(organization_id,body,media_url,media_type,status,scheduled_at,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id`,
        [a.organization_id,a.body,a.media_url||null,a.media_url?'image':null,status,when,who.userId]);
      for(const accountId of unique)await db.query(`insert into public.social_post_targets(organization_id,post_id,connected_account_id,status) values($1,$2,$3,$4)`,[a.organization_id,post.rows[0].id,accountId,when?'scheduled':'manual_required']);
      return {id:post.rows[0].id,status};});
  tool(server,who,'get_social_report','Summarize social DM replies, sent messages, interested conversations, and posts.',
    {organization_id:id,days:z.number().int().min(1).max(365).optional()},false,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);const days=a.days||30;
      const messages=await db.query(`select count(*) filter(where direction='inbound')::int replies,count(*) filter(where direction='outbound')::int sent from public.messages where organization_id=$1 and created_at>=now()-($2::int*interval '1 day')`,[a.organization_id,days]);
      const conversations=await db.query(`select count(*) filter(where intent='interested')::int interested,count(*) filter(where unread_count>0)::int unread from public.conversations where organization_id=$1 and last_message_at>=now()-($2::int*interval '1 day')`,[a.organization_id,days]);
      const posts=await db.query(`select count(*) filter(where status='published')::int published,count(*) filter(where status='scheduled')::int scheduled from public.social_post_targets where organization_id=$1`,[a.organization_id]);
      return {days,messages:messages.rows[0],conversations:conversations.rows[0],posts:posts.rows[0]};});
  tool(server,who,'add_social_profile','Add an observed social handle to a CRM record.',
    {organization_id:id,entity_type:entity,entity_id:id,platform,handle:z.string().min(1),is_primary:z.boolean().optional()},true,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);const p=normalizeSocial(a.platform,a.handle);
      const belongs=await db.query(`select public.social_entity_belongs($1,$2,$3) ok`,[a.organization_id,a.entity_type,a.entity_id]);
      if(!belongs.rows[0].ok)throw new Error('Record does not belong to organization');
      const q=await db.query(`insert into public.social_profiles(organization_id,entity_type,entity_id,platform,handle,normalized_handle,profile_url,source,confidence)
        values($1,$2,$3,$4,$5,$6,$7,'manual',100)
        on conflict(organization_id,platform,normalized_handle,entity_type,entity_id) do update set updated_at=now()
        returning id`,[a.organization_id,a.entity_type,a.entity_id,p.platform,p.handle,p.normalizedHandle,p.profileUrl]);
      if(a.is_primary)await db.query(`select public.social_set_primary($1)`,[q.rows[0].id]);return q.rows[0];});
  tool(server,who,'update_social_profile','Edit a stored social handle or its verification state.',
    {profile_id:id,handle:z.string().optional(),verified:z.boolean().optional(),is_primary:z.boolean().optional()},true,
    async(db,a,orgs)=>{const q=await db.query(`select * from public.social_profiles where id=$1 for update`,[a.profile_id]);const p=q.rows[0];
      if(!p)throw new Error('Profile not found');allowed(orgs,p.organization_id);
      if(a.handle){const n=normalizeSocial(p.platform,a.handle);await db.query(`update public.social_profiles set handle=$2,normalized_handle=$3,profile_url=$4,updated_at=now() where id=$1`,
        [p.id,n.handle,n.normalizedHandle,n.profileUrl]);}
      if(a.verified!==undefined)await db.query(`update public.social_profiles set verified=$2,updated_at=now() where id=$1`,[p.id,a.verified]);
      if(a.is_primary)await db.query(`select public.social_set_primary($1)`,[p.id]);return {updated:true};});
  tool(server,who,'find_socials','Discover observed social URLs from a public company website. Supports one or many records.',
    {organization_id:id,entity_type:entity,entity_ids:z.array(id).min(1).max(20)},true,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);const found=[];
      for(const recordId of a.entity_ids){const belongs=await db.query(`select public.social_entity_belongs($1,$2,$3) ok`,[a.organization_id,a.entity_type,recordId]);
        if(!belongs.rows[0].ok)throw new Error('Record does not belong to organization');
        const table=a.entity_type==='company'?'crm_companies':a.entity_type==='contact'?'crm_contacts':'leads';
        const q=await db.query(`select custom_fields${table==='crm_companies'?',website':''} from public.${table} where id=$1`,[recordId]);
        let row=q.rows[0];
        if(!row&&a.entity_type==='company'&&a.organization_id==='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1')
          row=(await db.query(`select website,custom_fields from public.companies where id=$1`,[recordId])).rows[0];
        const website=row?.website||row?.custom_fields?.website||row?.custom_fields?.open_places?.website||row?.custom_fields?.google_places?.website;
        const candidates=website?await resolveAmbiguousSocials(await discoverWebsiteSocials(website),website):[];
        for(const p of candidates){const inserted=await db.query(`insert into public.social_profiles
          (organization_id,entity_type,entity_id,platform,handle,normalized_handle,profile_url,confidence,source)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9)
          on conflict(organization_id,platform,normalized_handle,entity_type,entity_id) do nothing returning id`,
          [a.organization_id,a.entity_type,recordId,p.platform,p.handle,p.normalizedHandle,p.profileUrl,p.confidence,p.source]);
          if(p.confidence>=70&&inserted.rows.length){const primary=await db.query(`select 1 from public.social_profiles where organization_id=$1
            and entity_type=$2 and entity_id=$3 and platform=$4 and is_primary`,[a.organization_id,a.entity_type,recordId,p.platform]);
            if(!primary.rowCount)await db.query(`select public.social_set_primary($1)`,[inserted.rows[0].id]);}}
        found.push({entity_id:recordId,candidates,review:candidates.filter(p=>p.confidence<70)});}
      return found;});
  tool(server,who,'list_conversations','List CRM conversations by organization and optional channel.',
    {organization_id:id,channel:z.string().optional(),limit:z.number().int().min(1).max(100).optional()},false,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);return(await db.query(`select * from public.conversations
      where organization_id=$1 and ($2::text is null or channel=$2) order by last_message_at desc nulls last limit $3`,
      [a.organization_id,a.channel||null,a.limit||50])).rows;});
  tool(server,who,'get_conversation','Get a thread and its messages.',{conversation_id:id},false,
    async(db,a,orgs)=>{const q=await db.query(`select * from public.conversations where id=$1`,[a.conversation_id]);if(!q.rows.length)throw new Error('Conversation not found');
      allowed(orgs,q.rows[0].organization_id);const messages=await db.query(`select * from public.messages where conversation_id=$1 order by created_at limit 500`,[a.conversation_id]);
      return {conversation:q.rows[0],messages:messages.rows};});
  tool(server,who,'draft_dm','Render a campaign template as a draft without sending it.',
    {organization_id:id,template_id:id,first_name:z.string().optional(),company:z.string().optional(),city:z.string().optional(),industry:z.string().optional(),google_rating:z.string().optional(),review_count:z.string().optional()},false,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);const q=await db.query(`select body,allow_spintax from public.dm_templates where id=$1 and organization_id=$2`,[a.template_id,a.organization_id]);
      if(!q.rows.length)throw new Error('Template not found');return {draft:renderDmTemplate(q.rows[0].body,a,q.rows[0].allow_spintax,a.template_id),sent:false};});
  tool(server,who,'enroll_in_dm_campaign','Enroll one eligible CRM record in an active DM campaign.',
    {organization_id:id,campaign_id:id,entity_type:entity,entity_id:id,connected_account_id:id.optional()},true,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);const c=await db.query(`select 1 from public.dm_campaigns where id=$1 and organization_id=$2 and status='active'`,[a.campaign_id,a.organization_id]);
      if(!c.rowCount)throw new Error('Active campaign not found');const blocked=await db.query(`select public.social_is_suppressed_internal($1,$2,$3) blocked`,[a.organization_id,a.entity_type,a.entity_id]);
      if(blocked.rows[0].blocked)throw new Error('Recipient suppressed');const q=await db.query(`insert into public.dm_enrollments
        (organization_id,campaign_id,entity_type,entity_id,connected_account_id,created_by) values($1,$2,$3,$4,$5,$6)
        on conflict(campaign_id,entity_type,entity_id) do nothing returning id`,[a.organization_id,a.campaign_id,a.entity_type,a.entity_id,a.connected_account_id||null,who.userId]);
      return {enrolled:Boolean(q.rowCount),id:q.rows[0]?.id||null};});
  tool(server,who,'dm_queue_today','List due manual DM tasks.',{organization_id:id,connected_account_id:id.optional()},false,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);return(await db.query(`select t.*,s.channel,s.step_type,s.day_offset,e.entity_type,e.entity_id,
      p.profile_url,p.handle,tmp.body template_body from public.dm_tasks t join public.dm_campaign_steps s on s.id=t.step_id
      join public.dm_enrollments e on e.id=t.enrollment_id left join public.dm_templates tmp on tmp.id=s.template_id
      left join lateral(select profile_url,handle from public.social_profiles p where p.organization_id=t.organization_id
        and p.entity_type=e.entity_type and p.entity_id=e.entity_id and p.platform=s.channel order by is_primary desc limit 1)p on true
      where t.organization_id=$1 and t.status='due' and t.due_at<=now() and ($2::uuid is null or t.connected_account_id=$2)
      order by t.due_at limit 100`,[a.organization_id,a.connected_account_id||null])).rows;});
  tool(server,who,'list_connected_accounts','List account health without tokens.',{organization_id:id},false,
    async(db,a,orgs)=>{allowed(orgs,a.organization_id);return(await db.query(`select id,platform,label,username,status,token_expires_at,
      daily_new_dm_cap,daily_followup_cap,warmup_enabled,last_webhook_at,last_error from public.connected_accounts
      where organization_id=$1 order by platform,label`,[a.organization_id])).rows;});
  tool(server,who,'log_dm_sent','Record a DM already sent manually; does not send a message.',
    {conversation_id:id,body:z.string().min(1).max(2000)},true,
    async(db,a,orgs)=>{const q=await db.query(`select * from public.conversations where id=$1 for update`,[a.conversation_id]);
      const c=q.rows[0];if(!c)throw new Error('Conversation not found');allowed(orgs,c.organization_id);
      const type=c.lead_id?'lead':c.contact_id?'contact':c.company_id||c.legacy_company_id?'company':null;
      const entityId=c.lead_id||c.contact_id||c.company_id||c.legacy_company_id;
      if(!type||!entityId)throw new Error('Link the recipient before logging a send');
      const blocked=await db.query(`select public.social_is_suppressed_internal($1,$2,$3) blocked`,[c.organization_id,type,entityId]);
      if(blocked.rows[0].blocked)throw new Error('Recipient suppressed');
      if(c.connected_account_id){await db.query(`select pg_advisory_xact_lock(hashtextextended($1::text,0))`,[c.connected_account_id]);
        const cap=await db.query(`select daily_followup_cap from public.connected_accounts where id=$1 and status='active'`,[c.connected_account_id]);
        if(!cap.rows.length)throw new Error('Account inactive');
        const count=await db.query(`select count(*)::int total from public.messages m join public.conversations t on t.id=m.conversation_id
          where t.connected_account_id=$1 and m.direction='outbound' and m.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'`,[c.connected_account_id]);
        if(count.rows[0].total>=cap.rows[0].daily_followup_cap)throw new Error('Daily account cap reached');}
      const message=await db.query(`insert into public.messages(organization_id,conversation_id,direction,body,sent_via,sent_by,status)
        values($1,$2,'outbound',$3,'manual_assisted',$4,'sent') returning id`,[c.organization_id,c.id,a.body,who.userId]);
      await db.query(`update public.conversations set last_outbound_at=now(),last_message_at=now() where id=$1`,[c.id]);
      if(c.company_id)await db.query(`insert into public.crm_activities(organization_id,company_id,contact_id,type,body,occurred_at,created_by,metadata)
        values($1,$2,$3,'dm_sent',$4,now(),$5,jsonb_build_object('conversation_id',$6,'channel',$7))`,
        [c.organization_id,c.company_id,c.contact_id,a.body,who.userId,c.id,c.channel]);
      return {message_id:message.rows[0].id,sent_via:'manual_assisted'};});
  tool(server,who,'reply_in_conversation','Send a permitted Facebook Page or WhatsApp reply within its 24-hour window.',
    {conversation_id:id,body:z.string().min(1).max(2000)},true,
    async(db,a,orgs)=>{const q=await db.query(`select organization_id from public.conversations where id=$1`,[a.conversation_id]);
      if(!q.rows.length)throw new Error('Conversation not found');allowed(orgs,q.rows[0].organization_id);
      return sendSocialReply(who.userId,a.conversation_id,a.body);});
}
