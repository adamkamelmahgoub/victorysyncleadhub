import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,assertSocialPermission,isSocialOwner,SOCIAL_WORKSPACE_ORG_ID} from '../social-workspace-auth.js';
const json=(res:ServerResponse,status:number,value:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value));};
export default async function handler(req:IncomingMessage,res:ServerResponse){
 try{
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const actor=await socialActor(req),url=new URL(req.url||'/','https://local.invalid'),org=SOCIAL_WORKSPACE_ORG_ID;
  if(url.searchParams.get('organization_id')&&url.searchParams.get('organization_id')!==org)throw new Error('Social reports are internal to Victory Sync');
  assertSocialPermission(actor,org,'reports_view');
  if(!isSocialOwner(actor,org))throw new Error('Organization-wide reports require owner access');
  const days=Number(url.searchParams.get('days')||30);if(![7,30,90,365].includes(days))throw new Error('Choose a 7, 30, 90, or 365 day period');
  const args=[org,days];
  const queries=[
   `select count(*) filter(where direction='inbound' and created_at>=now()-($2::int*interval '1 day'))::int inbound,
      count(*) filter(where direction='outbound' and created_at>=now()-($2::int*interval '1 day'))::int outbound,
      count(*) filter(where direction='inbound' and created_at<now()-($2::int*interval '1 day') and created_at>=now()-(2*$2::int*interval '1 day'))::int previous_inbound,
      count(*) filter(where direction='outbound' and created_at<now()-($2::int*interval '1 day') and created_at>=now()-(2*$2::int*interval '1 day'))::int previous_outbound
      from public.messages where organization_id=$1 and created_at>=now()-(2*$2::int*interval '1 day')`,
   `select count(*)::int total,count(*) filter(where intent='interested')::int interested,count(*) filter(where status='open')::int open,
      count(*) filter(where unread_count>0)::int unread,count(*) filter(where intent='not_interested')::int not_interested,
      count(*) filter(where intent='unsubscribe')::int unsubscribed,count(*) filter(where intent='not_now')::int not_now
      from public.conversations where organization_id=$1 and last_message_at>=now()-($2::int*interval '1 day')`,
   `select count(*)::int total,count(*) filter(where status='sent')::int sent,count(*) filter(where status='due')::int due,
      count(*) filter(where status='skipped')::int skipped,count(*) filter(where status='profile_not_found')::int profile_not_found,
      count(*) filter(where status='wrong_person')::int wrong_person,count(*) filter(where status='expired')::int expired
      from public.dm_tasks where organization_id=$1 and created_at>=now()-($2::int*interval '1 day')`,
   `select count(*) filter(where status='published')::int published,count(*) filter(where status='scheduled')::int scheduled,
      count(*) filter(where status='failed')::int failed,
      coalesce(sum((metrics->>'reach')::numeric) filter(where metrics->>'reach' ~ '^[0-9]+$'),0)::int reach,
      coalesce(sum((metrics->>'likes')::numeric) filter(where metrics->>'likes' ~ '^[0-9]+$'),0)::int likes,
      coalesce(sum((metrics->>'views')::numeric) filter(where metrics->>'views' ~ '^[0-9]+$'),0)::int views,
      coalesce(sum((metrics->>'comments')::numeric) filter(where metrics->>'comments' ~ '^[0-9]+$'),0)::int comments,
      coalesce(sum((metrics->>'shares')::numeric) filter(where metrics->>'shares' ~ '^[0-9]+$'),0)::int shares
      from public.social_post_targets where organization_id=$1 and created_at>=now()-($2::int*interval '1 day')`,
   `select c.channel,count(*) filter(where m.direction='inbound')::int replies,count(*) filter(where m.direction='outbound')::int sent,
      count(distinct c.id)::int conversations,count(distinct c.id) filter(where c.intent='interested')::int interested
      from public.messages m join public.conversations c on c.id=m.conversation_id
      where c.organization_id=$1 and m.created_at>=now()-($2::int*interval '1 day') group by c.channel order by sent desc,replies desc`,
   `with dates as(select (now() at time zone 'Africa/Cairo')::date - n as activity_day from generate_series(0,$2::int-1) n),
      m as(select (created_at at time zone 'Africa/Cairo')::date activity_day,count(*) filter(where direction='inbound')::int replies,
      count(*) filter(where direction='outbound')::int sent from public.messages where organization_id=$1
      and created_at>=now()-($2::int*interval '1 day') group by 1)
      select d.activity_day,coalesce(m.replies,0)::int replies,coalesce(m.sent,0)::int sent from dates d left join m on m.activity_day=d.activity_day order by d.activity_day`,
   `select c.id campaign_id,c.name,c.status,count(e.id)::int enrolled,
      count(e.id) filter(where e.state='replied')::int replied,
      count(e.id) filter(where e.state='completed')::int completed,
      count(e.id) filter(where e.state='stopped')::int stopped,
      count(e.id) filter(where e.state='suppressed')::int suppressed,
      count(e.id) filter(where e.state in ('queued','step_due','sent'))::int active
      from public.dm_campaigns c left join public.dm_enrollments e on e.campaign_id=c.id and e.enrolled_at>=now()-($2::int*interval '1 day')
      where c.organization_id=$1 group by c.id order by enrolled desc,c.created_at desc limit 50`,
   `select a.id account_id,a.label,a.platform,coalesce(a.display_platform,a.platform) display_platform,
      count(distinct c.id)::int conversations,count(m.id) filter(where m.direction='inbound')::int replies,
      count(m.id) filter(where m.direction='outbound')::int sent,
      count(distinct c.id) filter(where c.intent='interested')::int interested
      from public.connected_accounts a left join public.conversations c on c.connected_account_id=a.id and c.last_message_at>=now()-($2::int*interval '1 day')
      left join public.messages m on m.conversation_id=c.id and m.created_at>=now()-($2::int*interval '1 day')
      where a.organization_id=$1 group by a.id order by sent desc,replies desc limit 50`,
   `with first_out as(select conversation_id,min(created_at) at_time from public.messages where organization_id=$1 and direction='outbound'
      and created_at>=now()-($2::int*interval '1 day') group by conversation_id),
      reply as(select f.conversation_id,min(m.created_at) reply_at,f.at_time from first_out f join public.messages m on m.conversation_id=f.conversation_id
      and m.direction='inbound' and m.created_at>f.at_time group by f.conversation_id,f.at_time)
      select (select count(*)::int from first_out) contacted,(select count(*)::int from reply) replied,
      (select round(avg(extract(epoch from reply_at-at_time)/3600)::numeric,2) from reply) average_reply_hours,
      (select round((percentile_cont(0.5) within group(order by extract(epoch from reply_at-at_time)/3600))::numeric,2) from reply) median_reply_hours`,
   `select t.id,t.post_id,p.body,a.label account_label,a.platform,coalesce(a.display_platform,a.platform) display_platform,
      t.published_at,t.permalink,t.metrics from public.social_post_targets t join public.social_posts p on p.id=t.post_id
      join public.connected_accounts a on a.id=t.connected_account_id where t.organization_id=$1 and t.status='published'
      and t.published_at>=now()-($2::int*interval '1 day') order by
      coalesce((t.metrics->>'likes')::int,0)+coalesce((t.metrics->>'comments')::int,0)+coalesce((t.metrics->>'shares')::int,0) desc,t.published_at desc limit 20`,
   `select a.platform,coalesce(a.display_platform,a.platform) display_platform,count(*) filter(where t.status='published')::int published,
      count(*) filter(where t.status='failed')::int failed,
      coalesce(sum((t.metrics->>'likes')::int) filter(where t.metrics->>'likes' ~ '^[0-9]+$'),0)::int likes,
      coalesce(sum((t.metrics->>'comments')::int) filter(where t.metrics->>'comments' ~ '^[0-9]+$'),0)::int comments,
      coalesce(sum((t.metrics->>'shares')::int) filter(where t.metrics->>'shares' ~ '^[0-9]+$'),0)::int shares
      from public.social_post_targets t join public.connected_accounts a on a.id=t.connected_account_id where t.organization_id=$1
      and t.created_at>=now()-($2::int*interval '1 day') group by 1,2 order by published desc`,
  ];
  const result=await Promise.all(queries.map((query)=>mcpPool.query(query,args)));
  const [messages,conversations,tasks,posts,byChannel,daily,campaigns,accounts,response,topPosts,postPlatforms]=result.map((row)=>row.rows);
  return json(res,200,{days,generated_at:new Date().toISOString(),timezone:'Africa/Cairo',messages:messages[0],conversations:conversations[0],tasks:tasks[0],posts:posts[0],byChannel,daily,campaigns,accounts,response:response[0],topPosts,postPlatforms,
    definitions:{reply_rate:'Conversations with an inbound message after their first outbound message divided by conversations with an outbound message in the period.',
      campaign_replied:'Enrollments whose current state is replied; earlier replies that later changed state may be undercounted.',
      post_metrics:'Provider reported or manually entered counts; blank insight fields are not estimates.'}});
 }catch(error){return json(res,400,{error:error instanceof Error?error.message:'Reports unavailable'});}
}
