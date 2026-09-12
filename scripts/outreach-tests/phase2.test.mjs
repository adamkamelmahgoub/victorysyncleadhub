import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {randomUUID,createHmac} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const compiled=await mkdtemp(join(tmpdir(),'outreach-email-model-'));
await writeFile(join(compiled,'package.json'),'{"type":"module"}');
for(const name of ['email-security','email-providers','email-service']) await writeFile(join(compiled,`${name}.js`),stripTypeScriptTypes(await readFile(new URL(`../../lib/${name}.ts`,import.meta.url),'utf8'),{mode:'transform'}));
const security=await import(pathToFileURL(join(compiled,'email-security.js')).href);
const providers=await import(pathToFileURL(join(compiled,'email-providers.js')).href);
const {EmailService}=await import(pathToFileURL(join(compiled,'email-service.js')).href);
const readSql=async name=>readFile(new URL(`../../supabase/${name}`,import.meta.url),'utf8');
const up1=await readSql('migrations/20260911_outreach_phase1.sql');
const up2=await readSql('migrations/20260912_outreach_phase2.sql');
const adminSql=await readSql('migrations/20260912_outreach_phase2_admin.sql');
const down2=await readSql('rollbacks/20260912_outreach_phase2.sql');
process.env.OUTREACH_ENCRYPTION_KEY_ID='test';process.env.OUTREACH_ENCRYPTION_KEYS=JSON.stringify({test:Buffer.alloc(32,7).toString('base64')});
process.env.OUTREACH_PUBLIC_URL='https://crm.example.test';
async function fixture(uuid=false,openWindow=false) {
 const db=new PGlite();const id=uuid?'uuid':'integer';const pk=uuid?'uuid primary key default gen_random_uuid()':'serial primary key';
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table leads(id ${pk},first_name text default 'Test',last_name text default 'Contact',email text not null,phone text,company text,custom_fields jsonb not null default '{}',disposition text,contact_attempts integer not null default 0,client_account_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
 create table activities(id ${pk},lead_id ${id} references leads(id) on delete cascade,type text not null,description text not null,created_at timestamptz default now());
 create table email_accounts(id ${pk},from_name text not null,from_email text not null,smtp_host text not null,smtp_port integer not null default 587,smtp_user text not null,smtp_password text not null,is_default boolean default false,daily_limit integer default 100,sent_today integer default 0,last_sent_reset_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now());
 create table sequence_enrollments(id ${pk},lead_id ${id},status text not null default 'active');
 create table email_logs(id ${pk},lead_id ${id},status text default 'queued');create table campaign_leads(id ${pk},lead_id ${id},status text default 'queued');`);
 await db.exec(up1);await db.exec(up2);await db.exec(adminSql);
 // Capacity tests isolate budgeting from wall-clock time. Window behavior is tested independently below.
 if(openWindow) await db.exec("create or replace function public.outreach_email_window(p_at timestamptz,p_timezone text) returns boolean language sql stable as $$ select true $$");
 return db;
}
const rpc=db=>async(name,args={})=>(await db.query(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) as result`,Object.values(args))).rows[0].result;
const admin=(db,action,data={})=>rpc(db)('outreach_email_admin',{p_action:action,p_data:data,p_actor:'tester',p_scope:null});
async function mailbox(db,{provider='smtp',cap=30,age=0,domain='outbound.example.test',primary=false}={}) {
 let d=(await db.query('select * from sending_domains where domain=$1',[domain])).rows[0];
 if(!d) d=await admin(db,'domain_create',{domain,isPrimary:primary});
 await admin(db,'domain_verify',{id:d.id,spf:true,dkim:true,dmarc:true});
 const email=`sender-${randomUUID().slice(0,8)}@${domain}`;
 const m=await admin(db,'mailbox_create',{fromName:'Sender',fromEmail:email,domainId:d.id,provider,dailyCap:cap,timezone:'America/New_York',smtpHost:'smtp.example.test',smtpPort:587,smtpUser:email,encryptedCredentials:security.encryptCredentials({password:'test-password',apiKey:'test-api-key'},email)});
 if(age) {await db.exec('alter table email_accounts disable trigger outreach_mailbox_guard');await db.query("update email_accounts set warmup_started_at=now()-make_interval(days=>$1) where id::text=$2",[age,String(m.id)]);await db.exec('alter table email_accounts enable trigger outreach_mailbox_guard');}
 await admin(db,'mailbox_update',{id:String(m.id),engineEnabled:true});
 return m;
}
async function lead(db) {
 const email=`lead-${randomUUID()}@example.test`;
 const l=(await db.query("insert into leads(email,phone,custom_fields) values($1,$2,'{\"timezone\":\"America/New_York\"}') returning *",[email,`212${Math.floor(1000000+Math.random()*8999999)}`])).rows[0];
 await admin(db,'verification',{id:String(l.id),email,status:'valid',provider:'fixture'});return l;
}
async function enqueue(db,l,m) {
 const token=security.unsubscribeToken();const result=await rpc(db)('outreach_email_enqueue',{p_lead:String(l.id),p_subject:'Hello',p_body:'Plain text email',p_mailbox:String(m.id),p_enrollment:null,p_token:token,p_hash:security.tokenHash(token),p_actor:'tester'});
 await db.query("update outreach_email_jobs set not_before=now()-interval '1 second' where id=$1",[result.id]);return {...result,token};
}
for(const uuid of [false,true]) test(`Phase 2 migrations and controls (${uuid?'UUID':'integer'} IDs)`,async t=>{
 const db=await fixture(uuid,true);
 try {
 await t.test('warmup boundaries and hard cap',async()=>{
  const start='2026-01-01T00:00:00Z';
  for(const [days,expected] of [[0,5],[6,5],[7,15],[13,15],[14,25],[20,25],[21,30]]) assert.equal((await db.query("select outreach_mailbox_cap('warming',30,$1,$1::timestamptz+make_interval(days=>$2)) as cap",[start,days])).rows[0].cap,expected);
  assert.equal((await db.query("select outreach_mailbox_cap('warming',3,now(),now()) cap")).rows[0].cap,3);
  const m=await mailbox(db);await assert.rejects(()=>admin(db,'mailbox_update',{id:String(m.id),status:'active'}),/cannot be skipped/);
  await assert.rejects(()=>db.query("update email_accounts set warmup_started_at=now()-interval '30 days' where id=$1",[m.id]),/cannot be overridden/);
 });
 await t.test('primary domains and subdomains cannot send',async()=>{
  await admin(db,'settings',{primaryDomains:['victory.example.test'],engineEnabled:true,globalDailyCap:100});
  await assert.rejects(()=>mailbox(db,{domain:'victory.example.test'}),/Primary/);
  await assert.rejects(()=>mailbox(db,{domain:'mail.victory.example.test'}),/Primary/);
 });
 await t.test('credentials and safe admin responses',async()=>{
  const m=await mailbox(db);const secret=await admin(db,'mailbox_secret',{id:String(m.id)});
  assert.match(secret.smtp_password,/^enc:v1:/);assert.ok(!secret.smtp_password.includes('test-password'));
  const dashboard=await admin(db,'dashboard');assert.ok(!JSON.stringify(dashboard).includes('smtp_password'));
  await assert.rejects(()=>db.query('update email_accounts set smtp_password=$1 where id=$2',['plaintext',m.id]),/outreach_encrypted_credentials/);
 });
 await t.test('atomic capacity reservations obey mailbox and global ceilings',async()=>{
  const m=await mailbox(db,{cap:2});const l=await lead(db);
  await admin(db,'settings',{globalDailyCap:2});
  for(let i=0;i<3;i++) await enqueue(db,l,m);
  const first=await rpc(db)('outreach_email_claim');assert.ok(first);
  await db.query('update email_accounts set next_send_after=now() where id=$1',[m.id]);
  const second=await rpc(db)('outreach_email_claim');assert.ok(second);
  await db.query('update email_accounts set next_send_after=now() where id=$1',[m.id]);
  assert.equal(await rpc(db)('outreach_email_claim'),null);
  assert.equal((await admin(db,'dashboard')).mailboxes.find(x=>String(x.id)===String(m.id)).sent_today,2);
  await admin(db,'settings',{globalDailyCap:100});
 });
 await t.test('verification is required and invalidated by email edits',async()=>{
  const m=await mailbox(db);const l=await lead(db);
  await db.query("update leads set email='changed@example.test' where id=$1",[l.id]);
  assert.equal((await db.query('select email_verification_status from leads where id=$1',[l.id])).rows[0].email_verification_status,'unverified');
  await assert.rejects(()=>enqueue(db,l,m),/verified/);
  await assert.rejects(()=>db.query('insert into sequence_enrollments(lead_id) values($1)',[l.id]),/verified/);
 });
 await t.test('hard bounce pauses mailbox, marks invalid, suppresses and deduplicates',async()=>{
  const m=await mailbox(db);const l=await lead(db);const queued=await enqueue(db,l,m);
  const claim=await rpc(db)('outreach_email_claim');assert.equal(claim.job.id,queued.id);
  await rpc(db)('outreach_email_finish',{p_job:claim.job.id,p_claim:claim.job.claim_token,p_state:'sent',p_message_id:`message-${randomUUID()}`});
  const event={p_provider:'smtp',p_event:randomUUID(),p_job:queued.id,p_message:null,p_type:'hard_bounce'};
  await rpc(db)('outreach_email_event',event);await rpc(db)('outreach_email_event',event);
  assert.equal((await admin(db,'mailbox_secret',{id:String(m.id)})).status,'paused');
  const changed=(await db.query('select * from leads where id=$1',[l.id])).rows[0];assert.equal(changed.email_verification_status,'invalid');assert.equal(changed.suppressed_reason,'bounced_hard');
  assert.equal((await db.query('select count(*)::int n from outreach_email_events where job_id=$1',[queued.id])).rows[0].n,1);
  assert.ok((await admin(db,'dashboard')).alerts.some(x=>x.reason==='hard_bounce_rate_exceeded'));
 });
 await t.test('complaint pauses immediately; burned mailbox disables its domain peers',async()=>{
  const m=await mailbox(db,{domain:'complaints.example.test'});const other=await mailbox(db,{domain:'complaints.example.test'});const l=await lead(db);const queued=await enqueue(db,l,m);
  const c=await rpc(db)('outreach_email_claim');assert.equal(c.job.id,queued.id);
  await rpc(db)('outreach_email_event',{p_provider:'smtp',p_event:randomUUID(),p_job:c.job.id,p_message:null,p_type:'complaint'});
  assert.equal((await admin(db,'mailbox_secret',{id:String(m.id)})).status,'paused');
  await admin(db,'mailbox_update',{id:String(m.id),status:'burned',engineEnabled:false});
  const peer=await admin(db,'mailbox_secret',{id:String(other.id)});assert.equal(peer.status,'paused');assert.equal(peer.email_engine_enabled,false);
 });
 await t.test('unsubscribe survives reimport and dispatch rechecks suppression after claim',async()=>{
  const m=await mailbox(db);const l=await lead(db);const q=await enqueue(db,l,m);const c=await rpc(db)('outreach_email_claim');assert.equal(c.job.id,q.id);
  assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:c.job.id,p_claim:c.job.claim_token}),true);
  assert.equal(await rpc(db)('outreach_email_unsubscribe',{p_hash:security.tokenHash(q.token)}),true);
  assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:c.job.id,p_claim:c.job.claim_token}),false);
  const imported=(await db.query('insert into leads(email) values($1) returning suppressed_reason',[l.email.toUpperCase()])).rows[0];assert.equal(imported.suppressed_reason,'unsubscribed');
 });
 await t.test('active enrollment assigns once; warmup promotion is automatic',async()=>{
  const m=await mailbox(db,{age:22,domain:'sequences.example.test'});const l=await lead(db);await rpc(db)('outreach_email_guardrails');
  assert.equal((await admin(db,'mailbox_secret',{id:String(m.id)})).status,'active');
  const e=(await db.query('insert into sequence_enrollments(lead_id) values($1) returning *',[l.id])).rows[0];assert.ok(e.assigned_mailbox_id);
  await assert.rejects(()=>db.query('update sequence_enrollments set assigned_mailbox_id=null where id=$1',[e.id]),/permanent/);
 });
 await t.test('rollback reverses Phase 2 without decrypting credentials',async()=>{
  await db.exec(down2);assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='email_accounts' and column_name='daily_cap'")).rows[0].n,0);
  assert.ok((await db.query("select smtp_password from email_accounts limit 1")).rows[0].smtp_password.startsWith('enc:v1:'));
 });
 }finally{await db.close();}
});

test('local-midnight counters and weighted rotation preserve budgets',async()=>{
 const db=await fixture(false,true);try {
  await admin(db,'settings',{primaryDomains:['primary.example.test'],engineEnabled:true});
  const a=await mailbox(db,{age:22,cap:10}),b=await mailbox(db,{age:22,cap:30});
  const picks=[];for(let i=0;i<8;i++)picks.push(await rpc(db)('outreach_choose_mailbox'));
  assert.equal(picks.filter(id=>id===String(a.id)).length,2);assert.equal(picks.filter(id=>id===String(b.id)).length,6);
  const l=await lead(db);await enqueue(db,l,a);const c=await rpc(db)('outreach_email_claim');assert.ok(c);
  assert.equal((await admin(db,'dashboard')).mailboxes.find(m=>m.id===a.id).sent_today,1);
  await db.query("update outreach_email_jobs set mailbox_day=(now() at time zone 'America/New_York')::date-1 where id=$1",[c.job.id]);
  assert.equal((await admin(db,'dashboard')).mailboxes.find(m=>m.id===a.id).sent_today,0);
  assert.equal(await rpc(db)('outreach_email_dispatch_check',{p_job:c.job.id,p_claim:c.job.claim_token}),false);
 }finally{await db.close();}
});

test('Resend tracking configuration fails closed before dispatch',async()=>{
 const id=randomUUID();let sends=0;
 const transport=new providers.ResendTransport('secret',async(url)=>{if(String(url).endsWith('/emails'))sends++;return Response.json({name:'example.test',status:'verified',click_tracking:true,open_tracking:false});},id);
 await assert.rejects(()=>transport.prepare('sender@example.test'),/tracking disabled/);assert.equal(sends,0);
 const valid=new providers.ResendTransport('secret',async()=>Response.json({name:'example.test',status:'verified',click_tracking:false,open_tracking:false}),id);
 await valid.prepare('sender@example.test');await assert.rejects(()=>valid.prepare('sender@other.test'),/matching domain/);
 const raw='{"type":"email.bounced"}',timestamp=String(Math.floor(Date.now()/1000)),key=Buffer.alloc(32,9),eventId='evt_test';
 const signature='v1,'+createHmac('sha256',key).update(`${eventId}.${timestamp}.${raw}`).digest('base64');
 security.verifyResendSignature(raw,eventId,timestamp,signature,'whsec_'+key.toString('base64'));
 assert.throws(()=>security.verifyResendSignature(raw+' ',eventId,timestamp,signature,'whsec_'+key.toString('base64')),/signature/);
});
test('send windows and jitter cross US/Cairo DST and skip weekends',async()=>{
 const db=await fixture();try {
 for(const [at,tz,expected] of [['2026-03-06T12:59:59Z','America/New_York',false],['2026-03-06T13:00:00Z','America/New_York',true],['2026-03-09T12:00:00Z','America/New_York',true],['2026-03-08T14:00:00Z','America/New_York',false],['2026-11-02T13:00:00Z','America/New_York',true],['2026-07-06T21:00:00Z','America/New_York',false],['2026-04-23T05:00:00Z','Africa/Cairo',false],['2026-04-24T05:00:00Z','Africa/Cairo',true]]) assert.equal((await db.query('select outreach_email_window($1,$2) ok',[at,tz])).rows[0].ok,expected,`${at} ${tz}`);
 const slots=[];for(let i=0;i<10;i++) {const row=(await db.query("select outreach_email_next_slot('2026-03-06T23:00:00Z','America/New_York') slot")).rows[0];slots.push(String(row.slot));assert.equal((await db.query("select outreach_email_window($1,'America/New_York') ok",[row.slot])).rows[0].ok,true);assert.match(new Date(row.slot).toISOString(),/2026-03-09/);}
 assert.ok(new Set(slots).size>1);
 }finally{await db.close();}
});
test('encryption, AAD binding, signature tampering/replay and plain-text policy',async()=>{
 const cipher=security.encryptCredentials({password:'never-log-me'},'sender@example.test');assert.equal(security.decryptCredentials(cipher,'sender@example.test').password,'never-log-me');assert.throws(()=>security.decryptCredentials(cipher,'someone@example.test'),/could not be decrypted/);
 assert.throws(()=>security.plainText('Subject','<p>HTML</p>',[]),/plain text/);assert.throws(()=>security.plainText('Subject','https://bit.ly/a',['bit.ly']),/direct/);assert.throws(()=>security.plainText('Subject','https://example.test/?redirect=https%3A%2F%2Fx.test',['example.test']),/direct/);
 await assert.rejects(()=>security.checkDirectLinks(['https://example.test'],async()=>new Response(null,{status:302,headers:{location:'https://other.test'}})),/Redirected/);
 const raw='{"type":"hard_bounce"}',timestamp=String(Math.floor(Date.now()/1000)),secret='s'.repeat(32);const signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');security.verifyEventSignature(raw,timestamp,signature,secret);
 assert.throws(()=>security.verifyEventSignature(raw+' ',timestamp,signature,secret),/signature/);assert.throws(()=>security.verifyEventSignature(raw,timestamp,signature,secret,Date.now()+301000),/signature/);
});
test('verification and API adapters use safe payloads and do not expose provider errors',async()=>{
 const valid=new providers.ZeroBounceVerifier('secret',async(url,init)=>{assert.equal(init.method,'POST');assert.ok(!String(url).includes('secret'));return Response.json({address:'lead@example.test',status:'valid',catchall_domain:false});});assert.equal(await valid.verify('lead@example.test'),'valid');
 const risky=new providers.ZeroBounceVerifier('secret',async()=>Response.json({address:'lead@example.test',status:'valid',catchall_domain:true}));assert.equal(await risky.verify('lead@example.test'),'risky');
 let payload;const transport=new providers.ResendTransport('secret',async(_url,init)=>{payload=JSON.parse(init.body);assert.equal(init.headers['Idempotency-Key'],'outreach/job');return Response.json({id:'provider-id'});});
 await transport.send({jobId:'job',fromEmail:'sender@example.test',fromName:'Sender',to:'lead@example.test',subject:'Subject',text:'Plain text',messageId:'<job@example.test>',headers:{'List-Unsubscribe':'<https://crm.example.test/unsubscribe>'}});assert.equal(payload.html,undefined);assert.equal(payload.text,'Plain text');
});
const validVerifier={name:'fixture',verify:async()=> 'valid'};
test('worker adds unsubscribe headers, obeys dark flag and rechecks before provider dispatch',async()=>{
 let sends=0;let lastMessage;let allowed=false;const calls=[];
 const mockRpc=async(name,args)=>{calls.push(name);if(name==='outreach_email_claim')return {job:{id:randomUUID(),claim_token:randomUUID(),subject:'Subject',body:'Text',to_email:'lead@example.test',unsubscribe_token:security.unsubscribeToken()},mailbox:{from_email:'sender@example.test',from_name:'Sender'},domain:'example.test',directLinkDomains:[]};if(name==='outreach_email_dispatch_check')return allowed;return null;};
 const service=new EmailService(mockRpc,()=>({send:async m=>{sends++;lastMessage=m;return {messageId:'message'};}}),validVerifier,fetch,async()=>{});
 process.env.OUTREACH_EMAIL_ENABLED='false';assert.equal((await service.process()).held,true);assert.equal(calls.length,0);
 process.env.OUTREACH_EMAIL_ENABLED='true';await service.process();assert.equal(sends,0);allowed=true;await service.process();assert.equal(sends,1);assert.match(lastMessage.text,/Unsubscribe: https:\/\/crm.example.test\/api\/email\/unsubscribe\?token=/);assert.equal(lastMessage.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');process.env.OUTREACH_EMAIL_ENABLED='false';
});
