import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,socialActorOrganizations} from '../social-workspace-auth.js';

export const config={api:{bodyParser:false},maxDuration:30};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const channels=new Set(['instagram','facebook','linkedin','x','tiktok','threads','whatsapp','email','sms','other']);
const stepTypes=new Set(['follow','engage_post','dm','followup_dm','email','call_task']);
function send(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}
async function body(req:IncomingMessage){let raw='';for await(const part of req){raw+=part;if(raw.length>100000)throw new Error('Request too large');}return JSON.parse(raw||'{}');}
export default async function handler(req:IncomingMessage,res:ServerResponse){let db;
  try{const user=await socialActor(req);const orgs=socialActorOrganizations(user,'campaign_manage');db=await mcpPool.connect();
    if(req.method==='GET'){
      const campaigns=await db.query(`select c.*,coalesce(jsonb_agg(jsonb_build_object('id',s.id,'position',s.position,'day_offset',s.day_offset,
        'channel',s.channel,'step_type',s.step_type,'template_id',s.template_id,'template_body',t.body)
        order by s.position) filter(where s.id is not null),'[]'::jsonb) steps
        from public.dm_campaigns c left join public.dm_campaign_steps s on s.campaign_id=c.id
        left join public.dm_templates t on t.id=s.template_id where c.organization_id=any($1::uuid[])
        group by c.id order by c.created_at desc limit 100`,[orgs]);
      const templates=await db.query(`select id,organization_id,name,body,allow_spintax from public.dm_templates
        where organization_id=any($1::uuid[]) order by name limit 200`,[orgs]);
      const organizations=await db.query(`select id,name from public.organizations where id=any($1::uuid[]) order by name`,[orgs]);
      return send(res,200,{campaigns:campaigns.rows,templates:templates.rows,organizations:organizations.rows});
    }
    if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
    const data=await body(req);const action=String(data.action||'');const org=String(data.organization_id||'');
    if(!uuid.test(org)||!orgs.includes(org))throw new Error('Organization access denied');
    await db.query('begin');
    if(action==='create_template'){
      const name=String(data.name||'').trim(),text=String(data.body||'').trim();
      if(!name||name.length>120||!text||text.length>2000)throw new Error('Invalid template');
      const result=await db.query(`insert into public.dm_templates(organization_id,name,body,allow_spintax,created_by)
        values($1,$2,$3,$4,$5) returning id`,[org,name,text,Boolean(data.allow_spintax),user.id]);
      await db.query('commit');return send(res,200,{id:result.rows[0].id});
    }
    if(action==='create_campaign'){
      const name=String(data.name||'').trim();const steps=Array.isArray(data.steps)?data.steps:[];
      if(!name||name.length>120||!steps.length||steps.length>20)throw new Error('Campaign requires 1 to 20 steps');
      const created=await db.query(`insert into public.dm_campaigns(organization_id,name,created_by)
        values($1,$2,$3) returning id`,[org,name,user.id]);const campaignId=created.rows[0].id;
      for(let index=0;index<steps.length;index++){
        const step=steps[index],channel=String(step.channel||''),type=String(step.step_type||''),day=Number(step.day_offset);
        if(!channels.has(channel)||!stepTypes.has(type)||!Number.isInteger(day)||day<0||day>365)throw new Error(`Invalid step ${index+1}`);
        const templateId=step.template_id||null;if(templateId&&!uuid.test(templateId))throw new Error('Invalid template ID');
        if(templateId){const template=await db.query(`select 1 from public.dm_templates where id=$1 and organization_id=$2`,[templateId,org]);
          if(!template.rowCount)throw new Error('Template belongs to another organization');}
        await db.query(`insert into public.dm_campaign_steps(organization_id,campaign_id,position,day_offset,channel,step_type,template_id)
          values($1,$2,$3,$4,$5,$6,$7)`,[org,campaignId,index+1,day,channel,type,templateId]);
      }
      await db.query('commit');return send(res,200,{id:campaignId,status:'draft'});
    }
    const campaignId=String(data.campaign_id||'');if(!uuid.test(campaignId))throw new Error('Invalid campaign ID');
    const campaign=await db.query(`select status from public.dm_campaigns where id=$1 and organization_id=$2 for update`,[campaignId,org]);
    if(!campaign.rowCount)throw new Error('Campaign not found');
    if(action==='status'){
      const status=String(data.status||'');if(!['active','paused','archived'].includes(status))throw new Error('Invalid campaign status');
      await db.query(`update public.dm_campaigns set status=$2,updated_at=now() where id=$1`,[campaignId,status]);
      await db.query('commit');return send(res,200,{status});
    }
    if(action!=='enroll'||campaign.rows[0].status!=='active')throw new Error('Active campaign required');
    const type=String(data.entity_type||'');const ids:string[]=Array.isArray(data.entity_ids)
      ?[...new Set<string>(data.entity_ids.map((value:unknown)=>String(value)))]:[];
    const accountId=data.connected_account_id||null;
    if(!['lead','contact','company'].includes(type)||!ids.length||ids.length>200||ids.some(id=>!uuid.test(id)))throw new Error('Invalid enrollment selection');
    if(accountId){if(!uuid.test(accountId))throw new Error('Invalid account ID');
      const account=await db.query(`select 1 from public.connected_accounts where id=$1 and organization_id=$2 and status='active'`,[accountId,org]);
      if(!account.rowCount)throw new Error('Active account required');}
    let enrolled=0,suppressed=0;
    for(const id of ids){
      const check=await db.query<{valid:boolean;blocked:boolean}>(`select public.social_entity_belongs($1,$2,$3) valid,
        public.social_is_suppressed_internal($1,$2,$3) blocked`,[org,type,id]);
      if(!check.rows[0].valid)throw new Error(`Entity ${id} does not belong to organization`);
      if(check.rows[0].blocked){suppressed++;continue;}
      const added=await db.query(`insert into public.dm_enrollments(organization_id,campaign_id,entity_type,entity_id,connected_account_id,created_by)
        values($1,$2,$3,$4,$5,$6) on conflict(campaign_id,entity_type,entity_id) do nothing returning id`,[org,campaignId,type,id,accountId,user.id]);
      enrolled+=added.rowCount||0;
    }
    await db.query('commit');return send(res,200,{enrolled,suppressed});
  }catch(error){if(db)await db.query('rollback').catch(()=>{});return send(res,400,{error:error instanceof Error?error.message:'Campaign request failed'});}
  finally{db?.release();}
}
