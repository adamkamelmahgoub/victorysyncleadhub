import type { IncomingMessage,ServerResponse } from 'node:http';
import { mcpPool } from '../mcp-auth.js';

export const config={maxDuration:60};
type Due={id:string;organization_id:string;connected_account_id:string|null;step_id:string;step_type:string;due_at:Date;
  daily_new_dm_cap:number|null;daily_followup_cap:number|null;warmup_enabled:boolean|null;warmup_start_at:Date|null;warmup_daily_increment:number|null};
export default async function handler(req:IncomingMessage,res:ServerResponse){
  const tokens=[process.env.OUTREACH_WORKER_TOKEN,process.env.CRON_SECRET].filter(Boolean);
  if(!tokens.length||!tokens.some((token)=>req.headers.authorization===`Bearer ${token}`)){
    res.statusCode=401;res.end('Unauthorized');return;
  }
  const db=await mcpPool.connect();
  try{
    await db.query('begin');
    const expired=await db.query(`update public.dm_tasks set status='expired',acted_at=now()
      where status='due' and due_at<now()-interval '2 days'`);
    await db.query(`update public.connected_accounts set status='expired',updated_at=now()
      where status='active' and token_expires_at is not null and token_expires_at<=now()`);
    const due=await db.query<Due>(`select e.id,e.organization_id,e.connected_account_id,s.id step_id,s.step_type,
      e.enrolled_at+make_interval(days=>s.day_offset) due_at,
      a.daily_new_dm_cap,a.daily_followup_cap,a.warmup_enabled,a.warmup_start_at,a.warmup_daily_increment
      from public.dm_enrollments e join public.dm_campaigns c on c.id=e.campaign_id and c.organization_id=e.organization_id
      join public.dm_campaign_steps s on s.campaign_id=e.campaign_id and s.position=e.current_step
      left join public.connected_accounts a on a.id=e.connected_account_id
      where c.status='active' and e.state in ('queued','step_due','sent')
        and (e.connected_account_id is null or a.status='active')
        and e.enrolled_at+make_interval(days=>s.day_offset)<=now()
        and not public.social_is_suppressed_internal(e.organization_id,e.entity_type,e.entity_id)
      order by due_at,e.id limit 500`);
    let created=0;
    for(const row of due.rows){
      if(row.connected_account_id){
        await db.query(`select pg_advisory_xact_lock(hashtextextended($1::text,0))`,[row.connected_account_id]);
        const base=row.step_type==='followup_dm'?row.daily_followup_cap:row.daily_new_dm_cap;
        let cap=base||0;
        if(row.warmup_enabled){
          const days=Math.max(0,Math.floor((Date.now()-new Date(row.warmup_start_at||Date.now()).getTime())/86400000));
          cap=Math.min(cap,2+days*(row.warmup_daily_increment||2));
        }
        const count=await db.query<{total:string}>(`select count(*)::text total from public.dm_tasks
          where connected_account_id=$1 and due_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
            and due_at<(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC'
            and status not in ('expired','skipped','profile_not_found','wrong_person')`,[row.connected_account_id]);
        if(Number(count.rows[0].total)>=cap)continue;
      }
      const result=await db.query(`insert into public.dm_tasks(organization_id,enrollment_id,step_id,connected_account_id,due_at)
        values($1,$2,$3,$4,$5) on conflict(enrollment_id,step_id) do nothing returning id`,
        [row.organization_id,row.id,row.step_id,row.connected_account_id,row.due_at]);
      if(result.rowCount){created++;await db.query(`update public.dm_enrollments set state='step_due',next_due_at=$2 where id=$1`,[row.id,row.due_at]);}
    }
    const expiring=await db.query<{id:string;label:string}>(`select id,label from public.connected_accounts
      where status='active' and token_expires_at between now() and now()+interval '7 days'`);
    for(const account of expiring.rows)await db.query(`select public.social_slack_notify('token_expiring',$1::uuid,$2::text)`,
      [account.id,`Social account token expires within 7 days: ${account.label}`]);
    await db.query('commit');
    res.setHeader('content-type','application/json');res.end(JSON.stringify({created,expired:expired.rowCount,token_alerts:expiring.rowCount}));
  }catch(error){await db.query('rollback').catch(()=>{});res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
  finally{db.release();}
}
