import {isIP} from 'node:net';
import {resolve4,resolve6} from 'node:dns/promises';
import {EmailInputError,safeEqual} from './email-security.js';
import type {EmailService,EmailContext,EmailReply,EmailRpc} from './email-service.js';

export const isWorkflowEndpoint=(path:string)=>/^\/workflows(?:\/(status|run|process))?$/.test(path);
export const isPublicWorkflowEndpoint=(path:string)=>path==='/workflows/process';
const interpolate=(template:string,lead:Record<string,any>)=>template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g,(_m,key)=>{
 const aliases:Record<string,string>={firstName:'first_name',lastName:'last_name'};const field=aliases[key]??key;
 const value=lead[field]??lead.custom_fields?.[field];return value===null||value===undefined?'':String(value);
});
function waitSeconds(config:Record<string,any>){const amount=Number(config.duration??0);if(!Number.isFinite(amount)||amount<0)throw new EmailInputError('Wait duration must be zero or greater');const units:Record<string,number>={minutes:60,hours:3600,days:86400,weeks:604800};if(!units[config.unit??'days'])throw new EmailInputError('Choose minutes, hours, days, or weeks');return Math.round(amount*units[config.unit??'days']);}
function privateIp(ip:string){return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:')||/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^224\.|^24[0-9]\.|^25[0-5]\./.test(ip)||(/^172\.(\d+)\./.test(ip)&&Number(ip.split('.')[1])>=16&&Number(ip.split('.')[1])<=31);}
async function webhookUrl(value:unknown){let url:URL;try{url=new URL(String(value??''));}catch{throw new EmailInputError('Enter a valid HTTPS webhook URL');}if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname==='localhost'||isIP(url.hostname)&&privateIp(url.hostname))throw new EmailInputError('Webhook must use a public HTTPS URL');const addresses=[...(await resolve4(url.hostname).catch(()=>[])),...(await resolve6(url.hostname).catch(()=>[]))];if(!addresses.length||addresses.some(privateIp))throw new EmailInputError('Webhook host must resolve to a public address');return url;}
function condition(config:Record<string,any>,lead:Record<string,any>){const aliases:Record<string,string>={firstName:'first_name',lastName:'last_name'};const key=aliases[config.field]??config.field;const actual=String(lead[key]??lead.custom_fields?.[key]??'');const expected=String(config.value??'');switch(config.operator){case'equals':return actual===expected;case'not_equals':return actual!==expected;case'contains':return actual.toLowerCase().includes(expected.toLowerCase());case'is_empty':return !actual;case'is_not_empty':return !!actual;default:throw new EmailInputError('Choose a valid condition operator');}}

export class WorkflowService {
 constructor(private rpc:EmailRpc,private email:EmailService,private fetcher:typeof fetch=fetch){}
 private admin(action:string,data:Record<string,unknown>={},actor='operator'){return this.rpc('outreach_workflow_admin',{p_action:action,p_data:data,p_actor:actor});}
 async process(limit=20){let processed=0;for(;processed<Math.min(Math.max(limit,1),50);processed++){
  const claim=await this.admin('claim',{},'system');if(!claim)break;const run=claim.run,node=claim.node,lead=claim.lead,config=node.config??{};
  try{
   let result:Record<string,unknown>={};let wait=0;let stopped=false;
   if(node.type==='wait')wait=waitSeconds(config);
   else if(node.type==='condition'){const matched=condition(config,lead);result={matched};if(!matched&&config.onFalse!=='continue'){await this.admin('db_node',{runId:run.id,lease:run.lease,node:{type:'stop_workflow',config:{}}},'system');stopped=true;}}
   else if(node.type==='send_email'){
    if(!config.mailboxId)throw new EmailInputError('Choose a sending mailbox in the email node');
    const reply=await this.email.handle({path:'/email/queue',method:'POST',body:{leadId:run.lead_id,mailboxId:config.mailboxId,subject:interpolate(String(config.subject??''),lead),body:interpolate(String(config.body??''),lead)},raw:'',headers:{},actor:'system',scope:null,authenticated:true});
    if(reply.status>=400)throw new Error(reply.body?.error??'Email could not be queued');result={emailJobId:reply.body?.id};
   } else if(['add_tag','remove_tag','update_status','move_pipeline_stage','add_note','create_call_task','enroll_sequence','stop_workflow'].includes(node.type))result=await this.admin('db_node',{runId:run.id,lease:run.lease,node},'system');
   else if(node.type==='webhook'){
    const url=await webhookUrl(config.url);const method=String(config.method??'POST').toUpperCase();if(!['GET','POST','PUT','PATCH'].includes(method))throw new EmailInputError('Choose a supported webhook method');
    const response=await this.fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify({workflow:claim.workflow,runId:run.id,lead,context:run.context})})});if(!response.ok)throw new Error(`Webhook returned HTTP ${response.status}`);result={httpStatus:response.status};
   } else throw new EmailInputError(`Unsupported workflow node: ${node.type}`);
   if(node.type!=='stop_workflow'&&!stopped)await this.admin('finish',{runId:run.id,lease:run.lease,node,result,waitSeconds:wait},'system');
  }catch(error){await this.admin('fail',{runId:run.id,lease:run.lease,error:error instanceof Error?error.message:'Workflow node failed'},'system');}
 }return {processed};}
 async handle(c:EmailContext):Promise<EmailReply>{const ok=(body:any,status=200)=>({body,status});if(!isWorkflowEndpoint(c.path))return ok({error:'Not found'},404);
  if(c.path==='/workflows/process'&&!c.authenticated){
   const tokens=[process.env.CRON_SECRET,process.env.OUTREACH_WORKER_TOKEN].filter((x):x is string=>!!x&&x.length>=32);if(!tokens.some(token=>safeEqual(c.headers.authorization??'',`Bearer ${token}`)))return ok({error:'Unauthorized'},401);return ok(await this.process());
  }
  if(!c.authenticated)return ok({error:'Unauthorized'},401);
  if(c.path==='/workflows/status'&&c.method==='GET')return ok(await this.admin('status',{},c.actor));
  if(c.path==='/workflows/run'&&c.method==='POST'){if(!c.body?.workflowId||!c.body?.leadId)throw new EmailInputError('Choose a workflow and contact');const run=await this.admin('manual',{workflowId:String(c.body.workflowId),leadId:String(c.body.leadId)},c.actor);const execution=await this.process();return ok({run,...execution},202);}
  if(c.path==='/workflows/process'&&c.method==='POST')return ok(await this.process());return ok({error:'Unsupported workflow operation'},405);
 }
}
