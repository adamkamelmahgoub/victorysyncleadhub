import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-layout';
import { apiFetch } from '@/lib/api';

type Conversation = {id:string;channel:string;participant_handle:string|null;participant_platform_id:string|null;lead_id:string|null;contact_id:string|null;company_id:string|null;status:string;intent:string;unread_count:number;last_message_at:string|null;reply_window_expires_at:string|null};
type Message = {id:string;direction:'inbound'|'outbound';body:string;created_at:string;sent_via:string|null};
type Profile = {id:string;platform:string;handle:string;profile_url:string|null};
type Thread = {conversation:Conversation;messages:Message[];profiles:Profile[];canReply:boolean};
const channels=['all','instagram','facebook','whatsapp','email','sms','x','linkedin','other'];
export default function SocialInbox() {
  const qc=useQueryClient();
  const [channel,setChannel]=useState('all'),[status,setStatus]=useState('open'),[intent,setIntent]=useState('all');
  const [unmatched,setUnmatched]=useState(false),[unread,setUnread]=useState(false),[selected,setSelected]=useState<string|null>(null);
  const [linkId,setLinkId]=useState(''),[linkType,setLinkType]=useState<'lead'|'contact'|'company'>('lead'),[error,setError]=useState('');
  const params=new URLSearchParams();
  if(channel!=='all')params.set('channel',channel);if(status!=='all')params.set('status',status);if(intent!=='all')params.set('intent',intent);
  if(unmatched)params.set('unmatched','true');if(unread)params.set('unread','true');
  const list=useQuery<{conversations:Conversation[]}>({queryKey:['social-inbox',params.toString()],queryFn:()=>apiFetch(`/api/social-inbox?${params}`),refetchInterval:30000});
  const thread=useQuery<Thread>({queryKey:['social-thread',selected],queryFn:()=>apiFetch(`/api/social-inbox?id=${selected}`),enabled:!!selected,refetchInterval:30000});
  const change=useMutation({mutationFn:(payload:Record<string,unknown>)=>apiFetch('/api/social-inbox',{method:'POST',body:JSON.stringify({id:selected,...payload})}),
    onSuccess:()=>{setError('');void qc.invalidateQueries({queryKey:['social-inbox']});void qc.invalidateQueries({queryKey:['social-thread',selected]});},
    onError:(reason)=>setError(String(reason))});
  const current=thread.data?.conversation;
  return <div className="page-stack"><PageHeader title="Unified Inbox" description="Social, email, and SMS replies in one place."/>
    <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3">
      <select aria-label="Channel" className="rounded border px-2 py-2 text-sm" value={channel} onChange={(e)=>setChannel(e.target.value)}>{channels.map((item)=><option key={item} value={item}>{item==='all'?'All channels':item}</option>)}</select>
      <select aria-label="Status" className="rounded border px-2 py-2 text-sm" value={status} onChange={(e)=>setStatus(e.target.value)}>{['all','open','snoozed','closed'].map((item)=><option key={item}>{item}</option>)}</select>
      <select aria-label="Intent" className="rounded border px-2 py-2 text-sm" value={intent} onChange={(e)=>setIntent(e.target.value)}>{['all','interested','not_now','not_interested','wrong_person','ooo','unsubscribe','unknown'].map((item)=><option key={item}>{item}</option>)}</select>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={unread} onChange={(e)=>setUnread(e.target.checked)}/> Unread</label>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={unmatched} onChange={(e)=>setUnmatched(e.target.checked)}/> Unmatched</label>
    </div>
    <div className="grid min-h-[560px] gap-3 lg:grid-cols-[280px_minmax(0,1fr)_250px]">
      <div className="max-h-[70vh] overflow-y-auto rounded-xl border bg-card">
        {list.isLoading&&<p className="p-4 text-sm text-muted-foreground">Loading conversations…</p>}
        {list.isError&&<p role="alert" className="p-4 text-sm text-destructive">Could not load conversations.</p>}
        {list.data?.conversations.map((item)=><button key={item.id} onClick={()=>{setSelected(item.id);setError('');}} className={`w-full border-b p-3 text-left hover:bg-muted ${selected===item.id?'bg-muted':''}`}>
          <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{item.participant_handle||item.participant_platform_id||'Unknown sender'}</strong>{item.unread_count>0&&<span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{item.unread_count}</span>}</div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span className="capitalize">{item.channel} · {item.intent}</span><span>{item.last_message_at?new Date(item.last_message_at).toLocaleDateString():''}</span></div>
          {!item.lead_id&&!item.contact_id&&!item.company_id&&<span className="mt-1 inline-block text-xs text-amber-700">Unmatched</span>}
        </button>)}
        {!list.isLoading&&!list.data?.conversations.length&&<p className="p-4 text-sm text-muted-foreground">No conversations match these filters.</p>}
      </div>
      <div className="flex min-h-[540px] flex-col rounded-xl border bg-card">
        {!current?<p className="m-auto text-sm text-muted-foreground">Select a conversation</p>:<>
          <div className="flex flex-wrap items-center gap-2 border-b p-3"><strong className="text-sm">{current.participant_handle||current.participant_platform_id||'Unknown sender'}</strong><span className="text-xs capitalize text-muted-foreground">{current.channel}</span><button className="ml-auto rounded border px-2 py-1 text-xs" onClick={()=>change.mutate({action:'read'})}>Mark read</button></div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">{thread.data?.messages.map((message)=><div key={message.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${message.direction==='outbound'?'ml-auto bg-primary text-primary-foreground':'bg-muted'}`}>
            <p className="whitespace-pre-wrap break-words">{message.body||'(attachment)'}</p><div className="mt-1 text-[11px] opacity-70">{new Date(message.created_at).toLocaleString()} · {message.direction}{message.sent_via?` via ${message.sent_via}`:''}</div>
          </div>)}</div>
          <div className="border-t p-3 text-sm text-muted-foreground">{thread.data?.canReply?`Reply window closes ${current.reply_window_expires_at?new Date(current.reply_window_expires_at).toLocaleString():'soon'}. API reply setup is pending.`:'API reply is unavailable for this channel or the reply window is closed.'}</div>
        </>}
      </div>
      <aside className="space-y-4 rounded-xl border bg-card p-4 text-sm">{current?<>
        <div><h2 className="font-semibold">Contact</h2>{current.lead_id?<a className="text-primary underline" href={`/leads/${current.lead_id}`}>Open lead</a>:current.contact_id?<span>CRM contact {current.contact_id}</span>:current.company_id?<a className="text-primary underline" href={`/companies/${current.company_id}`}>Open company</a>:<p className="text-amber-700">Unmatched conversation</p>}</div>
        <div><h2 className="font-semibold">Socials</h2>{thread.data?.profiles.length?thread.data.profiles.map((profile)=><a key={profile.id} className="mt-1 block text-primary hover:underline" href={profile.profile_url||'#'} target="_blank" rel="noopener noreferrer">{profile.platform}: @{profile.handle}</a>):<p className="text-muted-foreground">No saved profiles</p>}</div>
        <div className="space-y-2"><h2 className="font-semibold">Actions</h2><select aria-label="Conversation status" className="w-full rounded border px-2 py-2" value={current.status} onChange={(e)=>change.mutate({action:'status',status:e.target.value})}>{['open','snoozed','closed'].map((item)=><option key={item}>{item}</option>)}</select>
          <select aria-label="Reply intent" className="w-full rounded border px-2 py-2" value={current.intent} onChange={(e)=>change.mutate({action:'intent',intent:e.target.value})}>{['unknown','interested','not_now','not_interested','wrong_person','ooo','unsubscribe'].map((item)=><option key={item}>{item}</option>)}</select></div>
        {!current.lead_id&&!current.contact_id&&!current.company_id&&<form className="space-y-2" onSubmit={(e)=>{e.preventDefault();change.mutate({action:'link',entity_type:linkType,entity_id:linkId});}}><h2 className="font-semibold">Link to CRM record</h2>
          <select aria-label="Record type" className="w-full rounded border px-2 py-2" value={linkType} onChange={(e)=>setLinkType(e.target.value as typeof linkType)}>{['lead','contact','company'].map((item)=><option key={item}>{item}</option>)}</select>
          <input aria-label="Record ID" className="w-full rounded border px-2 py-2" value={linkId} onChange={(e)=>setLinkId(e.target.value)} placeholder="Record UUID"/>
          <button className="w-full rounded bg-primary px-2 py-2 text-primary-foreground" disabled={!linkId||change.isPending}>Link record</button></form>}
        {error&&<p role="alert" className="text-destructive">{error}</p>}
      </>:<p className="text-muted-foreground">Select a thread to view its contact.</p>}</aside>
    </div>
  </div>;
}
