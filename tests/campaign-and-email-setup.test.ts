import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allCampaignContacts,addCampaignContacts} from '../artifacts/leadgen/src/lib/campaign-membership.js';
import {publicEmailUrl} from '../lib/email-security.js';
import {EmailService} from '../lib/email-service.js';

test('campaign picker reads beyond 50 and 1,000 even when total is underreported',async()=>{
 const contacts=Array.from({length:1251},(_,i)=>({id:`lead-${i}`,firstName:'Test',lastName:'',email:'',status:'new'}));let pages=0;
 const result=await allCampaignContacts(async path=>{pages++;const page=Number(new URL(path,'https://test.invalid').searchParams.get('page'));return {leads:contacts.slice((page-1)*100,page*100),total:1000};});
 assert.equal(result.leads.length,1251);assert.equal(pages,14);
 const batches:any[]=[];await addCampaignContacts(async(path,options)=>{assert.match(path,/campaigns\/uuid-campaign\/leads/);batches.push(JSON.parse(String(options?.body)).leadIds);},'uuid-campaign',[...contacts.map(c=>c.id),contacts[0].id]);
 assert.deepEqual(batches.map(x=>x.length),[200,200,200,200,200,200,51]);assert.deepEqual(batches.flat(),contacts.map(c=>c.id));
});
test('campaign assignment reports partial progress and stops on an error',async()=>{
 const progress:number[]=[];let calls=0;
 await assert.rejects(()=>addCampaignContacts(async()=>{if(++calls===2)throw new Error('Temporary failure');},'campaign',Array.from({length:600},(_,i)=>i),n=>progress.push(n)),/Temporary/);
 assert.equal(calls,2);assert.deepEqual(progress,[200]);
});
test('email origin uses trusted production configuration and rejects invalid explicit URLs',()=>{
 const names=['OUTREACH_PUBLIC_URL','APP_URL','VERCEL_PROJECT_PRODUCTION_URL'];const saved=names.map(n=>process.env[n]);
 try{
  for(const n of names)delete process.env[n];
  process.env.VERCEL_PROJECT_PRODUCTION_URL='portal.example.com';assert.equal(publicEmailUrl(),'https://portal.example.com');
  process.env.APP_URL='https://app.example.com/';assert.equal(publicEmailUrl(),'https://app.example.com');
  process.env.OUTREACH_PUBLIC_URL='https://crm.example.com';assert.equal(publicEmailUrl(),'https://crm.example.com');
  for(const bad of ['not-a-url','http://crm.example.com','https://crm.example.com/path','https://user:secret@crm.example.com','https://127.0.0.1']){process.env.OUTREACH_PUBLIC_URL=bad;assert.throws(publicEmailUrl,/Set OUTREACH_PUBLIC_URL/);}
 }finally{names.forEach((n,i)=>{if(saved[i]===undefined)delete process.env[n];else process.env[n]=saved[i];});}
});
test('adding an existing domain succeeds without resetting DNS or sender permissions',async()=>{
 const existing={id:'domain-id',domain:'victorysync.com',is_primary:true,allow_primary_sending:true,spf_verified:true};const actions:string[]=[];
 const service=new EmailService(async(name,data)=>{actions.push(name);assert.equal((data.p_data as any).domain,'victorysync.com');return {...existing,alreadyExists:true};},()=>({send:async()=>{throw new Error('No send expected');}}));
 const result=await service.handle({path:'/email/domains',method:'POST',body:{domain:'VictorySync.com',dkimSelector:'default'},raw:'',headers:{},authenticated:true});
 assert.equal(result.status,200);assert.equal(result.body.alreadyExists,true);assert.equal(result.body.allow_primary_sending,true);assert.deepEqual(actions,['outreach_email_domain_create']);
});
test('production campaign API preserves UUIDs, flattens every member page and does not reset duplicates',async()=>{
 process.env.SUPABASE_URL='https://campaign-test.invalid';process.env.SUPABASE_ANON_KEY='test-key';
 const {default:handler}=await import('../api/[...path].js');const previous=globalThis.fetch;
 const token=`e30.${Buffer.from(JSON.stringify({sub:'user-id',crm_role:'owner'})).toString('base64url')}.sig`;
 const id='564cc761-f59f-461f-a211-ddab9cf9768b';let pages=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.pathname==='/auth/v1/user')return Response.json({id:'user-id',user_metadata:{role:'owner'}});
  if(url.pathname==='/rest/v1/portal_activity_log')return Response.json([]);
  if(url.pathname==='/rest/v1/campaigns'){assert.equal(url.searchParams.get('id'),`eq.${id}`);return Response.json([{id,name:'My campaign',status:'draft'}]);}
  assert.equal(url.pathname,'/rest/v1/campaign_leads');
  if(init?.method==='POST'){assert.match(new Headers(init.headers).get('prefer')??'',/ignore-duplicates/);assert.equal(JSON.parse(String(init.body))[0].campaign_id,id);return Response.json([]);}
  assert.equal(url.searchParams.get('campaign_id'),`eq.${id}`);pages++;
  const offset=Number(url.searchParams.get('offset'));return Response.json(Array.from({length:offset===0?500:1},(_,i)=>({leads:{id:`lead-${offset+i}`,first_name:'Jo',last_name:'',email:'jo@example.test',status:'new'}})));
 };
 try{
  let data:any;const res={statusCode:0,setHeader(){},end(value?:string){data=JSON.parse(value!);}};
  await handler({method:'GET',url:`/api/campaigns/${id}`,headers:{authorization:`Bearer ${token}`},on(){}},res);assert.equal(res.statusCode,200);assert.equal(data.id,id);
  await handler({method:'GET',url:`/api/campaigns/${id}/leads`,headers:{authorization:`Bearer ${token}`},on(){}},res);assert.equal(res.statusCode,200);assert.equal(data.total,501);assert.equal(data.leads[500].firstName,'Jo');assert.equal(pages,2);
  await handler({method:'POST',url:`/api/campaigns/${id}/leads`,headers:{authorization:`Bearer ${token}`},body:{leadIds:['lead-id']},on(){}},res);assert.equal(res.statusCode,201);
 }finally{globalThis.fetch=previous;}
});
