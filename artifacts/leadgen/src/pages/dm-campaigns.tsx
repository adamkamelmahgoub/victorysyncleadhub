import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {apiFetch} from '@/lib/api';
import {PageHeader} from '@/components/page-layout';

type Step={day_offset:number;channel:string;step_type:string;template_id:string|null};
type Template={id:string;organization_id:string;name:string;body:string};
type Campaign={id:string;organization_id:string;name:string;status:string;steps:Step[]};
type Data={organizations:Array<{id:string;name:string}>;campaigns:Campaign[];templates:Template[]};
const channels=['instagram','facebook','linkedin','x','tiktok','threads','email','sms','other'];
const types=['follow','engage_post','dm','followup_dm','email','call_task'];
const blank=():Step=>({day_offset:0,channel:'instagram',step_type:'dm',template_id:null});
export default function DmCampaigns(){
  const qc=useQueryClient(),[name,setName]=useState(''),[steps,setSteps]=useState<Step[]>([blank()]);
  const [templateName,setTemplateName]=useState(''),[templateBody,setTemplateBody]=useState(''),[enrollText,setEnrollText]=useState('');
  const [enrollType,setEnrollType]=useState<'lead'|'contact'|'company'>('lead'),[accountId,setAccountId]=useState('');
  const [notice,setNotice]=useState('');
  const query=useQuery<Data>({queryKey:['dm-campaigns'],queryFn:()=>apiFetch('/api/dm-campaigns')});
  const mutation=useMutation({mutationFn:(data:Record<string,unknown>)=>apiFetch('/api/dm-campaigns',{method:'POST',body:JSON.stringify(data)}),
    onSuccess:(value)=>{setNotice(JSON.stringify(value));void qc.invalidateQueries({queryKey:['dm-campaigns']});},onError:(error)=>setNotice(String(error))});
  const selectedOrg=query.data?.organizations[0]?.id||'';
  const templates=query.data?.templates.filter(t=>t.organization_id===selectedOrg)||[];
  const campaigns=query.data?.campaigns.filter(c=>c.organization_id===selectedOrg)||[];
  function changeStep(index:number,change:Partial<Step>){setSteps(current=>current.map((step,i)=>i===index?{...step,...change}:step));}
  return <div className="page-stack"><PageHeader title="DM campaigns" description="Plan manual social actions and permitted email or call follow-ups."/>
    <div className="space-y-5 rounded-xl border bg-card p-4">
      <div className="grid gap-4 md:grid-cols-2"><form className="space-y-2" onSubmit={event=>{event.preventDefault();mutation.mutate({action:'create_template',name:templateName,body:templateBody});setTemplateName('');setTemplateBody('');}}>
        <h2 className="font-semibold">New template</h2><input aria-label="Template name" className="w-full rounded border p-2" placeholder="Template name" value={templateName} onChange={event=>setTemplateName(event.target.value)}/>
        <textarea aria-label="Template text" className="min-h-28 w-full rounded border p-2" placeholder="Hi {{first_name}}, ..." value={templateBody} onChange={event=>setTemplateBody(event.target.value)}/>
        <button className="rounded bg-primary px-3 py-2 text-primary-foreground" disabled={!templateName||!templateBody||mutation.isPending}>Save template</button>
        <p className="text-xs text-muted-foreground">Variables: first_name, company, city, industry, google_rating, review_count. Drafts are never sent automatically.</p>
      </form><div><h2 className="font-semibold">Templates</h2>{templates.map(item=><div key={item.id} className="mt-2 rounded border p-2 text-sm"><strong>{item.name}</strong><p className="whitespace-pre-wrap text-muted-foreground">{item.body}</p></div>)}</div></div>
      <form className="space-y-3 border-t pt-4" onSubmit={event=>{event.preventDefault();mutation.mutate({action:'create_campaign',name,steps});setName('');setSteps([blank()]);}}>
        <h2 className="font-semibold">Build campaign</h2><input aria-label="Campaign name" className="w-full rounded border p-2" placeholder="Campaign name" value={name} onChange={event=>setName(event.target.value)}/>
        {steps.map((step,index)=><div key={index} className="grid gap-2 rounded border p-3 sm:grid-cols-[80px_1fr_1fr_1fr_auto]">
          <label className="text-xs">Day<input aria-label={`Day for step ${index+1}`} className="w-full rounded border p-2" type="number" min={0} max={365} value={step.day_offset} onChange={event=>changeStep(index,{day_offset:Number(event.target.value)})}/></label>
          <label className="text-xs">Channel<select className="w-full rounded border p-2" value={step.channel} onChange={event=>changeStep(index,{channel:event.target.value})}>{channels.map(value=><option key={value}>{value}</option>)}</select></label>
          <label className="text-xs">Action<select className="w-full rounded border p-2" value={step.step_type} onChange={event=>changeStep(index,{step_type:event.target.value})}>{types.map(value=><option key={value}>{value}</option>)}</select></label>
          <label className="text-xs">Template<select className="w-full rounded border p-2" value={step.template_id||''} onChange={event=>changeStep(index,{template_id:event.target.value||null})}><option value="">None</option>{templates.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button type="button" className="self-end rounded border px-2 py-2 text-xs" disabled={steps.length===1} onClick={()=>setSteps(current=>current.filter((_,i)=>i!==index))}>Remove</button>
        </div>)}
        <div className="flex gap-2"><button type="button" className="rounded border px-3 py-2" onClick={()=>setSteps(current=>[...current,blank()])}>Add step</button>
          <button className="rounded bg-primary px-3 py-2 text-primary-foreground" disabled={!name||mutation.isPending}>Create draft</button></div>
      </form>
    </div>
    <div className="space-y-3"><h2 className="text-lg font-semibold">Campaigns</h2>{campaigns.map(c=><div key={c.id} className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3"><strong>{c.name}</strong><span className="rounded bg-muted px-2 text-xs">{c.status}</span><span className="text-xs text-muted-foreground">{c.steps.length} steps</span>
        {c.status!=='archived'&&<button className="ml-auto rounded border px-2 py-1 text-sm" onClick={()=>mutation.mutate({action:'status',campaign_id:c.id,status:c.status==='active'?'paused':'active'})}>{c.status==='active'?'Pause':'Activate'}</button>}</div>
      <p className="text-xs text-muted-foreground">{c.steps.map(s=>`Day ${s.day_offset}: ${s.channel} ${s.step_type}`).join(' → ')}</p>
      {c.status==='active'&&<form className="flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();mutation.mutate({action:'enroll',campaign_id:c.id,entity_type:enrollType,
        entity_ids:enrollText.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean),connected_account_id:accountId||null});}}>
        <select aria-label="Record type" className="rounded border p-2" value={enrollType} onChange={event=>setEnrollType(event.target.value as typeof enrollType)}>{['lead','contact','company'].map(value=><option key={value}>{value}</option>)}</select>
        <input aria-label="Record IDs" className="min-w-52 flex-1 rounded border p-2" placeholder="Record UUIDs, separated by commas" value={enrollText} onChange={event=>setEnrollText(event.target.value)}/>
        <input aria-label="Connected account ID" className="min-w-44 rounded border p-2" placeholder="Account UUID (optional)" value={accountId} onChange={event=>setAccountId(event.target.value)}/>
        <button className="rounded bg-primary px-3 py-2 text-primary-foreground" disabled={!enrollText||mutation.isPending}>Enroll</button>
      </form>}</div>)}</div>
    {notice&&<p role="status" className="rounded border p-3 text-sm">{notice}</p>}
  </div>;
}
