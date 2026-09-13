import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const compiled=await mkdtemp(join(tmpdir(),'outreach-sequences-'));
await writeFile(join(compiled,'package.json'),'{"type":"module"}');
for(const name of ['email-security','email-providers','email-service','sequence-service'])await writeFile(join(compiled,`${name}.js`),stripTypeScriptTypes(await readFile(new URL(`../../lib/${name}.ts`,import.meta.url),'utf8'),{mode:'transform'}));
const {EmailService}=await import(pathToFileURL(join(compiled,'email-service.js')).href);
const {classifyReply,SequenceService}=await import(pathToFileURL(join(compiled,'sequence-service.js')).href);
const {encryptCredentials}=await import(pathToFileURL(join(compiled,'email-security.js')).href);
process.env.OUTREACH_ENCRYPTION_KEY_ID='test';process.env.OUTREACH_ENCRYPTION_KEYS=JSON.stringify({test:Buffer.alloc(32,7).toString('base64')});process.env.OUTREACH_PUBLIC_URL='https://crm.example.test';
const sql=async name=>readFile(new URL(`../../supabase/${name}`,import.meta.url),'utf8');
const rpc=db=>async(name,data={})=>(await db.query(`select public.${name}(${Object.keys(data).map((k,i)=>`${k}=>$${i+1}`).join(',')}) result`,Object.values(data))).rows[0].result;
const admin=(db,action,data={})=>rpc(db)('outreach_sequence_admin',{p_action:action,p_data:data,p_actor:'tester'});
async function fixture(uuid=false){
 const db=new PGlite();const pk=uuid?'uuid primary key default gen_random_uuid()':'serial primary key',id=uuid?'uuid':'int';
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table leads(id ${pk},first_name text default 'Jo',last_name text default 'Smith',email text not null,phone text,company text default 'Roofing Co',custom_fields jsonb default '{}',disposition text,contact_attempts int default 0,client_account_id uuid,created_at timestamptz default now(),updated_at timestamptz default now());
 create table activities(id ${pk},lead_id ${id},type text,description text,created_at timestamptz default now());
 create table email_accounts(id ${pk},from_name text,from_email text,smtp_host text,smtp_port int,smtp_user text,smtp_password text,is_default boolean default false,daily_limit int default 100,sent_today int default 0,last_sent_reset_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now());
 create table sequences(id ${pk},name text,status text default 'draft',created_at timestamptz default now());
 create table sequence_steps(id ${pk},sequence_id ${id} references sequences(id),step_number int,subject text,body text,delay_days int default 0);
 create table sequence_enrollments(id ${pk},sequence_id ${id} references sequences(id),lead_id ${id},current_step int default 1,status text default 'active',next_send_at timestamptz,completed_at timestamptz,created_at timestamptz default now());
 create table contact_tasks(id ${pk},lead_id ${id},title text,description text,due_date timestamptz,priority text,is_completed boolean default false,completed_at timestamptz,created_at timestamptz default now());
 create table email_logs(id ${pk},lead_id ${id},status text default 'queued');create table campaign_leads(id ${pk},lead_id ${id},status text default 'queued');`);
 for(const name of ['20260911_outreach_phase1.sql','20260912_outreach_phase2.sql','20260912_outreach_phase2_admin.sql','20260913_outreach_phase3.sql','20260913_outreach_phase3_admin.sql'])await db.exec(await sql('migrations/'+name));
 await db.exec("create or replace function outreach_email_window(p_at timestamptz,p_timezone text) returns boolean language sql stable as $$select true$$;create or replace function outreach_call_window(p_at timestamptz,p_timezone outreach_timezone) returns boolean language sql stable as $$select true$$");
 await rpc(db)('outreach_email_admin',{p_action:'settings',p_data:{primaryDomains:['primary.test'],engineEnabled:true}});
 const d=await rpc(db)('outreach_email_admin',{p_action:'domain_create',p_data:{domain:'sender.test'}});
 await rpc(db)('outreach_email_admin',{p_action:'domain_verify',p_data:{id:d.id,spf:true,dkim:true,dmarc:true}});
 const m=await rpc(db)('outreach_email_admin',{p_action:'mailbox_create',p_data:{fromName:'Sender',fromEmail:'outreach@sender.test',domainId:d.id,provider:'smtp',encryptedCredentials:encryptCredentials({password:'test'},'outreach@sender.test')}});
 await db.exec('alter table email_accounts disable trigger outreach_mailbox_guard');await db.query("update email_accounts set warmup_started_at=now()-interval '22 days',status='active',email_engine_enabled=true,inbound_provider='imap',inbox_configured_at=now(),inbox_checked_at=now() where id=$1",[m.id]);await db.exec('alter table email_accounts enable trigger outreach_mailbox_guard');
 const sequence=(await admin(db,'list'))[0];await admin(db,'update',{id:String(sequence.id),status:'active'});
 return {db,m,sequence};
}
async function enroll(f,email=`lead@${randomUUID()}.test`){
 const l=(await f.db.query("insert into leads(email,phone,custom_fields) values($1,$2,'{\"timezone\":\"America/New_York\",\"city\":\"Albany\"}') returning *",[email,`212${Math.floor(1000000+Math.random()*8999999)}`])).rows[0];
 await rpc(f.db)('outreach_email_admin',{p_action:'verification',p_data:{id:String(l.id),email,status:'valid',provider:'test'}});
 await admin(f.db,'enroll',{id:String(f.sequence.id),leadIds:[String(l.id)]});
 const e=(await f.db.query('select * from sequence_enrollments where lead_id=$1',[l.id])).rows[0];return {l,e};
}
async function claim(f){await rpc(f.db)('outreach_sequence_tick');await f.db.exec("update outreach_email_jobs set not_before=now();update email_accounts set next_send_after=now()");return rpc(f.db)('outreach_email_claim');}
async function reply(f,from,auto=false,returnAt=null,event=randomUUID()){
 return rpc(f.db)('outreach_sequence_inbound',{p_mailbox:String(f.m.id),p_event:event,p_from:from,p_subject:auto?'Out of office':'Re: Hello',p_body:'Reply text',p_received:new Date().toISOString(),p_auto:auto,p_return:returnAt});
}
for(const uuid of [false,true])test(`Phase 4 domains and metrics (${uuid?'UUID':'integer'})`,async t=>{
 const f=await fixture(uuid),db=f.db;try {
 await db.exec(await sql('migrations/20260914_outreach_phase4.sql'));
 const domainAdmin=(action,data)=>rpc(db)('outreach_email_domain_admin',{p_action:action,p_data:data,p_actor:'tester'});
 const metrics=(action,data,scope=null)=>rpc(db)('outreach_email_metrics',{p_action:action,p_data:data,p_actor:'tester',p_scope:scope});
 const d=(await db.query("select * from sending_domains where domain='sender.test'")).rows[0];
 await t.test('primary opt-in is honored at claim and final dispatch; revoked opt-in cancels',async()=>{
  await domainAdmin('update',{id:d.id,allowPrimarySending:true});await db.query('update sending_domains set is_primary=true where id=$1',[d.id]);
  const {l}=await enroll(f);const c=await claim(f);assert.ok(c);assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:c.job.id,p_claim:c.job.claim_token}),true);
  await rpc(db)('outreach_email_finish',{p_job:c.job.id,p_claim:c.job.claim_token,p_state:'sent',p_message_id:'<metrics@sender.test>'});
  await reply(f,l.email);await reply(f,l.email,false,null,'second-reply');
  const week=new Date().toISOString().slice(0,10);let report=await metrics('report',{week});assert.equal(report.email[0].sent,1);assert.equal(Number(report.email[0].reply_rate),1);assert.equal(report.email[0].open_rate,null);
  const inbound=(await db.query('select id from outreach_inbound_messages limit 1')).rows[0];await metrics('reply_outcome',{id:inbound.id,positive:true});
  await rpc(db)('outreach_email_event',{p_provider:'smtp',p_event:'delivered1',p_job:c.job.id,p_message:null,p_type:'delivered'});await rpc(db)('outreach_email_event',{p_provider:'smtp',p_event:'delivered2',p_job:c.job.id,p_message:null,p_type:'delivered'});
  report=await metrics('report',{week});assert.equal(report.email[0].delivered,1);assert.equal(Number(report.email[0].positive_reply_rate),1);
  const scoped=await metrics('report',{week},randomUUID());assert.equal(scoped.email[0].sent,0);assert.deepEqual(scoped.replyReview,[]);
  await domainAdmin('update',{id:d.id,allowPrimarySending:false});assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:c.job.id,p_claim:c.job.claim_token}),false);
  assert.equal((await db.query('select status from email_accounts')).rows[0].status,'paused');
 });
 await t.test('call classifications are idempotent and held time is counted separately',async()=>{
  const l=(await db.query("insert into leads(email,phone,custom_fields) values('call@metrics.test','2125559901','{\"timezone\":\"America/New_York\"}') returning *")).rows[0];
  const request=randomUUID();const args={p_lead_id:String(l.id),p_disposition:'meeting_booked',p_next_action_at:new Date(Date.now()+86400000).toISOString(),p_notes:'Booked',p_request_id:request,p_actor:'tester'};
  await rpc(db)('outreach_log_call',args);await rpc(db)('outreach_log_call',args);
  const a=(await db.query("select * from outreach_audit where reason='call_logged'")).rows[0];
  await metrics('call_outcome',{id:a.id,connected:true,conversation:true,meetingHeldAt:new Date().toISOString()});
  await metrics('call_outcome',{id:a.id,connected:true,conversation:true,meetingHeldAt:new Date().toISOString()});
  const r=await metrics('report',{week:new Date().toISOString().slice(0,10)});assert.deepEqual(r.calls,{dials:1,connects:1,conversations:1,meetingsBooked:1,meetingsHeld:1,unclassified:0});
  await assert.rejects(()=>metrics('call_outcome',{id:a.id,connected:false,conversation:true}),/check constraint/);
  await assert.rejects(()=>metrics('call_outcome',{id:a.id,connected:true,conversation:true,meetingHeldAt:new Date(Date.now()+86400000).toISOString()}),/future/);
  assert.equal((await metrics('report',{week:new Date().toISOString().slice(0,10)},randomUUID())).calls.dials,0);
 });
 await t.test('DNS configuration validates host ownership and deletion blocks mailbox resurrection',async()=>{
  await assert.rejects(()=>domainAdmin('update',{id:d.id,spfHost:'other.test'}),/belong/);
  await domainAdmin('update',{id:d.id,spfHost:'send.sender.test',dkimSelector:'resend',allowPrimarySending:true});
  assert.equal((await db.query('select spf_verified from sending_domains where id=$1',[d.id])).rows[0].spf_verified,false);
  await domainAdmin('delete',{id:d.id});await domainAdmin('delete',{id:d.id});
  const dashboard=await rpc(db)('outreach_email_admin',{p_action:'dashboard'});assert.deepEqual(dashboard.domains,[]);
  assert.equal((await db.query('select count(*) n from outreach_email_jobs')).rows[0].n,1);
  await assert.rejects(()=>rpc(db)('outreach_email_admin',{p_action:'mailbox_update',p_data:{id:String(f.m.id),status:'warming',engineEnabled:true}}),/cannot send/);
  assert.equal((await db.query("select has_function_privilege('anon','outreach_email_metrics(text,jsonb,text,text)','execute') allowed")).rows[0].allowed,false);
 });
 await t.test('readding an archived domain restores it without resuming senders or resetting identity',async()=>{
  await db.exec(await sql('migrations/20260915_outreach_domain_restore.sql'));
  const create=data=>rpc(db)('outreach_email_domain_create',{p_data:data,p_actor:'tester'});
  const restored=await create({domain:'SENDER.TEST',dkimSelector:'new',isPrimary:false});assert.equal(restored.id,d.id);assert.equal(restored.restored,true);assert.equal(restored.is_primary,true);assert.equal(restored.spf_verified,false);
  const m=(await db.query('select * from email_accounts')).rows[0];assert.equal(m.status,'paused');assert.equal(m.email_engine_enabled,false);
  const repeated=await create({domain:'sender.test'});assert.equal(repeated.alreadyExists,true);assert.equal(repeated.id,d.id);
  const fresh=await create({domain:'another.test',dkimSelector:'default'});assert.equal(fresh.domain,'another.test');
  await db.query("update sending_domains set status='burned',deleted_at=now() where id=$1",[fresh.id]);await assert.rejects(()=>create({domain:'another.test'}),/Burned/);
  assert.equal((await db.query("select has_function_privilege('anon','outreach_email_domain_create(jsonb,text)','execute') allowed")).rows[0].allowed,false);
  await db.exec(await sql('rollbacks/20260915_outreach_domain_restore.sql'));
 });
 await t.test('rollback restores original functions and removes new fields',async()=>{
  await db.exec(await sql('rollbacks/20260914_outreach_phase4.sql'));
  assert.equal((await db.query("select count(*) n from information_schema.columns where table_name='sending_domains' and column_name='allow_primary_sending'")).rows[0].n,0);
  await db.exec(await sql('rollbacks/20260913_outreach_phase3.sql'));
 });
 }finally{await db.close();}
});
