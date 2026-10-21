import type { IncomingMessage, ServerResponse } from 'node:http';
import { socialActor, socialActorOrganizations,isSocialOwner } from '../social-workspace-auth.js';
import { providerAdapters, replyAllowed, type Channel } from '../social-providers.js';
import { socialRest } from '../social-service.js';
import {mcpPool} from '../mcp-auth.js';

export const config = { api: { bodyParser: false }, maxDuration: 30 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_ORG = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
function reply(res:ServerResponse,status:number,data:unknown) { res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data)); }
async function input(req:IncomingMessage) {let raw='';for await(const part of req){raw+=part;if(raw.length>100000)throw new Error('Request too large');}return JSON.parse(raw||'{}');}
type Conversation={id:string;organization_id:string;channel:string;connected_account_id:string|null;participant_platform_id:string|null;
  contact_id:string|null;company_id:string|null;legacy_company_id:string|null;lead_id:string|null;last_inbound_at:string|null;reply_window_expires_at:string|null;[key:string]:unknown};
export default async function handler(req:IncomingMessage,res:ServerResponse) {
  try {
    const user=await socialActor(req);
    const organizations=socialActorOrganizations(user,req.method==='GET'?'inbox_view':'inbox_reply');
    const url=new URL(req.url||'/','https://local.invalid');
    const id=url.searchParams.get('id');
    if(req.method==='GET'&&id) {
      if(!uuid.test(id)) throw new Error('Invalid conversation ID');
      const rows=await socialRest<Conversation[]>(`conversations?id=eq.${id}&select=*&limit=1`);
      if(!rows.length)return reply(res,404,{error:'Conversation not found'});
      const thread=rows[0];
      if(!organizations.includes(thread.organization_id))throw new Error('Organization access denied');
      if(!isSocialOwner(user,thread.organization_id)&&thread.assigned_to!==user.id)throw new Error('Conversation is assigned to another teammate');
      const [messages,profiles]=await Promise.all([
        socialRest<any[]>(`messages?conversation_id=eq.${id}&select=*&order=created_at.asc&limit=500`),
        thread.lead_id||thread.contact_id||thread.company_id||thread.legacy_company_id
          ? socialRest<any[]>(`social_profiles?organization_id=eq.${thread.organization_id}&entity_type=eq.${thread.lead_id?'lead':thread.contact_id?'contact':'company'}&entity_id=eq.${thread.lead_id||thread.contact_id||thread.company_id||thread.legacy_company_id}&select=*&order=platform.asc`)
          : Promise.resolve([]),
      ]);
      const entityFilter=thread.lead_id?`lead_id=eq.${thread.lead_id}`:thread.contact_id?`contact_id=eq.${thread.contact_id}`:
        thread.company_id?`company_id=eq.${thread.company_id}`:thread.legacy_company_id?`legacy_company_id=eq.${thread.legacy_company_id}`:null;
      const related=entityFilter?await socialRest<Array<{id:string;channel:string}>>(
        `conversations?organization_id=eq.${thread.organization_id}&${entityFilter}&id=neq.${id}${isSocialOwner(user,thread.organization_id)?'':`&assigned_to=eq.${user.id}`}&select=id,channel&limit=30`):[];
      const relatedMessages=related.length?await socialRest<Array<{id:string;conversation_id:string;direction:string;body:string;created_at:string}>>(
        `messages?conversation_id=in.(${related.map((item)=>item.id).join(',')})&select=id,conversation_id,direction,body,created_at&order=created_at.desc&limit=200`):[];
      const channelById=new Map(related.map((item)=>[item.id,item.channel]));
      const [account]=thread.connected_account_id?await socialRest<Array<{provider:string|null;status:string;connection_mode:string}>>(`connected_accounts?id=eq.${thread.connected_account_id}&select=provider,status,connection_mode&limit=1`):[];
      const inbound=messages.some(message=>message.direction==='inbound');
      const withinWindow=Boolean(thread.last_inbound_at)&&Date.now()-new Date(thread.last_inbound_at!).getTime()<24*3600000;
      const privateThread=thread.match_status==='ignored'&&isSocialOwner(user,thread.organization_id)&&thread.assigned_to!==user.id;
      return reply(res,200,{conversation:thread,messages:privateThread?messages.map(({body,...message})=>({...message,body:''})):messages,
        profiles,relatedMessages:relatedMessages.map((message)=>({...message,channel:channelById.get(message.conversation_id)})),manualReply:account?.connection_mode==='manual',
        canReply:inbound&&withinWindow&&Boolean(thread.lead_id||thread.contact_id||thread.company_id||thread.legacy_company_id)&&account?.status==='active'&&Boolean(account?.provider==='unipile'||
          (providerAdapters[thread.channel as Channel]?.capabilities.canReply&&replyAllowed(thread.channel as Channel,new Date(thread.last_inbound_at!))))});
    }
    if(req.method==='GET') {
      if(!organizations.length)return reply(res,200,{conversations:[]});
      const filters=['select=*','order=last_message_at.desc.nullslast','limit=100'];
      filters.push(`organization_id=in.(${organizations.join(',')})`);
      if(!isSocialOwner(user,LEGACY_ORG))filters.push(`assigned_to=eq.${user.id}`);
      for(const name of ['channel','status','intent','connected_account_id','assigned_to']) {
        const value=url.searchParams.get(name);if(value)filters.push(`${name}=eq.${encodeURIComponent(value)}`);
      }
      if(url.searchParams.get('unread')==='true')filters.push('unread_count=gt.0');
      const matchStatus=url.searchParams.get('match_status');
      if(matchStatus&&['matched','suggested','unmatched','ignored'].includes(matchStatus))filters.push(`match_status=eq.${matchStatus}`);
      if(url.searchParams.get('unmatched')==='true')filters.push('match_status=in.(unmatched,suggested)');
      if(matchStatus!=='ignored')filters.push('match_status=neq.ignored');
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
    if(!isSocialOwner(user,thread.organization_id)&&thread.assigned_to!==user.id)throw new Error('Conversation is assigned to another teammate');
    if(data.action==='log_reply'){
      const body=String(data.body||'').trim().slice(0,2000),intent=String(data.intent||'unknown');
      if(!['interested','not_now','not_interested','wrong_person','ooo','unsubscribe','unknown'].includes(intent))throw new Error('Choose a valid intent');
      if(!thread.connected_account_id)throw new Error('Manual account is missing');
      const db=await mcpPool.connect();
      try{
        await db.query('begin');
        const account=await db.query<{connection_mode:string}>(`select connection_mode from public.connected_accounts where id=$1 and organization_id=$2 for update`,[thread.connected_account_id,thread.organization_id]);
        if(account.rows[0]?.connection_mode!=='manual')throw new Error('Use the signed webhook for API connected accounts');
        await db.query(`insert into public.messages(organization_id,conversation_id,direction,body,status,sent_by)
          values($1,$2,'inbound',$3,'sent',$4)`,[thread.organization_id,thread.id,body,user.id]);
        await db.query(`update public.conversations set last_inbound_at=now(),last_message_at=now(),intent=$2,unread_count=1,updated_at=now()
          where id=$1`,[thread.id,intent]);
        if(thread.lead_id){
          await db.query(`update public.leads set first_reply_at=coalesce(first_reply_at,now()),dnc=case when $2 in ('unsubscribe','not_interested') then true else dnc end where id=$1`,[thread.lead_id,intent]);
          await db.query(`update public.dm_enrollments set state='replied',stopped_at=now(),stop_reason='manual_reply'
            where organization_id=$1 and entity_type='lead' and entity_id=$2 and state in ('queued','step_due','sent')`,[thread.organization_id,thread.lead_id]);
        }
        await db.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id,metadata)
          values($1,$2,'manual_reply_logged','conversation',$3,jsonb_build_object('intent',$4))`,[thread.organization_id,user.id,thread.id,intent]);
        await db.query('commit');return reply(res,200,{logged:true});
      }catch(error){await db.query('rollback');throw error;}finally{db.release();}
    }
    const update:Record<string,unknown>={updated_at:new Date().toISOString()};
    if(data.action==='link') {
      const type=String(data.entity_type||'');const entityId=String(data.entity_id||'');
      if(!uuid.test(entityId)||!['lead','contact','company'].includes(type))throw new Error('Invalid link target');
      const table=type==='lead'?'leads':type==='contact'?'crm_contacts':'crm_companies';
      let target=await socialRest<any[]>(`${table}?id=eq.${entityId}&select=id,organization_id${type==='lead'?',owner_rep_id':''}&limit=1`);
      if(!target.length&&type==='company'&&thread.organization_id===LEGACY_ORG)
        target=await socialRest<any[]>(`companies?id=eq.${entityId}&select=id&limit=1`);
      if(!target.length||(target[0].organization_id||LEGACY_ORG)!==thread.organization_id)throw new Error('Target belongs to another organization');
      if(type==='lead'&&thread.assigned_to&&!isSocialOwner(user,thread.organization_id)&&target[0].owner_rep_id!==thread.assigned_to)
        throw new Error('This lead belongs to another rep');
      update.lead_id=type==='lead'?entityId:null;update.contact_id=type==='contact'?entityId:null;
      update.company_id=type==='company'&&target[0].organization_id?entityId:null;
      update.legacy_company_id=type==='company'&&!target[0].organization_id?entityId:null;
      update.match_status='matched';update.match_confidence=1;update.matched_at=new Date().toISOString();update.matched_by_user_id=user.id;
      const profilePlatform=thread.channel==='linkedin'?'linkedin_person':thread.channel;
      const profiles=await socialRest<any[]>(`social_profiles?organization_id=eq.${thread.organization_id}&entity_type=eq.${type}&entity_id=eq.${entityId}&platform=eq.${profilePlatform}&select=id,platform_user_id&order=is_primary.desc&limit=1`);
      if(profiles.length&&thread.participant_platform_id&&!profiles[0].platform_user_id)
        await socialRest(`social_profiles?id=eq.${profiles[0].id}`,{method:'PATCH',body:JSON.stringify({platform_user_id:thread.participant_platform_id})});
      await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id,metadata)
        values($1,$2,'conversation_linked','conversation',$3,jsonb_build_object('entity_type',$4,'entity_id',$5))`,
        [thread.organization_id,user.id,thread.id,type,entityId]);
    } else if(data.action==='ignore') {
      update.match_status='ignored';update.status='closed';update.unread_count=0;
      await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id)
        values($1,$2,'conversation_ignored','conversation',$3)`,[thread.organization_id,user.id,thread.id]);
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
