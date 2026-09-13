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

for(const uuid of [false,true])test('Make bridge and pipeline deletion '+(uuid?'UUID':'integer'),async t=>{
 const f=await fixture(uuid),db=f.db;
 try{
 await db.exec(`create table automation_workflows(id uuid primary key default gen_random_uuid(),name text,is_active boolean,trigger_type text,actions jsonb);create table pipelines(id uuid primary key default gen_random_uuid(),name text);create table pipeline_stages(id uuid primary key default gen_random_uuid(),pipeline_id uuid references pipelines(id) on delete cascade);alter table leads add column pipeline_stage_id uuid references pipeline_stages(id),add column tags text[] default array[]::text[],add column status text default 'new';`);
 await db.exec(await sql('migrations/20260917_pipeline_delete.sql'));
 await db.exec(await sql('migrations/20260918_make_bridge.sql'));
 const make=(action,data={})=>rpc(db)('outreach_make_admin',{p_action:action,p_data:data});
 await make('rotate',{hash:'a'.repeat(64)});
 const {l}=await enroll(f);
 await t.test('events are leased, retried after expiry and acknowledged only with the matching lease',async()=>{
  const events=await make('claim');assert.ok(events.some(e=>e.type==='contact_created'));
  assert.deepEqual(await make('claim'),[]);
  const e=events[0];assert.equal((await make('ack',{id:e.id,lease:randomUUID()})).acknowledged,false);
  await db.exec("update outreach_make_events set lease_until=now()-interval '1 minute'");
  const again=await make('claim');assert.equal(again[0].id,e.id);assert.notEqual(again[0].lease,e.lease);
  for(const event of again)assert.equal((await make('ack',event)).acknowledged,true);
  assert.deepEqual(await make('claim'),[]);
 });
 await t.test('active workflow templates resolve the saved sender and contact variables',async()=>{
  const actions=[{type:'send_email',config:{mailbox_id:String(f.m.id),subject:'Hi {{firstName}}',body:'Write to {{email}}'}}];
  const workflow=(await db.query("insert into automation_workflows(name,is_active,trigger_type,actions) values('Make',true,'make',$1) returning id",[JSON.stringify(actions)])).rows[0];
  const template=await make('template',{workflowId:workflow.id,stepIndex:0,leadId:String(l.id)});
  assert.equal(template.mailboxId,String(f.m.id));assert.equal(template.subject,'Hi Jo');assert.equal(template.body,'Write to '+l.email);
  await db.query('update automation_workflows set is_active=false where id=$1',[workflow.id]);
  await assert.rejects(()=>make('template',{workflowId:workflow.id,stepIndex:0,leadId:String(l.id)}),/active/);
 });
 await t.test('event retries enqueue one email and cannot reuse keys for another recipient or body',async()=>{
  const args={p_lead:String(l.id),p_subject:'Hello',p_body:'Hello Jo',p_mailbox:String(f.m.id),p_enrollment:null,p_token:'token',p_hash:'hash',p_actor:'make',p_scope:null};
  const queued=await rpc(db)('outreach_make_enqueue',{p_event_key:'event-1:step-0',p_args:args});
  const again=await rpc(db)('outreach_make_enqueue',{p_event_key:'event-1:step-0',p_args:{...args,p_token:'new-token',p_hash:'new-hash'}});
  assert.equal(again.id,queued.id);assert.equal(again.duplicate,true);
  await assert.rejects(()=>rpc(db)('outreach_make_enqueue',{p_event_key:'event-1:step-0',p_args:{...args,p_body:'Changed'}}),/different email/);
  assert.equal((await db.query('select count(*) n from outreach_email_jobs')).rows[0].n,1);
  await db.query('update leads set dnc=true where id=$1',[l.id]);
  await assert.rejects(()=>rpc(db)('outreach_make_enqueue',{p_event_key:'event-2',p_args:args}),/verified, unsuppressed/);
 });
 await t.test('deleting one pipeline detaches its contacts and preserves the other pipeline',async()=>{
  const p=(await db.query("insert into pipelines(name) values('Delete'),('Keep') returning id")).rows;
  const stages=[];for(const row of p)stages.push((await db.query('insert into pipeline_stages(pipeline_id) values($1) returning id',[row.id])).rows[0]);
  await db.query('update leads set pipeline_stage_id=$1 where id=$2',[stages[0].id,l.id]);
  await db.query('delete from pipelines where id=$1',[p[0].id]);
  assert.equal((await db.query('select pipeline_stage_id from leads where id=$1',[l.id])).rows[0].pipeline_stage_id,null);
  assert.equal((await db.query('select count(*) n from pipeline_stages')).rows[0].n,1);
  assert.equal((await db.query('select count(*) n from leads')).rows[0].n,1);
 });
 await t.test('secrets stay server-only and rollbacks preserve business data',async()=>{
  assert.equal((await db.query("select has_function_privilege('anon','outreach_make_admin(text,jsonb,text)','execute') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_table_privilege('authenticated','outreach_make_config','select') allowed")).rows[0].allowed,false);
  await make('revoke');assert.equal(await make('secret'),null);
  await db.exec(await sql('rollbacks/20260918_make_bridge.sql'));
  await db.exec(await sql('rollbacks/20260917_pipeline_delete.sql'));
  assert.equal((await db.query('select count(*) n from leads')).rows[0].n,1);
 });
 }finally{await db.close();}
});
