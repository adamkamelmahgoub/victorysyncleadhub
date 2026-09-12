import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {Link,useRoute} from 'wouter';
import {apiFetch} from '@/lib/api';
import {useToast} from '@/hooks/use-toast';

type Step={id:string|number;step_number:number;channel:string;delay_days:number;subject:string;body:string};
type Enrollment={id:string|number;email:string;company:string;mailbox:string;status:string;current_step:number;next_send_at:string|null;pause_reason:string|null;stopped_reason:string|null};
type Sequence={id:string|number;name:string;status:string;steps:Step[];enrollments:Enrollment[]};
const input='w-full rounded border border-border bg-background px-3 py-2 text-sm';
const button='rounded border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50';
const variables=['firstName','company','city','avg_job_value','missed_calls_per_week','after_hours_coverage','uses_answering_service'];
function StepForm({step,locked,save,remove}:{step:Step;locked:boolean;save:(step:Step)=>Promise<unknown>;remove:()=>Promise<unknown>}){
 const [draft,setDraft]=useState(step),[busy,setBusy]=useState(false);
 return <form className="rounded border bg-card p-4 space-y-3" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await save(draft);}finally{setBusy(false);}}}>
  <div className="grid gap-3 md:grid-cols-3"><label className="text-xs">Step number<input className={input} type="number" min="1" disabled={locked} value={draft.step_number} onChange={e=>setDraft({...draft,step_number:Number(e.target.value)})}/></label><label className="text-xs">Channel<select className={input} disabled={locked} value={draft.channel} onChange={e=>setDraft({...draft,channel:e.target.value})}><option value="email">Email</option><option value="call_task">Call task</option></select></label><label className="text-xs">Days after previous step<input className={input} type="number" min="0" max="365" disabled={locked} value={draft.delay_days} onChange={e=>setDraft({...draft,delay_days:Number(e.target.value)})}/></label></div>
  {draft.channel==='email'&&<input aria-label="Subject template" className={input} required disabled={locked} value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/>}
  <textarea aria-label={draft.channel==='email'?'Body template':'Call instructions'} className={`${input} min-h-32`} required disabled={locked} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/>
  {!locked&&<div className="flex gap-2"><button className={button} disabled={busy}>Save step</button><button type="button" className={button} disabled={busy} onClick={remove}>Delete step</button></div>}
 </form>;
}
export default function SequenceEditor(){
 const [,route]=useRoute('/sequences/:id'),[,prefixed]=useRoute('/leadgen/sequences/:id');const id=route?.id??prefixed?.id;
 const cache=useQueryClient(),{toast}=useToast();const [search,setSearch]=useState(''),[contacts,setContacts]=useState<Array<{id:string|number;email:string;company:string}>>([]),[selected,setSelected]=useState<string[]>([]);
 const {data:sequence,error}=useQuery<Sequence>({queryKey:['sequence',id],enabled:!!id,queryFn:()=>apiFetch(`/sequences/${id}`),refetchInterval:30000});
 const mutation=useMutation({mutationFn:({path,method='POST',body={}}:{path:string;method?:string;body?:unknown})=>apiFetch(path,{method,body:JSON.stringify(body)}),onSuccess:()=>{cache.invalidateQueries({queryKey:['sequence',id]});cache.invalidateQueries({queryKey:['sequences']});}});
 if(error)return <main className="p-6" role="alert">{error.message}</main>;
 if(!sequence)return <main className="p-6">Loading sequence…</main>;
 const locked=sequence.enrollments.length>0;
 return <main className="mx-auto max-w-5xl p-6 space-y-5"><Link className="text-sm underline" href="/sequences">Back to sequences</Link>
  <header className="flex justify-between gap-4"><div><h1 className="text-2xl font-semibold">{sequence.name}</h1><p className="text-sm text-muted-foreground">{sequence.status} · {sequence.enrollments.length} enrollments</p></div><button className={button} disabled={mutation.isPending} onClick={()=>mutation.mutate({path:`/sequences/${id}`,method:'PUT',body:{status:sequence.status==='active'?'paused':'active'}})}>{sequence.status==='active'?'Pause sequence':'Activate sequence'}</button></header>
  <p className="text-sm text-muted-foreground">Each email creates a call task two days later. Replies from the contact’s domain stop the cadence; out-of-office replies pause it. Call outcomes take priority.</p>
  <p className="text-xs text-muted-foreground">Variables: {variables.map(v=>`{{${v}}}`).join(', ')}. Missing discovery values render blank.</p>
  {locked&&<p className="text-sm">Steps are locked after enrollment. Create a new sequence to change the cadence.</p>}
  {sequence.steps.map(s=><StepForm key={`${s.id}:${s.step_number}`} step={s} locked={locked} save={draft=>mutation.mutateAsync({path:`/sequences/${id}/steps/${s.id}`,method:'PUT',body:{stepNumber:draft.step_number,channel:draft.channel,delayDays:draft.delay_days,subject:draft.subject,body:draft.body}})} remove={()=>mutation.mutateAsync({path:`/sequences/${id}/steps/${s.id}`,method:'DELETE'})}/>)}
  {!locked&&<button className={button} disabled={mutation.isPending} onClick={()=>mutation.mutate({path:`/sequences/${id}/steps`,body:{stepNumber:sequence.steps.length+1,channel:'email',delayDays:3,subject:'Quick question for {{company}}',body:'Hi {{firstName}},\n\nHow does {{company}} handle missed calls?\n\nVictory Sync'}})}>Add step</button>}
  <section className="rounded border bg-card p-4 space-y-3"><h2 className="font-semibold">Enroll verified contacts</h2><p className="text-sm text-muted-foreground">Sender selection uses active mailboxes with capacity and a healthy reply inbox. The assigned sender stays fixed for the whole sequence.</p>
   <form className="flex gap-2" onSubmit={async e=>{e.preventDefault();const r=await apiFetch(`/leads?search=${encodeURIComponent(search)}&limit=50`);setContacts(r.leads??[]);setSelected([]);}}><input className={input} required aria-label="Find contacts" placeholder="Search contacts" value={search} onChange={e=>setSearch(e.target.value)}/><button className={button}>Find</button></form>
   {contacts.map(l=><label key={l.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(String(l.id))} onChange={e=>setSelected(e.target.checked?[...selected,String(l.id)]:selected.filter(x=>x!==String(l.id)))}/>{l.email||'No email'} · {l.company}</label>)}
   <button className={button} disabled={!selected.length||mutation.isPending||sequence.status!=='active'} onClick={async()=>{const r=await mutation.mutateAsync({path:`/sequences/${id}/enroll`,body:{leadIds:selected}});setSelected([]);toast({title:`${r.enrolled} contacts enrolled`});}}>Enroll selected contacts</button>
  </section>
  <section className="overflow-auto rounded border bg-card p-4"><h2 className="font-semibold mb-3">Enrollment queue</h2><table className="w-full text-sm text-left"><thead><tr><th>Contact</th><th>Sender</th><th>State</th><th>Step</th><th>Next action</th><th/></tr></thead><tbody>{sequence.enrollments.map(e=><tr key={e.id} className="border-t"><td className="py-3">{e.email}</td><td>{e.mailbox}</td><td>{e.status}<span className="block text-xs text-muted-foreground">{(e.pause_reason??e.stopped_reason??'').replaceAll('_',' ')}</span></td><td>{e.current_step}</td><td>{e.next_send_at?new Date(e.next_send_at).toLocaleString():'—'}</td><td>{['active','paused'].includes(e.status)&&<button className={button} disabled={mutation.isPending} onClick={()=>mutation.mutate({path:`/sequences/enrollments/${e.id}/stop`})}>Stop</button>}</td></tr>)}</tbody></table></section>
 </main>;
}
