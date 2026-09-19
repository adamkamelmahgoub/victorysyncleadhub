import { workspaceInput, workspaceButton } from "@/components/page-layout";
import { PageTitle, PageDescription } from "@/components/page-layout";
import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {Link} from 'wouter';
import {apiFetch} from '@/lib/api';
import {useToast} from '@/hooks/use-toast';

const input = workspaceInput;
const button = workspaceButton;
type Sequence={id:string|number;name:string;label?:string|null;status:string;total_enrolled:number};
type Inbox={id:string|number;email:string;provider:string;checked_at:string|null;poll_after:string};
export default function SequencesPage(){
 const cache=useQueryClient(),{toast}=useToast();const [name,setName]=useState('');
 const {data:sequences=[],error}=useQuery<Sequence[]>({queryKey:['sequences'],queryFn:()=>apiFetch('/sequences')});
 const {data:inboxes=[]}=useQuery<Inbox[]>({queryKey:['sequence-inboxes'],queryFn:()=>apiFetch('/email/inboxes'),refetchInterval:30000});
 const [config,setConfig]=useState({id:'',provider:'imap',host:'',user:'',password:'',apiKey:'',folder:'INBOX'});
 const mutation=useMutation({mutationFn:({path,method='POST',body={}}:{path:string;method?:string;body?:unknown})=>apiFetch(path,{method,body:JSON.stringify(body)}),onSuccess:()=>{cache.invalidateQueries({queryKey:['sequences']});cache.invalidateQueries({queryKey:['sequence-inboxes']});}});
 return <div className="page-stack">
  <header><PageTitle>Sequences</PageTitle><PageDescription>One cadence per contact. Replies and call outcomes stop email follow-ups.</PageDescription></header>
  {error&&<p role="alert" className="text-red-600">{error.message}</p>}
  <form className="flex gap-2" onSubmit={async e=>{e.preventDefault();await mutation.mutateAsync({path:'/sequences',body:{name}});setName('');}}><input className={input} aria-label="Sequence name" required value={name} onChange={e=>setName(e.target.value)} placeholder="New sequence name"/><button className={button} disabled={mutation.isPending}>Create draft</button></form>
  <section className="workspace-panel overflow-auto"><table className="workspace-table w-full text-sm text-left"><thead><tr className="border-b"><th className="p-3">Sequence</th><th>Label</th><th>Status</th><th>Enrollments</th><th/></tr></thead><tbody>{sequences.map(s=><tr className="border-b" key={s.id}><td className="p-3"><Link className="text-primary underline" href={`/sequences/${s.id}`}>{s.name}</Link></td><td>{s.label??'—'}</td><td>{s.status}</td><td>{s.total_enrolled??0}</td><td className="p-2 space-x-2"><button className={button} disabled={mutation.isPending} onClick={()=>mutation.mutate({path:`/sequences/${s.id}`,method:'PUT',body:{status:s.status==='active'?'paused':'active'}})}>{s.status==='active'?'Pause':'Activate'}</button><button className={button} disabled={mutation.isPending} onClick={()=>{if(confirm(`Delete ${s.name}?`))mutation.mutate({path:`/sequences/${s.id}`,method:'DELETE'});}}>Delete</button></td></tr>)}</tbody></table></section>
  <section className="workspace-panel p-4 space-y-4"><h2 className="font-semibold">Reply monitoring</h2><p className="text-sm text-muted-foreground">Connect the inbox that receives replies to each sender address. Sequences require a successful check within the last 10 minutes.</p>
   <div className="overflow-auto"><table className="workspace-table w-full text-sm text-left"><thead><tr><th>Sender</th><th>Inbox</th><th>Last successful check</th></tr></thead><tbody>{inboxes.map(i=><tr key={i.id}><td className="py-2">{i.email}</td><td>{i.provider}</td><td>{i.checked_at?new Date(i.checked_at).toLocaleString():'Not checked — sending held'}</td></tr>)}</tbody></table></div>
   {!inboxes.length&&<p className="text-sm">First connect a sender in <Link className="underline" href="/email-accounts">Outreach Mailboxes</Link>.</p>}
   {inboxes.length>0&&<form className="grid gap-3 md:grid-cols-2" onSubmit={async e=>{e.preventDefault();await mutation.mutateAsync({path:`/email/inboxes/${config.id}`,method:'PUT',body:config});setConfig({...config,password:'',apiKey:''});toast({title:'Reply inbox configured',description:'Run an inbox check and configure recurring polling before enrollment.'});}}>
    <label className="text-xs">Sender<select className={input} required value={config.id} onChange={e=>setConfig({...config,id:e.target.value})}><option value="">Choose sender</option>{inboxes.map(i=><option key={i.id} value={i.id}>{i.email}</option>)}</select></label>
    <label className="text-xs">Receiving service<select className={input} value={config.provider} onChange={e=>setConfig({...config,provider:e.target.value,password:'',apiKey:''})}><option value="imap">IMAP inbox</option><option value="resend">Resend receiving API</option></select></label>
    {config.provider==='imap'?<><label className="text-xs">IMAP host<input className={input} required value={config.host} onChange={e=>setConfig({...config,host:e.target.value})} placeholder="imap.example.com"/></label><label className="text-xs">Username<input className={input} required value={config.user} onChange={e=>setConfig({...config,user:e.target.value})}/></label><label className="text-xs">Password / app password<input className={input} required type="password" autoComplete="new-password" value={config.password} onChange={e=>setConfig({...config,password:e.target.value})}/></label><label className="text-xs">Folder<input className={input} required value={config.folder} onChange={e=>setConfig({...config,folder:e.target.value})}/></label></>:<label className="text-xs">Resend receiving API key<input className={input} required type="password" autoComplete="new-password" value={config.apiKey} onChange={e=>setConfig({...config,apiKey:e.target.value})}/></label>}
    <div className="md:col-span-2 flex gap-2"><button className={button} disabled={mutation.isPending}>Save inbox</button><button type="button" className={button} disabled={mutation.isPending} onClick={async()=>{const r=await mutation.mutateAsync({path:'/email/inboxes/poll'});toast({title:r.error?'Inbox check failed':'Inbox check finished',description:r.error??`${r.polled} inbox checked; ${r.messages??0} messages processed.`});}}>Check next due inbox</button></div>
   </form>}
  </section>
 </div>;
}
