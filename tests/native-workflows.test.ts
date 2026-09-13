import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WorkflowService,isPublicWorkflowEndpoint} from '../lib/workflow-service.js';
import {EmailService} from '../lib/email-service.js';

const claim=(type:string,config:Record<string,unknown>={})=>({run:{id:'run',lead_id:'lead',lease:'lease',context:{}},node:{type,config},lead:{id:'lead',first_name:'Jo',email:'jo@example.test',custom_fields:{city:'Albany'}},workflow:{id:'workflow',name:'Test'}});
test('native workflow queues interpolated email through the guarded email service',async()=>{
 let available:any=claim('send_email',{mailboxId:'mailbox',subject:'Hi {{firstName}}',body:'Hello from {{city}}'}),queued:any,finished:any;
 const rpc=async(name:string,args:any)=>{
  if(name==='outreach_workflow_admin'&&args.p_action==='claim'){const value=available;available=null;return value;}
  if(name==='outreach_workflow_admin'&&args.p_action==='finish'){finished=args.p_data;return {};}
  if(name==='outreach_email_admin')return {settings:{direct_link_domains:[]}};
  if(name==='outreach_email_enqueue'){queued=args;return {id:'job'};}throw Error(`${name}:${args.p_action}`);
 };
 const email=new EmailService(rpc,()=>{throw Error('No dispatch expected');});const service=new WorkflowService(rpc,email);
 assert.deepEqual(await service.process(),{processed:1});assert.equal(queued.p_subject,'Hi Jo');assert.equal(queued.p_body,'Hello from Albany');assert.equal(queued.p_mailbox,'mailbox');assert.equal(finished.result.emailJobId,'job');
});
test('waits are persisted and failed conditions stop without advancing',async()=>{
 const finishes:any[]=[];const dbNodes:any[]=[];let claims:any[]=[claim('wait',{duration:'2',unit:'hours'}),claim('condition',{field:'company',operator:'equals',value:'Nope',onFalse:'stop'})];
 const rpc=async(name:string,args:any)=>{if(name==='outreach_workflow_admin'&&args.p_action==='claim')return claims.shift()??null;if(args.p_action==='finish'){finishes.push(args.p_data);return {};}if(args.p_action==='db_node'){dbNodes.push(args.p_data);return {};}if(args.p_action==='fail')throw Error(`unexpected failure ${args.p_data.error}`);throw Error(name);};
 const email=new EmailService(rpc,()=>{throw Error('unused');});await new WorkflowService(rpc,email).process();
 assert.equal(finishes[0].waitSeconds,7200);assert.equal(finishes.length,1);assert.equal(dbNodes[0].node.type,'stop_workflow');
});
test('scheduled processing accepts the configured cron secret only',async()=>{
 const before=process.env.CRON_SECRET;process.env.CRON_SECRET='x'.repeat(32);const rpc=async(_name:string,args:any)=>args.p_action==='claim'?null:{};const service=new WorkflowService(rpc,new EmailService(rpc,()=>{throw Error('unused');}));
 try{assert.equal(isPublicWorkflowEndpoint('/workflows/process'),true);assert.equal((await service.handle({path:'/workflows/process',method:'GET',body:{},raw:'',headers:{authorization:'Bearer wrong'},authenticated:false})).status,401);assert.equal((await service.handle({path:'/workflows/process',method:'GET',body:{},raw:'',headers:{authorization:`Bearer ${process.env.CRON_SECRET}`},authenticated:false})).status,200);}finally{if(before===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=before;}
});
