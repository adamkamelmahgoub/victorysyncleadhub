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
for(const uuid of [false,true])test(`Inbox bounce monitoring (${uuid?'UUID':'integer'})`,async t=>{
 const f=await fixture(uuid),db=f.db;
 try{
 await db.exec(await sql('migrations/20260914_outreach_phase4.sql'));
 await db.exec(await sql('migrations/20260916_outreach_inbox_bounces.sql'));
 await db.exec(await sql('migrations/20260922_smtp_only_manual_outcomes.sql'));
 const smtp=(action,data={})=>rpc(db)('outreach_email_smtp_admin',{p_action:action,p_data:{id:String(f.m.id),...data},p_actor:'tester'});
 await smtp('monitor');
 await t.test('verification keys are encrypted and excluded from dashboard and monitoring metadata',async()=>{
  await smtp('verification_key',{credentials:encryptCredentials({apiKey:'test-key'},'outreach:zerobounce')});
  assert.equal((await smtp('verification_status')).configured,true);
  const dashboard=await rpc(db)('outreach_email_admin',{p_action:'dashboard'});assert.ok(!JSON.stringify(dashboard).includes('encrypted_credentials'));assert.ok(!JSON.stringify(await smtp('status')).includes('enc:v1:'));
  assert.equal((await db.query("select has_table_privilege('anon','outreach_verification_config','select') allowed")).rows[0].allowed,false);
 });
 await t.test('stale inbox blocks both claim and dispatch; explicit check reopens eligibility',async()=>{
  const {l}=await enroll(f);const claimed=await claim(f);assert.ok(claimed);
  await db.exec("update email_accounts set inbox_checked_at=now()-interval '11 minutes'");
  assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:claimed.job.id,p_claim:claimed.job.claim_token}),false);
  await assert.rejects(()=>smtp('monitor'),/Check the receiving inbox/);
  await smtp('release',{job:claimed.job.id,claim:claimed.job.claim_token});assert.equal((await db.query('select state from outreach_email_jobs where id=$1',[claimed.job.id])).rows[0].state,'queued');
  assert.equal(await claim(f),null);
  await db.exec('update email_accounts set inbox_checked_at=now()');
  const retry=await claim(f);assert.ok(retry);assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:retry.job.id,p_claim:retry.job.claim_token}),true);
  await rpc(db)('outreach_email_finish',{p_job:retry.job.id,p_claim:retry.job.claim_token,p_state:'sent',p_message_id:`<${retry.job.id}@sender.test>`});
 });
 await t.test('matching permanent DSN suppresses, stops and auto-pauses; duplicates and mismatches cannot inflate bounces',async()=>{
  const j=(await db.query('select * from outreach_email_jobs limit 1')).rows[0];
  const record=(event,messageIds,recipient,action='failed',status='5.1.1')=>rpc(db)('outreach_email_inbox_report',{p_mailbox:String(f.m.id),p_event:event,p_report:{messageIds,recipients:[{recipient,action,status}]}});
  assert.equal((await record('unrelated',['<other@sender.test>'],j.to_email)).matched,0);
  assert.equal((await record('wrong-recipient',[`<${j.id}@sender.test>`],'other@lead.test')).matched,0);
  assert.equal((await record('delayed',[`<${j.id}@sender.test>`],j.to_email,'delayed','4.2.2')).matched,0);
  assert.equal((await record('failure',[`<${j.id}@sender.test>`],j.to_email)).matched,1);
  assert.equal((await record('failure',[`<${j.id}@sender.test>`],j.to_email)).duplicate,true);
  assert.equal((await db.query("select count(*) n from outreach_email_events where type='hard_bounce'")).rows[0].n,1);
  const lead=(await db.query('select * from leads where id=$1',[j.lead_id])).rows[0];assert.equal(lead.email_verification_status,'invalid');assert.equal(lead.suppressed_reason,'bounced_hard');
  assert.equal((await db.query('select status from email_accounts where id=$1',[f.m.id])).rows[0].status,'paused');
  assert.equal((await db.query("select count(*) n from sequence_enrollments where status in ('active','paused')")).rows[0].n,0);
 });
 await t.test('SMTP-only mode sends without inbox polling and manual outcomes stop and suppress',async()=>{
  await db.exec("delete from outreach_email_events;update email_accounts set status='active',smtp_host='smtp.test',smtp_user='sender@test'");
  await rpc(db)('outreach_email_manual_mode',{p_mailbox:String(f.m.id),p_actor:'tester'});
  let mailbox=(await db.query('select * from email_accounts where id=$1',[f.m.id])).rows[0];assert.equal(mailbox.smtp_monitoring_mode,'manual');assert.equal(mailbox.inbound_provider,'manual');
  await rpc(db)('outreach_email_admin',{p_action:'mailbox_update',p_data:{id:String(f.m.id),status:'active',engineEnabled:true},p_actor:'tester'});
  const {l,e}=await enroll(f);
  const result=await rpc(db)('outreach_sequence_manual_outcome',{p_enrollment:String(e.id),p_outcome:'unsubscribed',p_actor:'tester',p_scope:null});assert.equal(result.status,'stopped');
  const lead=(await db.query('select * from leads where id=$1',[l.id])).rows[0];assert.equal(lead.suppressed_reason,'unsubscribed');
  assert.equal((await db.query("select count(*) n from outreach_email_jobs where enrollment_id=$1 and state='queued'",[String(e.id)])).rows[0].n,0);
  await db.exec("update email_accounts set smtp_monitoring_mode='inbox',inbound_provider='imap',inbox_checked_at=now(),inbox_poll_after=now() where id="+(uuid?`'${f.m.id}'::uuid`:f.m.id));
 });
 await t.test('rollback reinstates original guards and removes monitoring fields',async()=>{
  assert.equal((await db.query("select has_function_privilege('anon','outreach_email_inbox_report(text,text,jsonb)','execute') allowed")).rows[0].allowed,false);
  await db.exec(await sql('rollbacks/20260922_smtp_only_manual_outcomes.sql'));
  await db.exec(await sql('rollbacks/20260916_outreach_inbox_bounces.sql'));
  await db.exec(await sql('rollbacks/20260914_outreach_phase4.sql'));
  await db.exec(await sql('rollbacks/20260913_outreach_phase3.sql'));
 });
 }finally{await db.close();}
});
