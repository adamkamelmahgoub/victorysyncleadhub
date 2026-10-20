import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../mcp-auth.js';
import {renderDmTemplate} from '../dm-template.js';
import {socialActor,socialActorOrganizations} from '../social-workspace-auth.js';
export const config={api:{bodyParser:false},maxDuration:30};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}
type QueueRow={id:string;organization_id:string;enrollment_id:string;step_id:string;connected_account_id:string|null;due_at:Date;
  step_type:string;channel:string;body:string|null;allow_spintax:boolean|null;entity_type:string;entity_id:string;
  first_name:string|null;company:string|null;city:string|null;industry:string|null;google_rating:string|null;review_count:string|null;
  profile_url:string|null;handle:string|null;account_label:string|null};
const queueSql=`select t.id,t.organization_id,t.enrollment_id,t.step_id,t.connected_account_id,t.due_at,
  s.step_type,s.channel,tmp.body,tmp.allow_spintax,e.entity_type,e.entity_id,
  coalesce(l.first_name,ct.first_name,legacy.contact_name) first_name,
  coalesce(l.company,cc.name,legacy.name) company,
  coalesce(l.custom_fields->>'city',cc.city,legacy.city) city,
  coalesce(cc.industry,legacy.industry,l.custom_fields->>'industry') industry,
  l.custom_fields->'google_places'->>'rating' google_rating,
  l.custom_fields->'google_places'->>'review_count' review_count,
  sp.profile_url,sp.handle,a.label account_label
  from public.dm_tasks t join public.dm_enrollments e on e.id=t.enrollment_id
  join public.dm_campaign_steps s on s.id=t.step_id
  left join public.dm_templates tmp on tmp.id=s.template_id
  left join public.connected_accounts a on a.id=t.connected_account_id
  left join public.leads l on e.entity_type='lead' and l.id=e.entity_id
  left join public.crm_contacts ct on e.entity_type='contact' and ct.id=e.entity_id
  left join public.crm_companies cc on e.entity_type='company' and cc.id=e.entity_id
  left join public.companies legacy on e.entity_type='company' and legacy.id=e.entity_id
  left join lateral (select profile_url,handle from public.social_profiles p where p.organization_id=e.organization_id
    and p.entity_type=e.entity_type and p.entity_id=e.entity_id and
      (p.platform=s.channel or s.channel='linkedin' and p.platform in ('linkedin_person','linkedin_company'))
    order by p.is_primary desc,p.confidence desc limit 1) sp on true`;
export default async function handler(req:IncomingMessage,res:ServerResponse){
  let db;
  try{const user=await socialActor(req);const orgs=socialActorOrganizations(user,'queue_work');db=await mcpPool.connect();
    if(req.method==='GET'){
      const url=new URL(req.url||'/','https://local.invalid');const account=url.searchParams.get('account_id');
      if(account&&!uuid.test(account))throw new Error('Invalid account ID');
      const rows=await db.query<QueueRow>(`${queueSql} where t.status='due' and t.due_at<=now()
        and ($1::uuid is null or t.connected_account_id=$1) and t.organization_id=any($2::uuid[])
        order by t.due_at,t.id limit 200`,[account||null,orgs]);
      return reply(res,200,{tasks:rows.rows.map((row)=>({...row,
        rendered_message:row.body?renderDmTemplate(row.body,{first_name:row.first_name,company:row.company,city:row.city,
          industry:row.industry,google_rating:row.google_rating,review_count:row.review_count},row.allow_spintax||false,row.entity_id):null}))});
    }
    if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}
    const input=JSON.parse(raw||'{}');const taskId=String(input.task_id||''),action=String(input.action||'');
    if(!uuid.test(taskId)||!['sent','followed','engaged','skipped','profile_not_found','wrong_person'].includes(action))throw new Error('Invalid task action');
    await db.query('begin');
    const found=await db.query<QueueRow>(`${queueSql} where t.id=$1 and t.status='due' for update of t`,[taskId]);
    const task=found.rows[0];if(!task)throw new Error('Task is no longer due');
    if(!orgs.includes(task.organization_id))throw new Error('Organization access denied');
    if(['sent','followed','engaged'].includes(action)){
      const suppressed=await db.query<{blocked:boolean}>(`select public.social_is_suppressed_internal($1,$2,$3) blocked`,[task.organization_id,task.entity_type,task.entity_id]);
      if(suppressed.rows[0].blocked)throw new Error('Recipient is suppressed');
    }
    if(action==='sent'&&task.connected_account_id){
      await db.query(`select pg_advisory_xact_lock(hashtextextended($1::text,0))`,[task.connected_account_id]);
      const cap=await db.query<{daily_new_dm_cap:number;daily_followup_cap:number;warmup_enabled:boolean;warmup_start_at:Date;warmup_daily_increment:number}>(`select daily_new_dm_cap,daily_followup_cap,warmup_enabled,warmup_start_at,warmup_daily_increment from public.connected_accounts where id=$1 and status='active'`,[task.connected_account_id]);
      if(!cap.rows.length)throw new Error('Connected account inactive');
      const count=await db.query<{total:string}>(`select count(*)::text total from public.dm_tasks t join public.dm_campaign_steps s on s.id=t.step_id
        where t.connected_account_id=$1 and t.status='sent' and s.step_type=$2
          and t.acted_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'`,
        [task.connected_account_id,task.step_type]);
      const settings=cap.rows[0];let limit=task.step_type==='followup_dm'?settings.daily_followup_cap:settings.daily_new_dm_cap;
      if(settings.warmup_enabled){const days=Math.max(0,Math.floor((Date.now()-new Date(settings.warmup_start_at).getTime())/86400000));
        limit=Math.min(limit,2+days*settings.warmup_daily_increment);}
      if(Number(count.rows[0].total)>=limit)throw new Error('Daily account DM cap reached');
    }
    let messageId:string|null=null;
    if(action==='sent'){
      const rendered=task.body?renderDmTemplate(task.body,{first_name:task.first_name,company:task.company,city:task.city,
        industry:task.industry,google_rating:task.google_rating,review_count:task.review_count},task.allow_spintax||false,task.entity_id):String(input.body||'').trim();
      if(!rendered)throw new Error('No message text to log');
      const channel=['instagram','facebook','whatsapp','x','linkedin','email','sms'].includes(task.channel)?task.channel:'other';
      const thread=`manual:${task.entity_type}:${task.entity_id}:${task.channel}`;
      const isCrmCompany=task.entity_type==='company'&&Boolean((await db.query(`select 1 from public.crm_companies where id=$1`,[task.entity_id])).rowCount);
      let rows=await db.query<{id:string}>(`insert into public.conversations(organization_id,channel,connected_account_id,external_thread_id,participant_handle,contact_id,company_id,legacy_company_id,lead_id)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing returning id`,[task.organization_id,channel,task.connected_account_id,thread,task.handle,
          task.entity_type==='contact'?task.entity_id:null,isCrmCompany?task.entity_id:null,
          task.entity_type==='company'&&!isCrmCompany?task.entity_id:null,task.entity_type==='lead'?task.entity_id:null]);
      if(!rows.rows.length)rows=await db.query<{id:string}>(`select id from public.conversations where organization_id=$1 and channel=$2
        and connected_account_id is not distinct from $3 and external_thread_id=$4 limit 1`,[task.organization_id,channel,task.connected_account_id,thread]);
      if(!rows.rows.length)throw new Error('Could not create conversation');
      const message=await db.query<{id:string}>(`insert into public.messages(organization_id,conversation_id,direction,body,sent_via,sent_by,status)
        values($1,$2,'outbound',$3,'manual_assisted',$4,'sent') returning id`,[task.organization_id,rows.rows[0].id,rendered,user.id]);
      messageId=message.rows[0].id;
      await db.query(`update public.conversations set last_outbound_at=now(),last_message_at=now() where id=$1`,[rows.rows[0].id]);
      const company=task.entity_type==='company'?(isCrmCompany?task.entity_id:null):task.entity_type==='contact'
        ?(await db.query<{company_id:string|null}>(`select company_id from public.crm_contacts where id=$1`,[task.entity_id])).rows[0]?.company_id
        :(await db.query<{company_id:string|null}>(`select company_id from public.crm_contacts where source_lead_id=$1 limit 1`,[task.entity_id])).rows[0]?.company_id;
      if(company)await db.query(`insert into public.crm_activities(organization_id,company_id,type,body,occurred_at,created_by,metadata)
        values($1,$2,'dm_sent',$3,now(),$4,jsonb_build_object('channel',$5,'conversation_id',$6))`,
        [task.organization_id,company,rendered,user.id,channel,rows.rows[0].id]);
    }
    await db.query(`update public.dm_tasks set status=$2,acted_at=now(),acted_by=$3,message_id=$4 where id=$1`,[taskId,action,user.id,messageId]);
    if(['wrong_person','profile_not_found'].includes(action))await db.query(`update public.dm_enrollments set state='stopped',stopped_at=now(),stop_reason=$2 where id=$1`,[task.enrollment_id,action]);
    else{
      const next=await db.query<{position:number}>(`select position from public.dm_campaign_steps where campaign_id=(select campaign_id from public.dm_enrollments where id=$1)
        and position>(select current_step from public.dm_enrollments where id=$1) order by position limit 1`,[task.enrollment_id]);
      if(next.rows.length)await db.query(`update public.dm_enrollments set current_step=$2,state='queued',next_due_at=null where id=$1`,[task.enrollment_id,next.rows[0].position]);
      else await db.query(`update public.dm_enrollments set state='completed',stopped_at=now() where id=$1`,[task.enrollment_id]);
    }
    await db.query('commit');return reply(res,200,{status:action,message_id:messageId});
  }catch(error){if(db)await db.query('rollback').catch(()=>{});return reply(res,400,{error:error instanceof Error?error.message:'Queue action failed'});}
  finally{db?.release();}
}
