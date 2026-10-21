import {useEffect,useMemo,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Check,Copy,ExternalLink,Inbox} from 'lucide-react';
import {PageHeader} from '@/components/page-layout';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {apiFetch} from '@/lib/api';

type Task={id:string;account_label:string|null;step_type:string;channel:string;first_name:string|null;company:string|null;handle:string|null;profile_url:string|null;rendered_message:string|null;due_at:string};
type Target={account_id:string;label:string;daily_new_dm_cap:number;daily_followup_cap:number;new_sent:number;followups_sent:number};
const actions:[string,string][]=[['sent','Sent'],['followed','Followed'],['engaged','Engaged'],['skipped','Skipped'],['profile_not_found','Profile not found'],['wrong_person','Wrong person']];
export default function DmQueue(){
  const qc=useQueryClient(),[account,setAccount]=useState('all'),[active,setActive]=useState<string|null>(null),[copied,setCopied]=useState<string|null>(null);
  const tasks=useQuery<{tasks:Task[];targets:Target[]}>({queryKey:['dm-queue'],queryFn:()=>apiFetch('/api/dm-queue'),refetchInterval:30000});
  const filtered=useMemo(()=>tasks.data?.tasks.filter(task=>account==='all'||task.account_label===account)||[],[tasks.data,account]);
  const accounts=useMemo(()=>[...new Set(tasks.data?.tasks.map(task=>task.account_label||'Unassigned')||[])],[tasks.data]);
  const act=useMutation({mutationFn:({id,action}:{id:string;action:string})=>apiFetch('/api/dm-queue',{method:'POST',body:JSON.stringify({task_id:id,action})}),onSuccess:()=>void qc.invalidateQueries({queryKey:['dm-queue']})});
  useEffect(()=>{const keyboard=(event:KeyboardEvent)=>{if(!active||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
    const index=Number(event.key)-1;if(index>=0&&index<actions.length){event.preventDefault();act.mutate({id:active,action:actions[index][0]});}};
    window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard);},[active,act]);
  async function copy(task:Task){if(!task.rendered_message)return;await navigator.clipboard.writeText(task.rendered_message);setCopied(task.id);window.setTimeout(()=>setCopied(null),1500);}
  return <div className="page-stack space-y-5"><PageHeader title="DM queue" description="Work through today's social actions. Messages are sent only when your team sends them."/>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Inbox className="h-5 w-5"/></span><div><strong className="text-sm">{filtered.length} due {filtered.length===1?'action':'actions'}</strong><p className="text-xs text-muted-foreground">Desktop shortcuts 1–6 act on the selected card.</p></div></div><label className="text-xs font-medium text-muted-foreground">Account<select className="ml-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" value={account} onChange={event=>setAccount(event.target.value)}><option value="all">All accounts</option>{accounts.map(item=><option key={item}>{item}</option>)}</select></label></div>
    {!!tasks.data?.targets.length&&<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tasks.data.targets.filter(item=>account==='all'||item.label===account).map(item=><div key={item.account_id} className="rounded-xl border border-border bg-card p-4 shadow-sm"><strong className="text-sm">{item.label}</strong><div className="mt-2 text-xs text-muted-foreground">First DMs {item.new_sent}/{item.daily_new_dm_cap} target · Follow-ups {item.followups_sent}/{item.daily_followup_cap} target</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${Math.min(100,item.daily_new_dm_cap?item.new_sent/item.daily_new_dm_cap*100:100)}%`}}/></div>{(item.new_sent>item.daily_new_dm_cap||item.followups_sent>item.daily_followup_cap)&&<p className="mt-2 text-xs text-amber-700">Above today's target. You can still record work you completed.</p>}</div>)}</div>}
    {tasks.isLoading&&<p className="text-sm text-muted-foreground">Loading today's tasks…</p>}
    {tasks.isError&&<p role="alert" className="text-sm text-destructive">Could not load the DM queue.</p>}
    {act.isError&&<p role="alert" className="text-sm text-destructive">{String(act.error)}</p>}
    <div className="grid gap-4 lg:grid-cols-2">{filtered.map(task=><article key={task.id} className={`rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 ${active===task.id?'ring-2 ring-primary/30':''}`} onClick={()=>setActive(task.id)}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{task.first_name||task.company||task.handle||'Prospect'}</h2><p className="mt-1 text-xs text-muted-foreground">{task.account_label||'Unassigned'}</p></div><div className="flex gap-1.5"><Badge variant="outline" className="capitalize">{task.channel}</Badge><Badge variant="secondary" className="capitalize">{task.step_type.replace('_',' ')}</Badge></div></div>
      {task.handle&&<p className="mt-2 text-sm text-muted-foreground">@{task.handle}</p>}
      <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">{task.rendered_message||'Open the profile and complete this action manually.'}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!task.rendered_message} onClick={()=>void copy(task)}>{copied===task.id?<Check className="mr-1.5 h-4 w-4"/>:<Copy className="mr-1.5 h-4 w-4"/>}{copied===task.id?'Copied':'Copy message'}</Button>
        {task.profile_url&&<Button asChild variant="outline" size="sm"><a href={task.profile_url} target="_blank" rel="noopener noreferrer">Open profile <ExternalLink className="ml-1.5 h-3.5 w-3.5"/></a></Button>}</div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:grid-cols-3">{actions.map(([value,label],index)=><button key={value} className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50 ${value==='sent'?'border-primary bg-primary text-primary-foreground hover:bg-primary/90':''}`} disabled={act.isPending} onClick={()=>act.mutate({id:task.id,action:value})}>{index+1}. {label}</button>)}</div>
    </article>)}</div>
    {!tasks.isLoading&&!filtered.length&&<div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><Check className="mx-auto h-8 w-8 text-primary"/><p className="mt-3 text-sm font-medium">You're all caught up</p><p className="mt-1 text-sm text-muted-foreground">No due DM tasks for this account.</p></div>}
  </div>;
}
