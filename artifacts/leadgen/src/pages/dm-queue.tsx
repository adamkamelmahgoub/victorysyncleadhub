import { useEffect,useMemo,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-layout';
import { apiFetch } from '@/lib/api';
type Task={id:string;account_label:string|null;step_type:string;channel:string;first_name:string|null;company:string|null;
  handle:string|null;profile_url:string|null;rendered_message:string|null;due_at:string};
const actions:[string,string][]=[['sent','Sent'],['followed','Followed'],['engaged','Engaged'],['skipped','Skipped'],['profile_not_found','Profile not found'],['wrong_person','Wrong person']];
export default function DmQueue(){const qc=useQueryClient();const [account,setAccount]=useState('all');const [active,setActive]=useState<string|null>(null);const [copied,setCopied]=useState<string|null>(null);
  const tasks=useQuery<{tasks:Task[]}>({queryKey:['dm-queue'],queryFn:()=>apiFetch('/api/dm-queue'),refetchInterval:30000});
  const filtered=useMemo(()=>tasks.data?.tasks.filter((task)=>account==='all'||task.account_label===account)||[],[tasks.data,account]);
  const accounts=useMemo(()=>[...new Set(tasks.data?.tasks.map((task)=>task.account_label||'Unassigned')||[])], [tasks.data]);
  const act=useMutation({mutationFn:({id,action}:{id:string;action:string})=>apiFetch('/api/dm-queue',{method:'POST',body:JSON.stringify({task_id:id,action})}),
    onSuccess:()=>void qc.invalidateQueries({queryKey:['dm-queue']})});
  useEffect(()=>{const keyboard=(event:KeyboardEvent)=>{if(!active||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
    const index=Number(event.key)-1;if(index>=0&&index<actions.length){event.preventDefault();act.mutate({id:active,action:actions[index][0]});}};
    window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard);},[active,act]);
  async function copy(task:Task){if(!task.rendered_message)return;await navigator.clipboard.writeText(task.rendered_message);setCopied(task.id);window.setTimeout(()=>setCopied(null),1500);}
  return <div className="page-stack"><PageHeader title="DM Queue" description="Work through due social actions from your phone or desktop. No message is sent automatically."/>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3"><label className="text-sm">Account <select className="ml-2 rounded border px-2 py-2" value={account} onChange={(e)=>setAccount(e.target.value)}><option value="all">All accounts</option>{accounts.map((item)=><option key={item}>{item}</option>)}</select></label>
      <span className="text-sm text-muted-foreground">{filtered.length} due · Desktop shortcuts 1–6 act on the selected card</span></div>
    {tasks.isLoading&&<p className="text-sm text-muted-foreground">Loading today's tasks…</p>}
    {tasks.isError&&<p role="alert" className="text-sm text-destructive">Could not load the DM queue.</p>}
    {act.isError&&<p role="alert" className="text-sm text-destructive">{String(act.error)}</p>}
    <div className="grid gap-3 md:grid-cols-2">{filtered.map((task)=><article key={task.id} className={`rounded-xl border bg-card p-4 ${active===task.id?'ring-2 ring-primary':''}`} onClick={()=>setActive(task.id)}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{task.first_name||task.company||task.handle||'Prospect'}</h2><span className="text-xs capitalize text-muted-foreground">{task.account_label||'Unassigned'} · {task.channel} · {task.step_type.replace('_',' ')}</span></div>
      {task.handle&&<p className="mt-1 text-sm">@{task.handle}</p>}
      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{task.rendered_message||'Open the profile and complete this action manually.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={!task.rendered_message} onClick={()=>void copy(task)}>{copied===task.id?'Copied':'Copy message'}</button>
        {task.profile_url&&<a href={task.profile_url} target="_blank" rel="noopener noreferrer" className="rounded border px-3 py-2 text-sm">Open profile</a>}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{actions.map(([value,label],index)=><button key={value} className="rounded border px-2 py-2 text-xs hover:bg-muted disabled:opacity-50" disabled={act.isPending}
        onClick={()=>act.mutate({id:task.id,action:value})}>{index+1}. {label}</button>)}</div>
    </article>)}</div>
    {!tasks.isLoading&&!filtered.length&&<p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No due DM tasks for this account.</p>}
  </div>;
}
