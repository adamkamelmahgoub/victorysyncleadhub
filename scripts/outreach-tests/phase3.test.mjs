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
 for(const name of ['20260911_outreach_phase1.sql','20260912_outreach_phase2.sql','20260912_outreach_phase2_admin.sql','20260913_outreach_phase3.sql','20260913_outreach_phase3_admin.sql','20260924_manual_email_without_verification.sql','20261001_unverified_sequence_recipients.sql','20261002_warming_sequence_mailboxes.sql'])await db.exec(await sql('migrations/'+name));
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
for(const uuid of [false,true])test(`Phase 3 state machine (${uuid?'UUID':'integer'} IDs)`,async t=>{
 const f=await fixture(uuid),db=f.db;
 try{
 await t.test('default delays, templates and one pinned job per step',async()=>{
  assert.equal((await db.query("select has_function_privilege('anon','outreach_sequence_inbound(text,text,text,text,text,timestamptz,boolean,timestamptz)','execute') allowed")).rows[0].allowed,false);
  const seq=await admin(db,'get',{id:String(f.sequence.id)});assert.deepEqual(seq.steps.map(s=>s.delay_days),[0,3,4,5]);
  const {l,e}=await enroll(f);await rpc(db)('outreach_sequence_tick');await rpc(db)('outreach_sequence_tick');
  const jobs=(await db.query('select * from outreach_email_jobs where enrollment_id=$1',[String(e.id)])).rows;assert.equal(jobs.length,1);assert.match(jobs[0].body,/Jo/);assert.equal(jobs[0].mailbox_id,f.m.id);
  await assert.rejects(()=>admin(db,'step_save',{id:String(f.sequence.id),stepNumber:5,channel:'email',delayDays:1,subject:'New',body:'New'}),/immutable/);
  await admin(db,'stop',{id:String(e.id)});
 });
 await t.test('reply on same domain cancels queued job, is idempotent and blocks reenrollment',async()=>{
  const {l,e}=await enroll(f);await rpc(db)('outreach_sequence_tick');const from='colleague@'+l.email.split('@')[1],event=randomUUID();
  assert.equal((await reply(f,from,false,null,event)).affected,1);assert.equal((await reply(f,from,false,null,event)).duplicate,true);
  assert.equal((await db.query('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'replied');
  assert.equal((await db.query('select state from outreach_email_jobs where enrollment_id=$1',[String(e.id)])).rows[0].state,'cancelled');
  await assert.rejects(()=>admin(db,'enroll',{id:String(f.sequence.id),leadIds:[String(l.id)]}),/reply/);
 });
 await t.test('reply recorded after job claim prevents provider send',async()=>{
  const {l}=await enroll(f);let sends=0;
  const wrapped=async(name,args)=>{const result=await rpc(db)(name,args);if(name==='outreach_email_claim'&&result)await reply(f,l.email);return result;};
  const service=new EmailService(wrapped,()=>({send:async()=>{sends++;return {messageId:'bad'};}}),undefined,fetch,async()=>{});
  await rpc(db)('outreach_sequence_tick');await db.exec('update outreach_email_jobs set not_before=now();update email_accounts set next_send_after=now()');
  process.env.OUTREACH_EMAIL_ENABLED='true';await service.process();process.env.OUTREACH_EMAIL_ENABLED='false';assert.equal(sends,0);
 });
 await t.test('OOO pauses claimed work and resumes the same step without duplicates',async()=>{
  const {l,e}=await enroll(f);const c=await claim(f);assert.ok(c);await reply(f,l.email,true,new Date(Date.now()+7*86400000).toISOString());
  assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:c.job.id,p_claim:c.job.claim_token}),false);
  await rpc(db)('outreach_sequence_release',{p_job:c.job.id,p_claim:c.job.claim_token});
  await db.query("update sequence_enrollments set resume_at=now()-interval '1 second',next_send_at=now() where id=$1",[e.id]);await rpc(db)('outreach_sequence_tick');
  assert.equal((await db.query('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'active');
  await admin(db,'stop',{id:String(e.id)});
 });
 await t.test('terminal call overrides OOO and never auto-resumes',async()=>{
  const {l,e}=await enroll(f);await reply(f,l.email,true);
  await rpc(db)('outreach_log_call',{p_lead_id:String(l.id),p_disposition:'not_interested',p_next_action_at:null,p_notes:'No',p_request_id:randomUUID(),p_actor:'tester'});
  await rpc(db)('outreach_sequence_tick');assert.equal((await db.query('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'stopped');
 });
 await t.test('successful email creates one linked call and advances three days',async()=>{
  const {l,e}=await enroll(f);const c=await claim(f);
  const args={p_job:c.job.id,p_claim:c.job.claim_token,p_state:'sent',p_message_id:'<first@sender.test>'};await rpc(db)('outreach_email_finish',args);await rpc(db)('outreach_email_finish',args);
  const tasks=(await db.query('select * from contact_tasks where outreach_enrollment_id=$1',[String(e.id)])).rows;assert.equal(tasks.length,1);assert.ok(new Date(tasks[0].due_date)>new Date(Date.now()+47*3600000));
  const changed=(await db.query('select * from sequence_enrollments where id=$1',[e.id])).rows[0];assert.equal(changed.current_step,2);assert.ok(new Date(changed.next_send_at)>new Date(Date.now()+71*3600000));
  await db.query('update sequence_enrollments set next_send_at=now() where id=$1',[e.id]);const second=await claim(f);assert.equal(second.thread.inReplyTo,'<first@sender.test>');
  await db.query("update contact_tasks set due_date=now()-interval '1 second' where lead_id=$1",[l.id]);
  const queue=await rpc(db)('outreach_call_queue');assert.ok(queue.due.some(x=>x.id===l.id&&x.email_context));
  await rpc(db)('outreach_log_call',{p_lead_id:String(l.id),p_disposition:'voicemail',p_next_action_at:new Date(Date.now()+86400000).toISOString(),p_notes:'Followed up',p_request_id:randomUUID(),p_actor:'tester'});
  assert.equal((await db.query('select outreach_status from contact_tasks where id=$1',[tasks[0].id])).rows[0].outreach_status,'completed');await admin(db,'stop',{id:String(e.id)});
 });
 await t.test('stale inbox blocks dispatch and automatic scheduling',async()=>{
  const {e}=await enroll(f);const c=await claim(f);await db.exec("update email_accounts set inbox_checked_at=now()-interval '11 minutes'");
  assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:c.job.id,p_claim:c.job.claim_token}),false);await admin(db,'stop',{id:String(e.id)});await db.exec('update email_accounts set inbox_checked_at=now()');
 });
 await t.test('hard bounce, unsubscribe and mailbox pause override OOO',async()=>{
  for(const action of ['bounce','unsubscribe','mailbox']){
   const {l,e}=await enroll(f);const c=await claim(f);await reply(f,l.email,true);
   if(action==='bounce')await rpc(db)('outreach_email_event',{p_provider:'smtp',p_event:randomUUID(),p_job:c.job.id,p_message:null,p_type:'hard_bounce'});
   else if(action==='unsubscribe')await rpc(db)('outreach_email_unsubscribe',{p_hash:c.job.unsubscribe_hash});
   else await rpc(db)('outreach_email_admin',{p_action:'mailbox_update',p_data:{id:String(f.m.id),status:'paused'}});
   const changed=(await db.query('select status from sequence_enrollments where id=$1',[e.id])).rows[0];assert.ok(['stopped','bounced'].includes(changed.status));
   assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:c.job.id,p_claim:c.job.claim_token}),false);
   // Isolate subsequent cases from the intentionally tripped health rate.
   await db.exec("update outreach_email_jobs set dispatched_at=now()-interval '8 days' where dispatched_at is not null");
   await rpc(db)('outreach_email_admin',{p_action:'mailbox_update',p_data:{id:String(f.m.id),status:'active'}});
  }
 });
 await t.test('email edits stop the cadence without stalling other enrollments',async()=>{
  const {l,e}=await enroll(f);await db.query('update leads set email=$1 where id=$2',[`changed-${randomUUID()}@example.test`,l.id]);
  assert.equal((await db.query('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'stopped');await rpc(db)('outreach_sequence_tick');
 });
 await t.test('email follow-ups never pull an operator callback forward',async()=>{
  const {l,e}=await enroll(f);const c=await claim(f);
  await rpc(db)('outreach_email_finish',{p_job:c.job.id,p_claim:c.job.claim_token,p_state:'sent',p_message_id:'<callback@sender.test>'});
  await rpc(db)('outreach_log_call',{p_lead_id:String(l.id),p_disposition:'callback_scheduled',p_next_action_at:new Date(Date.now()+5*86400000).toISOString(),p_notes:'Requested next week',p_request_id:randomUUID(),p_actor:'tester'});
  await db.query('update contact_tasks set due_date=now() where lead_id=$1',[l.id]);
  const queue=await rpc(db)('outreach_call_queue');assert.equal([...queue.due,...queue.fresh].some(row=>row.id===l.id),false);await admin(db,'stop',{id:String(e.id)});
 });
 await t.test('call steps create one task and advance without sending',async()=>{
  const sequence=await admin(db,'create',{name:'Call then email'});
  await admin(db,'step_save',{id:String(sequence.id),stepNumber:1,channel:'call_task',delayDays:0,body:'Call {{firstName}} at {{company}}'});
  await admin(db,'step_save',{id:String(sequence.id),stepNumber:2,channel:'email',delayDays:1,subject:'Hello',body:'Hello {{firstName}}'});
  await admin(db,'update',{id:String(sequence.id),status:'active'});const {e}=await enroll({...f,sequence});
  await rpc(db)('outreach_sequence_tick');await rpc(db)('outreach_sequence_tick');
  assert.equal((await db.query('select count(*)::int n from contact_tasks where outreach_enrollment_id=$1',[String(e.id)])).rows[0].n,1);
  assert.equal((await db.query('select current_step from sequence_enrollments where id=$1',[e.id])).rows[0].current_step,2);await admin(db,'stop',{id:String(e.id)});
 });
 await t.test('sequence delays remain elapsed UTC hours across database-session DST changes',async()=>{
  for(const [zone,at] of [['Africa/Cairo','2026-04-23T10:00:00Z'],['America/New_York','2026-03-06T10:00:00Z']]){
   const {e}=await enroll(f);await db.query("select set_config('TimeZone',$1,false)",[zone]);
   await rpc(db)('outreach_sequence_advance',{p_enrollment:String(e.id),p_at:at});
   const changed=(await db.query('select next_send_at from sequence_enrollments where id=$1',[e.id])).rows[0];assert.equal(new Date(changed.next_send_at).getTime()-Date.parse(at),72*3600000);
   await admin(db,'stop',{id:String(e.id)});await db.query("select set_config('TimeZone','UTC',false)");
  }
 });
 await t.test('reply after the last email cancels final call tasks and remains on the timeline',async()=>{
  const {l,e}=await enroll(f);
  for(let step=1;step<=4;step++){
   await db.query('update sequence_enrollments set next_send_at=now() where id=$1',[e.id]);const c=await claim(f);
   assert.ok(c);await rpc(db)('outreach_email_finish',{p_job:c.job.id,p_claim:c.job.claim_token,p_state:'sent',p_message_id:`<final-${step}@sender.test>`});
  }
  assert.equal((await db.query('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'completed');
  await reply(f,l.email,true);assert.equal((await db.query('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'completed');
  await reply(f,l.email);assert.equal((await db.query('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'replied');
  assert.equal((await db.query("select count(*)::int n from contact_tasks where lead_id=$1 and outreach_status='pending'",[l.id])).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from activities where lead_id=$1 and description like 'Inbound reply:%'",[l.id])).rows[0].n,1);
 });
 await t.test('unverified contacts enroll and queue while suppression guardrails remain active',async()=>{
  const email=`unverified-${randomUUID()}@example.test`;
  const lead=(await db.query("insert into leads(email,phone,custom_fields) values($1,$2,'{}') returning *",[email,`212${Math.floor(1000000+Math.random()*8999999)}`])).rows[0];
  assert.equal(lead.email_verification_status,'unverified');
  await admin(db,'enroll',{id:String(f.sequence.id),leadIds:[String(lead.id)]});
  const enrollment=(await db.query('select * from sequence_enrollments where lead_id=$1',[lead.id])).rows[0];
  await db.query('update sequence_enrollments set next_send_at=now() where id=$1',[enrollment.id]);
  await rpc(db)('outreach_sequence_tick');
  const job=(await db.query('select * from outreach_email_jobs where enrollment_id=$1',[String(enrollment.id)])).rows[0];
  assert.ok(job);assert.equal(job.operator_verification_override,true);
 });
 await t.test('warming mailboxes can enroll and schedule within their reduced cap',async()=>{
  await db.query("update email_accounts set status='warming' where id=$1",[f.m.id]);
  const {e}=await enroll(f);
  assert.equal(String(e.assigned_mailbox_id),String(f.m.id));
  await db.query('update sequence_enrollments set next_send_at=now() where id=$1',[e.id]);
  await rpc(db)('outreach_sequence_tick');
  assert.equal((await db.query('select count(*)::int n from outreach_email_jobs where enrollment_id=$1',[String(e.id)])).rows[0].n,1);
  await admin(db,'stop',{id:String(e.id)});
  await db.query("update email_accounts set status='active' where id=$1",[f.m.id]);
 });
 await t.test('inbox reconfiguration retains the original scan start and clears health',async()=>{
  const before=(await db.query('select inbox_configured_at from email_accounts where id=$1',[f.m.id])).rows[0].inbox_configured_at;
  await admin(db,'inbox_configure',{id:String(f.m.id),provider:'imap',credentials:encryptCredentials({password:'new-test'},'outreach@sender.test')});
  const after=(await db.query('select inbox_configured_at,inbox_checked_at,inbox_cursor from email_accounts where id=$1',[f.m.id])).rows[0];assert.equal(new Date(after.inbox_configured_at).getTime(),new Date(before).getTime());assert.equal(after.inbox_checked_at,null);assert.deepEqual(after.inbox_cursor,{});
 });
 await t.test('rollback restores Phase 2 functions and removes new columns',async()=>{
  await db.exec(await sql('rollbacks/20260913_outreach_phase3.sql'));
  assert.equal((await db.query("select to_regprocedure('outreach_sequence_tick()') x")).rows[0].x,null);
  assert.ok((await db.query("select to_regprocedure('outreach_email_claim()') x")).rows[0].x);
 });
 }finally{await db.close();}
});

test('OOO parsing handles explicit dates, Cairo/US DST and ambiguous fallback',()=>{
 const msg={subject:'Automatic reply',text:'I return on 2026-04-27.',headers:{},id:'id',from:'a@b.test',receivedAt:'2026-04-20T00:00:00Z'};
 assert.equal(classifyReply(msg,new Date('2026-04-20T00:00:00Z'),'Africa/Cairo').returnAt,'2026-04-27T05:00:00.000Z');
 assert.equal(classifyReply({...msg,text:'Back on March 9, 2026'},new Date('2026-03-06T00:00:00Z'),'America/New_York').returnAt,'2026-03-09T12:00:00.000Z');
 assert.equal(classifyReply({...msg,text:'Back 04/05'},new Date('2026-04-01T00:00:00Z')).returnAt,'2026-04-08T00:00:00.000Z');
 assert.equal(classifyReply({...msg,subject:'Re: your message',headers:{}}).auto,false);
});

test('polling only advances its cursor after recording every reply and fails closed',async()=>{
 let failure=false,recorded=0;const finishes=[];
 const fakeRpc=async(name,args)=>{
  if(name==='outreach_sequence_inbound'){if(failure)throw new Error('Database temporarily unavailable');recorded++;return {};}
  if(args.p_action==='inbox_claim')return {id:1,from_email:'sender@test.com',mailbox_timezone:'America/New_York',inbox_poll_token:'token'};
  if(args.p_action==='inbox_finish')finishes.push(args.p_data);
  return null;
 };
 const service=new SequenceService(fakeRpc,()=>({poll:async()=>({messages:[{id:'incoming',from:'reply@test.com',subject:'Re: Hello',text:'Interested',receivedAt:new Date().toISOString(),headers:{}}],cursor:{uid:5},caughtUp:true})}));
 await service.poll();assert.equal(recorded,1);assert.equal(finishes[0].ok,true);assert.equal(finishes[0].cursor.uid,5);
 failure=true;const result=await service.poll();assert.ok(result.error);assert.equal(finishes[1].ok,false);assert.equal(finishes[1].cursor,undefined);
});
