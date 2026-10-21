import {mcpPool} from './mcp-auth.js';
import {socialVaultRead} from './social-vault.js';

type OutboxRow={id:string;organization_id:string;payload:Record<string,unknown>;attempts:number};
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function renderSocialAlert(payload:Record<string,unknown>):string{
  const event=String(payload.event||'');
  const lead=String(payload.lead_id||'');
  const link=idPattern.test(lead)?`\nhttps://app.victorysync.com/leads/${lead}`:'';
  if(event==='audit_booked'){
    const at=Date.parse(String(payload.scheduled_at||''));
    return `Audit booked${Number.isFinite(at)?` for ${new Date(at).toISOString()}`:''}.${link}`;
  }
  if(event==='payment'||event==='refund'){
    const cents=Number(payload.amount_cents||0);
    const amount=Number.isFinite(cents)?`$${(Math.abs(cents)/100).toFixed(2)}`:'a payment';
    return `${event==='refund'?'Refund recorded':'Payment received'}: ${amount}.${link}`;
  }
  if(event==='webhook_silence'){
    const account=String(payload.account_label||'Social account').slice(0,100);
    return `No social message webhook received for 24 hours: ${account}. Reconciliation has been queued.\nhttps://app.victorysync.com/settings`;
  }
  throw new Error('Unsupported social alert');
}

export async function dispatchSocialNotifications(limit=5){
  const db=await mcpPool.connect();let sent=0,failed=0;
  try{
    const secret=await db.query<{id:string}>(`select id from vault.secrets where name='victorysync_slack_meeting_webhook' limit 1`);
    const webhook=secret.rows[0]?await socialVaultRead(secret.rows[0].id):null;
    for(let n=0;n<limit;n++){
      const claimed=await db.query<OutboxRow>(`update public.notification_outbox set status='sending',attempts=attempts+1,updated_at=now()
        where id=(select id from public.notification_outbox where channel='slack' and status in ('queued','failed')
          and next_attempt_at<=now() order by created_at for update skip locked limit 1)
        returning id,organization_id,payload,attempts`);
      const row=claimed.rows[0];if(!row)break;
      let logId:string|null=null;
      try{
        if(!webhook||!/^https:\/\/hooks\.slack\.com\/services\//.test(webhook))throw new Error('Slack webhook is not configured in Vault');
        const message=renderSocialAlert(row.payload);
        const event=String(row.payload.event),lead=String(row.payload.lead_id||row.id);
        const log=await db.query<{id:string}>(`insert into public.slack_notification_log(lead_table,lead_id,event_type,status)
          values('leads',$1,$2,'queued') returning id`,[lead,event]);
        logId=log.rows[0].id;
        const response=await fetch(webhook,{method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({text:message}),signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error(`Slack rejected notification (${response.status})`);
        await db.query(`update public.slack_notification_log set status='delivered',http_status=$2,checked_at=now() where id=$1`,[logId,response.status]);
        await db.query(`update public.notification_outbox set status='sent',sent_at=now(),updated_at=now() where id=$1`,[row.id]);
        sent++;
      }catch(error){
        const detail=String(error).slice(0,500);
        if(logId)await db.query(`update public.slack_notification_log set status='failed',error_message=$2,checked_at=now() where id=$1`,[logId,detail]);
        else await db.query(`insert into public.slack_notification_log(lead_table,lead_id,event_type,status,error_message)
          values('leads',$1,$2,'failed',$3)`,[String(row.payload.lead_id||row.id),String(row.payload.event||'social_alert'),detail]);
        await db.query(`update public.notification_outbox set status='failed',next_attempt_at=now()+($2::integer*interval '1 minute'),
          updated_at=now() where id=$1`,[row.id,Math.min(1440,2**Math.min(row.attempts,10))]);
        failed++;
      }
    }
  }finally{db.release();}
  return {sent,failed};
}
