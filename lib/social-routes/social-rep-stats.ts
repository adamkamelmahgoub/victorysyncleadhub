import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,socialActorOrganizations,SOCIAL_WORKSPACE_ORG_ID} from '../social-workspace-auth.js';

const send=(res:ServerResponse,status:number,data:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));};
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
    const actor=await socialActor(req),org=SOCIAL_WORKSPACE_ORG_ID;
    if(!socialActorOrganizations(actor,'reports_view').includes(org)&&!socialActorOrganizations(actor,'queue_work').includes(org))throw new Error('Stats access denied');
    const days=Number(new URL(req.url||'/','https://local.invalid').searchParams.get('days')||30);
    if(![7,30,90,365].includes(days))throw new Error('Choose a 7, 30, 90, or 365 day period');
    const args=[org,actor.id,days];
    const [accounts,messages,tasks,daily,campaigns,response,obligations]=await Promise.all([
      mcpPool.query(`select a.id,a.label,a.platform,a.status,a.health,a.last_webhook_at,a.last_sync_at,
        count(distinct c.id)::int conversations,count(m.id) filter(where m.direction='outbound')::int sent,
        count(m.id) filter(where m.direction='inbound')::int replies,
        count(distinct c.id) filter(where c.intent='interested')::int interested,
        count(distinct c.id) filter(where c.match_status='unmatched')::int unmatched
        from public.connected_accounts a left join public.conversations c on c.connected_account_id=a.id
          and c.last_message_at>=now()-($3::int*interval '1 day')
        left join public.messages m on m.conversation_id=c.id and m.created_at>=now()-($3::int*interval '1 day')
        where a.organization_id=$1 and a.owner_user_id=$2 and a.external_account_id is not null and a.status<>'disconnected' group by a.id order by sent desc,a.label`,args),
      mcpPool.query(`select count(*) filter(where m.direction='outbound')::int outbound,
        count(*) filter(where m.direction='inbound')::int inbound,
        count(distinct c.id) filter(where c.intent='interested')::int interested
        from public.messages m join public.conversations c on c.id=m.conversation_id
        join public.connected_accounts a on a.id=c.connected_account_id
        where a.organization_id=$1 and a.owner_user_id=$2 and m.created_at>=now()-($3::int*interval '1 day')`,args),
      mcpPool.query(`select count(*)::int planned,count(*) filter(where t.status='due')::int due,
        count(*) filter(where t.status in ('sent','followed','engaged'))::int completed,
        count(*) filter(where t.status='skipped')::int skipped
        from public.dm_tasks t join public.connected_accounts a on a.id=t.connected_account_id
        where a.organization_id=$1 and a.owner_user_id=$2 and t.due_at>=now()-($3::int*interval '1 day')`,args),
      mcpPool.query(`select (m.created_at at time zone 'America/New_York')::date activity_day,
        count(*) filter(where m.direction='outbound')::int sent,count(*) filter(where m.direction='inbound')::int replies
        from public.messages m join public.conversations c on c.id=m.conversation_id
        join public.connected_accounts a on a.id=c.connected_account_id
        where a.organization_id=$1 and a.owner_user_id=$2 and m.created_at>=now()-($3::int*interval '1 day')
        group by 1 order by 1`,args),
      mcpPool.query(`select campaign.name,count(distinct e.id)::int enrolled,
        count(distinct e.id) filter(where e.state='replied')::int replied,
        count(distinct t.id) filter(where t.status='sent')::int sent
        from public.dm_enrollments e join public.connected_accounts a on a.id=e.connected_account_id
        join public.dm_campaigns campaign on campaign.id=e.campaign_id
        left join public.dm_tasks t on t.enrollment_id=e.id
        where a.organization_id=$1 and a.owner_user_id=$2 and e.enrolled_at>=now()-($3::int*interval '1 day')
        group by campaign.id order by sent desc limit 50`,args),
      mcpPool.query(`with first_out as(select c.id,min(m.created_at) sent_at from public.conversations c
        join public.connected_accounts a on a.id=c.connected_account_id
        join public.messages m on m.conversation_id=c.id and m.direction='outbound'
        where a.organization_id=$1 and a.owner_user_id=$2 and m.created_at>=now()-($3::int*interval '1 day') group by c.id),
        first_reply as(select f.id,f.sent_at,min(m.created_at) replied_at from first_out f
        join public.messages m on m.conversation_id=f.id and m.direction='inbound' and m.created_at>f.sent_at group by f.id,f.sent_at)
        select (select count(*)::int from first_out) contacted,(select count(*)::int from first_reply) replied,
        (select round((percentile_cont(0.5) within group(order by extract(epoch from replied_at-sent_at)/3600))::numeric,2) from first_reply) median_reply_hours`,args),
      mcpPool.query(`select count(*) filter(where completed_at is null)::int reply_owed,
        count(*) filter(where completed_at is null and due_at<now())::int overdue,
        count(*) filter(where completed_at>due_at and completed_at>=now()-($3::int*interval '1 day'))::int late_completed,
        round((percentile_cont(0.5) within group(order by extract(epoch from completed_at-created_at)/60)
          filter(where completed_at is not null and completed_at>=now()-($3::int*interval '1 day')))::numeric,1) median_reply_minutes
        from public.social_reply_obligations where organization_id=$1 and rep_user_id=$2`,args),
    ]);
    return send(res,200,{days,generated_at:new Date().toISOString(),timezone:'America/New_York',accounts:accounts.rows,messages:messages.rows[0],
      tasks:tasks.rows[0],daily:daily.rows,campaigns:campaigns.rows,response:response.rows[0],obligations:obligations.rows[0]});
  }catch(error){return send(res,400,{error:error instanceof Error?error.message:'Stats unavailable'});}
}
