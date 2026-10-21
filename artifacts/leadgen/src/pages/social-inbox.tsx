import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-layout';
import { apiFetch } from '@/lib/api';

type Conversation = {id:string;channel:string;connected_account_id:string|null;assigned_to:string|null;participant_handle:string|null;participant_platform_id:string|null;lead_id:string|null;suggested_lead_id:string|null;contact_id:string|null;company_id:string|null;legacy_company_id:string|null;match_status:string;match_confidence:number|null;status:string;intent:string;unread_count:number;last_message_at:string|null;reply_window_expires_at:string|null};
type Message = {id:string;direction:'inbound'|'outbound';body:string;created_at:string;sent_via:string|null};
type Profile = {id:string;platform:string;handle:string;profile_url:string|null};
type Thread = {conversation:Conversation;messages:Message[];profiles:Profile[];relatedMessages:Array<Message & {channel:string}>;canReply:boolean;manualReply:boolean;replyOwedDueAt:string|null};
const channels=['all','instagram','facebook','whatsapp','email','sms','x','linkedin','other'];
const field='rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary';
const panel='rounded-xl border border-border bg-card shadow-sm';
export default function SocialInbox() {
  const qc=useQueryClient();
  const [channel,setChannel]=useState('all'),[status,setStatus]=useState('open'),[intent,setIntent]=useState('all');
  const [matchFilter,setMatchFilter]=useState('all'),[unread,setUnread]=useState(false),[replyOwed,setReplyOwed]=useState(false),[selected,setSelected]=useState<string|null>(null);
  const [linkId,setLinkId]=useState(''),[linkType,setLinkType]=useState<'lead'|'contact'|'company'>('lead'),[error,setError]=useState('');
  const [draft,setDraft]=useState('');
  const [manualIntent,setManualIntent]=useState('unknown');
  const [account,setAccount]=useState(''),[assignee,setAssignee]=useState(''),[taskTitle,setTaskTitle]=useState('');
  const accounts=useQuery<{accounts:Array<{id:string;label:string}>}>({queryKey:['social-accounts'],queryFn:()=>apiFetch('/api/social-accounts')});
  const params=new URLSearchParams();
  if(channel!=='all')params.set('channel',channel);if(status!=='all')params.set('status',status);if(intent!=='all')params.set('intent',intent);
  if(matchFilter!=='all')params.set('match_status',matchFilter);if(unread)params.set('unread','true');if(replyOwed)params.set('reply_owed','true');
  if(account)params.set('connected_account_id',account);if(assignee)params.set('assigned_to',assignee);
  const list=useQuery<{conversations:Conversation[]}>({queryKey:['social-inbox',params.toString()],queryFn:()=>apiFetch(`/api/social-inbox?${params}`),refetchInterval:30000});
  const thread=useQuery<Thread>({queryKey:['social-thread',selected],queryFn:()=>apiFetch(`/api/social-inbox?id=${selected}`),enabled:!!selected,refetchInterval:30000});
  const leadId=thread.data?.conversation.lead_id;
  const context=useQuery<{opportunities:Array<{id:string;title:string;stageName:string}>;openTasks:Array<{id:string;title:string;dueDate:string|null}>}>({
    queryKey:['social-lead-context',leadId],queryFn:()=>apiFetch(`/api/contacts/${leadId}/context`),enabled:!!leadId});
  const stages=useQuery<Array<{id:string;name:string;key?:string}>>({queryKey:['pipeline-stages'],queryFn:()=>apiFetch('/api/pipeline/stages'),enabled:!!leadId});
  const change=useMutation({mutationFn:(payload:Record<string,unknown>)=>apiFetch('/api/social-inbox',{method:'POST',body:JSON.stringify({id:selected,...payload})}),
    onSuccess:()=>{setError('');void qc.invalidateQueries({queryKey:['social-inbox']});void qc.invalidateQueries({queryKey:['social-thread',selected]});},
    onError:(reason)=>setError(String(reason))});
  const send=useMutation({mutationFn:()=>apiFetch('/api/social-reply',{method:'POST',body:JSON.stringify({conversation_id:selected,body:draft.trim()})}),
    onSuccess:()=>{setDraft('');setError('');void qc.invalidateQueries({queryKey:['social-thread',selected]});void qc.invalidateQueries({queryKey:['social-inbox']});},
    onError:(reason)=>setError(String(reason))});
  const suggest=useMutation({mutationFn:()=>apiFetch('/api/social-draft',{method:'POST',body:JSON.stringify({conversation_id:selected})}) as Promise<{draft:string}>,
    onSuccess:(result)=>{setDraft(result.draft);setError('');},onError:(reason)=>setError(String(reason))});
  const logReply=useMutation({mutationFn:()=>apiFetch('/api/social-inbox',{method:'POST',body:JSON.stringify({id:selected,action:'log_reply',body:draft.trim(),intent:manualIntent})}),
    onSuccess:()=>{setDraft('');setError('');void qc.invalidateQueries({queryKey:['social-thread',selected]});void qc.invalidateQueries({queryKey:['social-inbox']});},
    onError:(reason)=>setError(String(reason))});
  const updateLead=useMutation({mutationFn:(value:Record<string,unknown>)=>apiFetch(`/api/leads/${leadId}`,{method:'PATCH',body:JSON.stringify(value)}),
    onSuccess:()=>{setError('');void qc.invalidateQueries({queryKey:['social-lead-context',leadId]});},onError:(reason)=>setError(String(reason))});
  const current=thread.data?.conversation;
  return <div className="page-stack space-y-5"><PageHeader title="Unified inbox" description="Social, email, and SMS replies in one place."/>
    <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
      <select aria-label="Channel" className={field} value={channel} onChange={(e)=>setChannel(e.target.value)}>{channels.map((item)=><option key={item} value={item}>{item==='all'?'All channels':item}</option>)}</select>
      <select aria-label="Status" className={field} value={status} onChange={(e)=>setStatus(e.target.value)}>{['all','open','snoozed','closed'].map((item)=><option key={item}>{item}</option>)}</select>
      <select aria-label="Intent" className={field} value={intent} onChange={(e)=>setIntent(e.target.value)}>{['all','interested','not_now','not_interested','wrong_person','ooo','unsubscribe','unknown'].map((item)=><option key={item}>{item}</option>)}</select>
      <select aria-label="Connected account" className={field} value={account} onChange={(e)=>setAccount(e.target.value)}><option value="">All accounts</option>{accounts.data?.accounts.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <input aria-label="Assignee ID filter" className={field+' w-40'} value={assignee} onChange={(e)=>setAssignee(e.target.value)} placeholder="Assignee UUID" />
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={unread} onChange={(e)=>setUnread(e.target.checked)}/> Unread</label>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={replyOwed} onChange={(e)=>setReplyOwed(e.target.checked)}/> Reply owed</label>
      <select aria-label="Match status" className={field} value={matchFilter} onChange={e=>setMatchFilter(e.target.value)}>{['all','matched','suggested','unmatched','ignored'].map(value=><option key={value} value={value}>{value==='all'?'All matches':value[0].toUpperCase()+value.slice(1)}</option>)}</select>
    </div>
    <div className="grid min-h-[560px] gap-3 lg:grid-cols-[280px_minmax(0,1fr)_250px]">
      <div className={panel+' max-h-[70vh] overflow-y-auto'}>
        {list.isLoading&&<p className="p-4 text-sm text-muted-foreground">Loading conversations…</p>}
        {list.isError&&<p role="alert" className="p-4 text-sm text-destructive">Could not load conversations.</p>}
        {list.data?.conversations.map((item)=><button key={item.id} onClick={()=>{setSelected(item.id);setError('');}} className={`w-full border-b p-3 text-left hover:bg-muted ${selected===item.id?'bg-muted':''}`}>
          <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{item.participant_handle||item.participant_platform_id||'Unknown sender'}</strong>{item.unread_count>0&&<span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{item.unread_count}</span>}</div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span className="capitalize">{item.channel} · {item.intent}</span><span>{item.last_message_at?new Date(item.last_message_at).toLocaleDateString():''}</span></div>
          {item.match_status!=='matched'&&<span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs capitalize text-amber-700">{item.match_status}</span>}
        </button>)}
        {!list.isLoading&&!list.data?.conversations.length&&<p className="p-4 text-sm text-muted-foreground">No conversations match these filters.</p>}
      </div>
      <div className={panel+' flex min-h-[540px] flex-col'}>
        {!current?<p className="m-auto text-sm text-muted-foreground">Select a conversation</p>:<>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4"><strong className="text-sm">{current.participant_handle||current.participant_platform_id||'Unknown sender'}</strong><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs capitalize text-primary">{current.channel}</span>{thread.data?.replyOwedDueAt&&<span className={`rounded-full px-2 py-0.5 text-xs ${new Date(thread.data.replyOwedDueAt).getTime()<Date.now()?'bg-red-100 text-red-700':'bg-amber-100 text-amber-800'}`}>Reply due {new Date(thread.data.replyOwedDueAt).toLocaleString()}</span>}<button className="ml-auto rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted" onClick={()=>change.mutate({action:'read'})}>Mark read</button></div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">{thread.data?.messages.map((message)=><div key={message.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${message.direction==='outbound'?'ml-auto bg-primary text-primary-foreground':'bg-muted'}`}>
            <p className="whitespace-pre-wrap break-words">{message.body||'(attachment)'}</p><div className="mt-1 text-[11px] opacity-70">{new Date(message.created_at).toLocaleString()} · {message.direction}{message.sent_via?` via ${message.sent_via}`:''}</div>
          </div>)}</div>
          {!!thread.data?.relatedMessages.length&&<details className="border-t p-3 text-xs"><summary className="cursor-pointer font-semibold">Other channel history ({thread.data.relatedMessages.length})</summary><div className="mt-2 max-h-48 space-y-2 overflow-auto">{thread.data.relatedMessages.map((message)=><div key={message.id} className="rounded bg-muted p-2"><strong className="capitalize">{message.channel}</strong> · {new Date(message.created_at).toLocaleString()} · {message.direction}<p className="whitespace-pre-wrap">{message.body}</p></div>)}</div></details>}
          <div className="space-y-2 border-t p-3 text-sm">{thread.data?.canReply?<>
            <p className="text-muted-foreground">Reply window closes {current.reply_window_expires_at?new Date(current.reply_window_expires_at).toLocaleString():'soon'}.</p>
            <textarea aria-label="Reply text" className="min-h-24 w-full rounded border p-2" maxLength={2000} value={draft} onChange={(e)=>setDraft(e.target.value)} placeholder="Write a reply for review…"/>
            <div className="flex flex-wrap gap-2"><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={suggest.isPending} onClick={()=>suggest.mutate()}>{suggest.isPending?'Drafting…':'Suggest reply'}</button>
            <button className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" disabled={!draft.trim()||send.isPending} onClick={()=>send.mutate()}>{send.isPending?'Sending…':'Send reply'}</button></div>
          </>:thread.data?.manualReply?<>
            <p className="text-muted-foreground">Reply in the social app, then record the response here. The CRM will stop the campaign for this lead.</p>
            <textarea aria-label="Manual reply text" className="min-h-24 w-full rounded border border-input bg-background p-2" maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Paste the reply, or leave blank if you only know its intent"/>
            <div className="flex flex-wrap gap-2"><select aria-label="Manual reply intent" className={field} value={manualIntent} onChange={e=>setManualIntent(e.target.value)}>{['unknown','interested','not_now','not_interested','wrong_person','ooo','unsubscribe'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select>
              <button className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" disabled={logReply.isPending||(!draft.trim()&&manualIntent==='unknown')} onClick={()=>logReply.mutate()}>Log reply</button></div>
          </>:<p className="text-muted-foreground">API reply is unavailable for this channel or the reply window is closed.</p>}</div>
        </>}
      </div>
      <aside className={panel+' space-y-4 p-4 text-sm'}>{current?<>
        <div><h2 className="font-semibold">Contact</h2>{current.lead_id?<a className="text-primary underline" href={`/leads/${current.lead_id}`}>Open lead</a>:current.contact_id?<span>CRM contact {current.contact_id}</span>:current.company_id||current.legacy_company_id?<a className="text-primary underline" href={`/companies/${current.legacy_company_id||current.company_id}`}>Open company</a>:<p className="text-amber-700">Unmatched conversation</p>}</div>
        <div><h2 className="font-semibold">Socials</h2>{thread.data?.profiles.length?thread.data.profiles.map((profile)=><a key={profile.id} className="mt-1 block text-primary hover:underline" href={profile.profile_url||'#'} target="_blank" rel="noopener noreferrer">{profile.platform}: @{profile.handle}</a>):<p className="text-muted-foreground">No saved profiles</p>}</div>
        <div className="space-y-2"><h2 className="font-semibold">Actions</h2><select aria-label="Conversation status" className="w-full rounded border px-2 py-2" value={current.status} onChange={(e)=>change.mutate({action:'status',status:e.target.value,...(e.target.value==='snoozed'?{snoozed_until:new Date(Date.now()+86400000).toISOString()}:{})})}>{['open','snoozed','closed'].map((item)=><option key={item}>{item}</option>)}</select>
          <select aria-label="Reply intent" className="w-full rounded border px-2 py-2" value={current.intent} onChange={(e)=>change.mutate({action:'intent',intent:e.target.value})}>{['unknown','interested','not_now','not_interested','wrong_person','ooo','unsubscribe'].map((item)=><option key={item}>{item}</option>)}</select>
          <button className="w-full rounded border p-2" onClick={()=>change.mutate({action:'intent',intent:'unsubscribe'})}>Add to DNC</button>
          <button className="w-full rounded border p-2 disabled:opacity-50" disabled={!current.assigned_to&&!assignee} onClick={()=>change.mutate({action:'assign',assigned_to:current.assigned_to?null:assignee})}>{current.assigned_to?'Unassign':'Assign to filtered user'}</button>
          {current.lead_id&&<><select aria-label="Pipeline stage" className="w-full rounded border p-2" defaultValue="" onChange={(event)=>{const stage=stages.data?.find((item)=>item.id===event.target.value);if(!stage)return;
            if(stage.key==='meeting_booked'){const value=window.prompt('Meeting time (YYYY-MM-DD HH:MM)');if(!value)return;const meeting=new Date(value);if(!Number.isFinite(meeting.getTime())){setError('Invalid meeting time');return;}
              updateLead.mutate({pipelineStageId:stage.id,meetingAt:meeting.toISOString(),meetingTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone,status:'meeting_booked'});
            }else updateLead.mutate({pipelineStageId:stage.id});}}><option value="">Change pipeline stage</option>{stages.data?.map((stage)=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>
          <form className="space-y-1" onSubmit={(event)=>{event.preventDefault();change.mutate({action:'create_task',title:taskTitle,due_at:new Date(Date.now()+86400000).toISOString()});setTaskTitle('');}}><input aria-label="Task title" className="w-full rounded border p-2" placeholder="Follow-up task" value={taskTitle} onChange={(event)=>setTaskTitle(event.target.value)}/><button className="w-full rounded border p-2" disabled={!taskTitle}>Create task for tomorrow</button></form></>}
        </div>
        {current.lead_id&&<div className="space-y-2"><h2 className="font-semibold">Deals and tasks</h2>{context.data?.opportunities.map((deal)=><div key={deal.id} className="rounded border p-2"><strong>{deal.title}</strong><p className="text-muted-foreground">{deal.stageName}</p></div>)}{context.data?.openTasks.map((task)=><div key={task.id} className="rounded border p-2">{task.title}{task.dueDate&&<span className="block text-xs text-muted-foreground">Due {new Date(task.dueDate).toLocaleDateString()}</span>}</div>)}</div>}
        {!current.lead_id&&!current.contact_id&&!current.company_id&&!current.legacy_company_id&&<form className="space-y-2" onSubmit={(e)=>{e.preventDefault();change.mutate({action:'link',entity_type:linkType,entity_id:linkId});}}><h2 className="font-semibold">{current.match_status==='suggested'?'Confirm a lead match':'Link to CRM record'}</h2>
          {current.match_status==='suggested'&&<p className="text-xs text-muted-foreground">A possible match needs your review before any lead is linked.</p>}
          {current.suggested_lead_id&&<button type="button" className="w-full rounded-lg border border-primary/30 bg-primary/5 p-2 text-left text-primary hover:bg-primary/10" onClick={()=>change.mutate({action:'link',entity_type:'lead',entity_id:current.suggested_lead_id})}>Confirm suggested lead</button>}
          <select aria-label="Record type" className="w-full rounded border px-2 py-2" value={linkType} onChange={(e)=>setLinkType(e.target.value as typeof linkType)}>{['lead','contact','company'].map((item)=><option key={item}>{item}</option>)}</select>
          <input aria-label="Record ID" className="w-full rounded border px-2 py-2" value={linkId} onChange={(e)=>setLinkId(e.target.value)} placeholder="Record UUID"/>
          <button className="w-full rounded bg-primary px-2 py-2 text-primary-foreground" disabled={!linkId||change.isPending}>Link record</button>
          <button type="button" className="w-full rounded border border-border p-2 text-muted-foreground hover:bg-muted" onClick={()=>change.mutate({action:'ignore'})}>Personal conversation, ignore</button>
          <button type="button" className="w-full rounded border p-2" onClick={async()=>{try{const firstName=window.prompt('New lead name',current.participant_handle||'')?.trim();if(!firstName)return;
            const lead=await apiFetch('/api/leads',{method:'POST',body:JSON.stringify({firstName,source:`${current.channel} inbound`})}) as {id:string};
            change.mutate({action:'link',entity_type:'lead',entity_id:lead.id});}catch(reason){setError(String(reason));}}}>Create lead and link</button></form>}
        {error&&<p role="alert" className="text-destructive">{error}</p>}
      </>:<p className="text-muted-foreground">Select a thread to view its contact.</p>}</aside>
    </div>
  </div>;
}
