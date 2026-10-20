import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,assertSocialPermission} from '../social-workspace-auth.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    if(req.method!=='GET'){res.statusCode=405;res.end('Method not allowed');return;}
    const actor=await socialActor(req),url=new URL(req.url||'/','https://local.invalid'),org=url.searchParams.get('organization_id')||'';
    if(!uuid.test(org))throw new Error('Choose an organization');assertSocialPermission(actor,org,'reports_view');
    const days=Math.min(365,Math.max(1,Number(url.searchParams.get('days')||30)||30));
    const [messages,conversations,tasks,posts,byChannel,daily]=await Promise.all([
      mcpPool.query(`select count(*) filter(where direction='inbound')::int inbound,count(*) filter(where direction='outbound')::int outbound from public.messages where organization_id=$1 and created_at>=now()-($2::int*interval '1 day')`,[org,days]),
      mcpPool.query(`select count(*)::int total,count(*) filter(where intent='interested')::int interested,count(*) filter(where status='open')::int open,count(*) filter(where unread_count>0)::int unread from public.conversations where organization_id=$1 and last_message_at>=now()-($2::int*interval '1 day')`,[org,days]),
      mcpPool.query(`select count(*)::int total,count(*) filter(where status='sent')::int sent,count(*) filter(where status='due')::int due from public.dm_tasks where organization_id=$1 and created_at>=now()-($2::int*interval '1 day')`,[org,days]),
      mcpPool.query(`select count(*) filter(where status='published')::int published,count(*) filter(where status='scheduled')::int scheduled,coalesce(sum((metrics->>'reach')::numeric) filter(where metrics->>'reach' ~ '^[0-9]+$'),0)::int reach,coalesce(sum((metrics->>'likes')::numeric) filter(where metrics->>'likes' ~ '^[0-9]+$'),0)::int likes from public.social_post_targets where organization_id=$1 and created_at>=now()-($2::int*interval '1 day')`,[org,days]),
      mcpPool.query(`select c.channel,count(*) filter(where m.direction='inbound')::int replies,count(*) filter(where m.direction='outbound')::int sent from public.messages m join public.conversations c on c.id=m.conversation_id where c.organization_id=$1 and m.created_at>=now()-($2::int*interval '1 day') group by c.channel order by c.channel`,[org,days]),
      mcpPool.query(`select date_trunc('day',m.created_at)::date day,count(*) filter(where m.direction='inbound')::int replies,count(*) filter(where m.direction='outbound')::int sent from public.messages m join public.conversations c on c.id=m.conversation_id where c.organization_id=$1 and m.created_at>=now()-($2::int*interval '1 day') group by 1 order by 1`,[org,days]),
    ]);
    res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify({days,messages:messages.rows[0],conversations:conversations.rows[0],tasks:tasks.rows[0],posts:posts.rows[0],byChannel:byChannel.rows,daily:daily.rows}));
  }catch(error){res.statusCode=400;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:error instanceof Error?error.message:'Reports unavailable'}));}
}
