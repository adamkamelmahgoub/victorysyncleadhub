import type { IncomingMessage, ServerResponse } from 'node:http';
import { allowedEmail } from '../mcp-auth.js';
import { providerAdapters, replyAllowed, type Channel } from '../social-providers.js';
import { socialRest } from '../social-service.js';
import { socialOrganizationIds } from '../social-auth.js';

export const config = { api: { bodyParser: false }, maxDuration: 30 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_ORG = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
function reply(res:ServerResponse,status:number,data:unknown) { res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data)); }
async function authenticate(req:IncomingMessage) {
  const token=req.headers.authorization;
  const key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY;
  if(typeof token!=='string'||!token.startsWith('Bearer ')||!key||!process.env.SUPABASE_URL) throw new Error('Sign in first');
  const response=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:key,authorization:token},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('Session expired');
  const user=await response.json() as {id:string;email:string;email_confirmed_at?:string};
  if(!user.email_confirmed_at||!allowedEmail(user.email)) throw new Error('CRM administrator access required');
  return user;
}
async function input(req:IncomingMessage) {let raw='';for await(const part of req){raw+=part;if(raw.length>100000)throw new Error('Request too large');}return JSON.parse(raw||'{}');}
type Conversation={id:string;organization_id:string;channel:string;connected_account_id:string|null;participant_platform_id:string|null;
  contact_id:string|null;company_id:string|null;legacy_company_id:string|null;lead_id:string|null;last_inbound_at:string|null;reply_window_expires_at:string|null;[key:string]:unknown};
export default async function handler(req:IncomingMessage,res:ServerResponse) {
  try {
    const user=await authenticate(req);
    const organizations=await socialOrganizationIds(user.id);
    const url=new URL(req.url||'/','https://local.invalid');
    const id=url.searchParams.get('id');
    if(req.method==='GET'&&id) {
      if(!uuid.test(id)) throw new Error('Invalid conversation ID');
      const rows=await socialRest<Conversation[]>(`conversations?id=eq.${id}&select=*&limit=1`);
      if(!rows.length)return reply(res,404,{error:'Conversation not found'});
      const thread=rows[0];
      if(!organizations.includes(thread.organization_id))throw new Error('Organization access denied');
      const [messages,profiles]=await Promise.all([
        socialRest<any[]>(`messages?conversation_id=eq.${id}&select=*&order=created_at.asc&limit=500`),
        thread.lead_id||thread.contact_id||thread.company_id||thread.legacy_company_id
          ? socialRest<any[]>(`social_profiles?organization_id=eq.${thread.organization_id}&entity_type=eq.${thread.lead_id?'lead':thread.contact_id?'contact':'company'}&entity_id=eq.${thread.lead_id||thread.contact_id||thread.company_id||thread.legacy_company_id}&select=*&order=platform.asc`)
          : Promise.resolve([]),
      ]);
      const entityFilter=thread.lead_id?`lead_id=eq.${thread.lead_id}`:thread.contact_id?`contact_id=eq.${thread.contact_id}`:
        thread.company_id?`company_id=eq.${thread.company_id}`:thread.legacy_company_id?`legacy_company_id=eq.${thread.legacy_company_id}`:null;
      const related=entityFilter?await socialRest<Array<{id:string;channel:string}>>(
        `conversations?organization_id=eq.${thread.organization_id}&${entityFilter}&id=neq.${id}&select=id,channel&limit=30`):[];
      const relatedMessages=related.length?await socialRest<Array<{id:string;conversation_id:string;direction:string;body:string;created_at:string}>>(
        `messages?conversation_id=in.(${related.map((item)=>item.id).join(',')})&select=id,conversation_id,direction,body,created_at&order=created_at.desc&limit=200`):[];
      const channelById=new Map(related.map((item)=>[item.id,item.channel]));
      return reply(res,200,{conversation:thread,messages,profiles,relatedMessages:relatedMessages.map((message)=>({...message,channel:channelById.get(message.conversation_id)})),
        canReply:Boolean(providerAdapters[thread.channel as Channel]?.capabilities.canReply)&&Boolean(thread.connected_account_id)&&
          replyAllowed(thread.channel as any,thread.last_inbound_at?new Date(thread.last_inbound_at):null)});
    }
    if(req.method==='GET') {
      if(!organizations.length)return reply(res,200,{conversations:[]});
      const filters=['select=*','order=last_message_at.desc.nullslast','limit=100'];
      filters.push(`organization_id=in.(${organizations.join(',')})`);
      for(const name of ['channel','status','intent','connected_account_id','assigned_to']) {
        const value=url.searchParams.get(name);if(value)filters.push(`${name}=eq.${encodeURIComponent(value)}`);
      }
      if(url.searchParams.get('unread')==='true')filters.push('unread_count=gt.0');
      if(url.searchParams.get('unmatched')==='true')filters.push('contact_id=is.null','company_id=is.null','legacy_company_id=is.null','lead_id=is.null');
      const conversations=await socialRest<Conversation[]>(`conversations?${filters.join('&')}`);
      return reply(res,200,{conversations});
    }
    if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
    const data=await input(req);
    if(!uuid.test(String(data.id||'')))throw new Error('Invalid conversation ID');
    const rows=await socialRest<Conversation[]>(`conversations?id=eq.${data.id}&select=*&limit=1`);
    if(!rows.length)return reply(res,404,{error:'Conversation not found'});
    const thread=rows[0];
    if(!organizations.includes(thread.organization_id))throw new Error('Organization access denied');
    const update:Record<string,unknown>={updated_at:new Date().toISOString()};
    if(data.action==='link') {
      const type=String(data.entity_type||'');const entityId=String(data.entity_id||'');
      if(!uuid.test(entityId)||!['lead','contact','company'].includes(type))throw new Error('Invalid link target');
      const table=type==='lead'?'leads':type==='contact'?'crm_contacts':'crm_companies';
      let target=await socialRest<any[]>(`${table}?id=eq.${entityId}&select=id${type==='company'?',organization_id':',organization_id'}&limit=1`);
      if(!target.length&&type==='company'&&thread.organization_id===LEGACY_ORG)
        target=await socialRest<any[]>(`companies?id=eq.${entityId}&select=id&limit=1`);
      if(!target.length||(target[0].organization_id||LEGACY_ORG)!==thread.organization_id)throw new Error('Target belongs to another organization');
      update.lead_id=type==='lead'?entityId:null;update.contact_id=type==='contact'?entityId:null;
      update.company_id=type==='company'&&target[0].organization_id?entityId:null;
      update.legacy_company_id=type==='company'&&!target[0].organization_id?entityId:null;
      const profiles=await socialRest<any[]>(`social_profiles?organization_id=eq.${thread.organization_id}&entity_type=eq.${type}&entity_id=eq.${entityId}&platform=eq.${thread.channel}&select=id,platform_user_id&order=is_primary.desc&limit=1`);
      if(profiles.length&&thread.participant_platform_id&&!profiles[0].platform_user_id)
        await socialRest(`social_profiles?id=eq.${profiles[0].id}`,{method:'PATCH',body:JSON.stringify({platform_user_id:thread.participant_platform_id})});
    } else if(data.action==='status') {
      if(!['open','snoozed','closed'].includes(data.status))throw new Error('Invalid status');update.status=data.status;
      if(data.status==='snoozed'){
        const until=new Date(data.snoozed_until);
        if(!Number.isFinite(until.getTime())||until.getTime()<=Date.now()||until.getTime()>Date.now()+90*86400000)throw new Error('Choose a snooze time within 90 days');
        update.snoozed_until=until.toISOString();
      } else update.snoozed_until=null;
    } else if(data.action==='intent') {
      if(!['interested','not_now','not_interested','wrong_person','ooo','unsubscribe','unknown'].includes(data.intent))throw new Error('Invalid intent');
      update.intent=data.intent;
    } else if(data.action==='assign') {
      const assignee=data.assigned_to;
      if(assignee!==null&&(!uuid.test(String(assignee))))throw new Error('Invalid assignee');
      if(assignee!==null){
        const members=await socialRest<Array<{user_id:string}>>(`org_users?org_id=eq.${thread.organization_id}&user_id=eq.${assignee}&select=user_id&limit=1`);
        if(!members.length)throw new Error('Assignee must belong to this organization');
      }
      update.assigned_to=assignee;
    } else if(data.action==='create_task') {
      if(!thread.lead_id)throw new Error('Link this conversation to a lead to create a task');
      const title=String(data.title||'').trim();
      const due=new Date(data.due_at);
      if(!title||title.length>160||!Number.isFinite(due.getTime())||due.getTime()<Date.now()-60000)throw new Error('Enter a title and future due date');
      await socialRest('contact_tasks',{method:'POST',body:JSON.stringify({lead_id:thread.lead_id,title,
        description:`Conversation ${thread.id}`,due_date:due.toISOString(),priority:'medium'})});
      return reply(res,200,{created:true});
    } else if(data.action==='read') update.unread_count=0;
    else throw new Error('Invalid action');
    await socialRest(`conversations?id=eq.${thread.id}`,{method:'PATCH',body:JSON.stringify(update)});
    return reply(res,200,{updated:true});
  }catch(error){return reply(res,400,{error:error instanceof Error?error.message:'Inbox request failed'});}
}
