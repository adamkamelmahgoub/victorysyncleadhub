import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowDown, ArrowUp, Plus, Save, Sparkles, Download, ExternalLink, CheckCircle2, Circle, Undo2, Redo2, Eye, EyeOff, Copy, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { canAccessPath } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {SectionType} from '../../../../lib/landing-section-registry';

type Page = {id:string;name:string;slug:string;public_slug?:string|null;status:'draft'|'published';seo_description:string;
  sections:Section[];theme:Theme;created_at:string};
type Section = {id:string;type:SectionType;heading?:string;body?:string;eyebrow?:string;imageAlt?:string;
  quote?:string;author?:string;buttonText?:string;buttonUrl?:string;imageUrl?:string;formId?:string;
  items?:string[];hidden?:boolean;blocks?:Array<{id:string;type:string;heading?:string;body?:string;
    imageUrl?:string;hidden?:boolean;attested?:boolean}>};
type Theme = {background:string;foreground:string;accent:string;font:'sans'|'serif'};
type Account = {id:string;name:string;health_score:number;leads_this_week:number;overdue_tasks:number;failed_payments:number|null;last_active_at:string|null};
type ClosedCompany = {id:string;name:string;email:string|null;contact_name:string|null};
type Accounts = {accounts:Account[];selected:{accountId:string|null;viewAsClient:boolean}|null};
type AgencyAccount = {id:string;name:string;package:string|null;launch_date:string|null;health_score:number;
  mrr_cents:number|null;account_manager:string;leads_month:number;goal_value:number|null;overdue_tasks:number;
  failed_payments:number|null;last_active_at:string|null;response_seconds:number|null;answered_minutes:number;
  answering_hours_limit:number;texts_sent:number;ai_tokens:number};
type FailedRun = {id:string;account_name:string;step:string;error:string|null;started_at:string;kind:string|null;attempts:number|null};
type Feature = {feature_key:string;user_id:string|null;enabled:boolean};
type ProviderReadiness = {sandbox:boolean;stripe:boolean;mightycall:boolean;invites:boolean;reports:boolean;
  slack:boolean;portalUrl:boolean;publicPagesUrl:boolean;worker:boolean};
type Snapshot = {accountId:string;readOnly:boolean;data:unknown};
type Lead = {id:string;first_name:string;last_name:string;company:string;phone:string;email:string;pipeline_stage_id:string|null;notes:string|null;created_at:string};
const pages = ['launchpad','dashboard','leads','calls','pages','forms','reviews','reports','billing','settings'] as const;
type PortalPage = typeof pages[number];
const themeDefault:Theme = {background:'#ffffff',foreground:'#172033',accent:'#285ce6',font:'sans'};
const sections:Section['type'][] = ['hero','text','features','image','cta','form'];
const BASE = import.meta.env.BASE_URL.replace(/\/$/,'');

function nice(value:string) { return value.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/\b\w/g,c => c.toUpperCase()); }
type LaunchpadStep = {key:string;label:string;done:boolean;path:string};
function Launchpad({accountId,role,pagePermissions}:{accountId:string|null;role:string;pagePermissions:string[]|null}) {
  const {data,error,isLoading}=useQuery<{accountName:string;steps:LaunchpadStep[]}>({queryKey:['portal-launchpad',accountId],
    queryFn:()=>apiFetch('/api/portal?action=launchpad'),enabled:!!accountId,retry:false});
  if(!accountId)return <Card className="p-6">Select a client account to view the setup checklist.</Card>;
  if(isLoading)return <Card className="p-6">Loading setup checklist...</Card>;
  if(error)return <Card role="alert" className="p-6 text-red-600">{String(error)}</Card>;
  const steps=data?.steps||[];
  const completed=steps.filter(step=>step.done).length;
  return <div className="space-y-5"><Card className="p-5 sm:p-7"><h2 className="text-xl font-semibold">Set up {data?.accountName||'your account'}</h2>
    <p className="mt-2 text-sm text-muted-foreground">Complete the essentials before your next campaign goes live.</p>
    <div className="mt-5 flex items-center justify-between text-sm"><span>{completed} of {steps.length} complete</span><span>{steps.length?Math.round(completed/steps.length*100):0}%</span></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{width:`${steps.length?completed/steps.length*100:0}%`}}/></div></Card>
    <div className="grid gap-3 sm:grid-cols-2">{steps.map(step=><Card key={step.key} className="flex items-center gap-4 p-4 sm:p-5">
      {step.done?<CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600"/>:<Circle className="h-6 w-6 shrink-0 text-slate-400"/>}
      <div className="min-w-0 flex-1"><h3 className="font-medium">{step.label}</h3><p className="mt-1 text-xs text-muted-foreground">{step.done?'Complete':'Needs attention'}</p></div>
      {canAccessPath(step.path,pagePermissions,role)?<Link href={step.path} className="shrink-0 text-sm font-medium text-blue-600 hover:underline">Open</Link>:<span className="shrink-0 text-xs text-muted-foreground">Ask your account owner</span>}
    </Card>)}</div></div>;
}
function show(value:unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function DataTable({rows}:{rows:Record<string,unknown>[]}) {
  if (!rows.length) return <Card className="p-8 text-center text-muted-foreground">No records yet.</Card>;
  const columns = Object.keys(rows[0]).filter(key => !['sections','theme','data'].includes(key)).slice(0,9);
  return <div role="region" aria-label="Records table" tabIndex={0} className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm">
    <thead className="bg-slate-50"><tr>{columns.map(key=><th key={key} className="whitespace-nowrap px-4 py-3">{nice(key)}</th>)}</tr></thead>
    <tbody>{rows.map((row,index)=><tr key={String(row.id ?? index)} className="border-t">{columns.map(key=><td key={key} className="max-w-64 truncate px-4 py-3" title={show(row[key])}>{show(row[key])}</td>)}</tr>)}</tbody>
  </table></div>;
}
function ProviderReadinessPanel() {
  const {data,error,isPending,refetch}=useQuery<ProviderReadiness>({queryKey:['portal-provider-readiness'],
    queryFn:()=>apiFetch('/api/portal?action=provider_readiness'),retry:false});
  const entries: Array<[keyof Omit<ProviderReadiness,'sandbox'>,string]> = [
    ['stripe','Stripe billing'],['mightycall','MightyCall calls and texts'],
    ['invites','Client invite email'],['reports','Report email'],['slack','Slack alerts'],
    ['portalUrl','Portal URL'],['publicPagesUrl','Public pages URL'],['worker','Delivery worker']];
  return <Card className="space-y-4 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div>
    <h2 className="font-semibold">Delivery setup</h2><p className="mt-1 text-sm text-muted-foreground">Production configuration status. Secret values are never shown.</p>
  </div><Button size="sm" variant="outline" onClick={()=>void refetch()}>Refresh</Button></div>
    {isPending?<p className="text-sm text-muted-foreground">Checking configuration…</p>:error?<p role="alert" className="text-sm text-red-600">Could not check delivery setup: {String(error)}</p>:data&&<>
      <p className={`rounded-lg px-3 py-2 text-sm ${data.sandbox?'bg-amber-50 text-amber-900':'bg-green-50 text-green-800'}`}>
        {data.sandbox?'Sandbox mode is on. Automatic external sends are paused.':'Sandbox mode is off. Automatic external sends can run.'}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{entries.map(([key,label])=><div key={key} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span>{label}</span><span className={data[key]?'text-green-700':'text-amber-700'}>{data[key]?'Configured':'Needs setup'}</span></div>)}</div>
    </>}
  </Card>;
}
function AgencyOperations({admin,onOpen,onViewAs}:{admin:boolean;onOpen:(id:string)=>void;onViewAs:(id:string)=>void}) {
  const queryClient=useQueryClient();
  const [mrr,setMrr]=useState<Record<string,string>>({});
  const {data:accounts,error}=useQuery<AgencyAccount[]>({queryKey:['portal-agency-overview'],
    queryFn:()=>apiFetch('/api/portal?action=agency_overview'),retry:false});
  const {data:failures}=useQuery<FailedRun[]>({queryKey:['portal-failed-automations'],
    queryFn:()=>apiFetch('/api/portal?action=failed_automations'),retry:false});
  const action=useMutation({mutationFn:(body:Record<string,unknown>)=>apiFetch('/api/portal',
    {method:'POST',body:JSON.stringify(body)}),onSuccess:()=>{
      void queryClient.invalidateQueries({queryKey:['portal-agency-overview']});
      void queryClient.invalidateQueries({queryKey:['portal-failed-automations']});
    }});
  if(error) return <Card role="alert" className="p-5 text-sm text-red-600">{String(error)}</Card>;
  return <div className="space-y-5">
    {admin&&<ProviderReadinessPanel/>}
    <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Accounts overview</h2><p className="mt-1 text-sm text-muted-foreground">{admin?'Health, revenue, usage, and account ownership.':'Health, usage, and account ownership.'}</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Account','Package and launch','Health',...(admin?['MRR']:[]),'Leads / goal','Answering','Texts / AI','Account manager','Actions'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead>
      <tbody>{(accounts||[]).map(a=><tr key={a.id} className="border-t align-top"><td className="px-4 py-4"><p className="font-medium">{a.name}</p><p className="mt-1 text-xs text-muted-foreground">{a.overdue_tasks} overdue tasks{admin&&<> · {a.failed_payments} failed payments</>}</p><p className="text-xs text-muted-foreground">Last login: {a.last_active_at?new Date(a.last_active_at).toLocaleDateString():'Never'}</p></td>
        <td className="px-4 py-4">{nice(a.package||'starter')}<p className="text-xs text-muted-foreground">{a.launch_date||'Launch not set'}</p></td>
        <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${a.health_score>=75?'bg-green-100 text-green-700':a.health_score>=50?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{a.health_score}/100</span><p className="mt-2 text-xs text-muted-foreground">Response: {a.response_seconds===null?'No data':`${a.response_seconds}s`}</p></td>
        {admin&&<td className="px-4 py-4">${((a.mrr_cents??0)/100).toFixed(2)}<div className="mt-2 flex gap-1"><Input aria-label={`MRR for ${a.name}`} className="h-8 w-20" type="number" min="0" step="0.01" value={mrr[a.id]??String((a.mrr_cents??0)/100)} onChange={e=>setMrr(old=>({...old,[a.id]:e.target.value}))}/><Button size="sm" variant="outline" disabled={action.isPending} onClick={()=>action.mutate({action:'set_account_mrr',accountId:a.id,mrrCents:Math.round(Number(mrr[a.id]??(a.mrr_cents??0)/100)*100)})}>Save</Button></div></td>}
        <td className="px-4 py-4">{a.leads_month} / {a.goal_value??'No goal'}</td><td className="px-4 py-4">{(a.answered_minutes/60).toFixed(1)} / {a.answering_hours_limit||'No limit'} hours</td><td className="px-4 py-4">{a.texts_sent} texts<p className="text-xs text-muted-foreground">{a.ai_tokens} tokens</p></td><td className="px-4 py-4">{a.account_manager}</td>
        <td className="space-y-1 px-4 py-4"><Button size="sm" onClick={()=>onOpen(a.id)}>Open</Button>{admin&&<><Button size="sm" variant="outline" onClick={()=>onViewAs(a.id)}>View as client</Button><Button size="sm" variant="outline" disabled={action.isPending} onClick={()=>action.mutate({action:'apply_template',accountId:a.id,template:a.package||'starter'})}>Apply template</Button></>}</td></tr>)}</tbody></table></div>
      {!accounts?.length&&<p className="p-5 text-sm text-muted-foreground">No assigned accounts yet.</p>}</Card>
    <Card className="p-5"><h2 className="font-semibold">Failed automations</h2><p className="mt-1 text-sm text-muted-foreground">Retry a failed job after correcting its cause.</p>
      {failures?.length?<div className="mt-4 space-y-2">{failures.map(run=><div key={run.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><p className="font-medium">{run.account_name} · {nice(run.kind||run.step)}</p><p className="text-xs text-red-700">{run.error||'No error details'} · {run.attempts??0} attempts</p></div><Button size="sm" variant="outline" disabled={action.isPending} onClick={()=>action.mutate({action:'retry_automation',runId:run.id})}>Retry</Button></div>)}</div>:<p className="mt-4 text-sm text-muted-foreground">No failed automations.</p>}
      {action.error&&<p role="alert" className="mt-3 text-sm text-red-600">{String(action.error)}</p>}{action.isSuccess&&<p className="mt-3 text-sm text-green-700">Saved.</p>}</Card>
  </div>;
}
type Metrics = {account:{name:string;goal_metric:string|null;goal_value:number|null};newLeads:number;bookedJobs:number;
  answeredCalls:number;missedCallsRecovered:number;reviewsReceived:number;averageRating:number|null;
  adSpendCents:number;sourceBreakdown:Record<string,number>};
function Dashboard({canManageSpend}:{canManageSpend:boolean}) {
  const [range,setRange]=useState('this_week');
  const [customFrom,setCustomFrom]=useState('');
  const [customTo,setCustomTo]=useState('');
  const now=new Date();const start=new Date(now);const end=new Date(now);
  if(range==='this_week'){start.setDate(now.getDate()-((now.getDay()+6)%7));start.setHours(0,0,0,0);end.setDate(start.getDate()+7);end.setHours(0,0,0,0)}
  else if(range==='this_month'){start.setDate(1);start.setHours(0,0,0,0);end.setMonth(start.getMonth()+1,1);end.setHours(0,0,0,0)}
  else if(range==='last_month'){start.setMonth(now.getMonth()-1,1);start.setHours(0,0,0,0);end.setDate(1);end.setHours(0,0,0,0)}
  else {start.setTime(customFrom?new Date(`${customFrom}T00:00:00`).getTime():NaN);end.setTime(customTo?new Date(`${customTo}T00:00:00`).getTime():NaN);if(!Number.isNaN(end.getTime()))end.setDate(end.getDate()+1)}
  const valid=!Number.isNaN(start.getTime())&&!Number.isNaN(end.getTime())&&start<end;
  const from=valid?start.toISOString():'';const to=valid?end.toISOString():'';
  const {data,error,isLoading}=useQuery<Metrics>({queryKey:['portal-metrics',from,to],
    queryFn:()=>apiFetch(`/api/portal?action=metrics&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),enabled:valid,retry:false});
  const {data:spend}=useQuery<Array<{platform:string;month:string;amount_cents:number}>>({queryKey:['portal-ad-spend'],
    queryFn:()=>apiFetch('/api/portal?action=ad_spend'),enabled:canManageSpend,retry:false});
  const [platform,setPlatform]=useState('google_ads');const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [amount,setAmount]=useState('');const queryClient=useQueryClient();
  const saveSpend=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'set_ad_spend',platform,month:`${month}-01`,amountCents:Math.round(Number(amount)*100)})}),
    onSuccess:()=>{void queryClient.invalidateQueries({queryKey:['portal-metrics']});void queryClient.invalidateQueries({queryKey:['portal-ad-spend']});setAmount('')}});
  const values=data?{newLeads:data.newLeads,bookedJobs:data.bookedJobs,answeredCalls:data.answeredCalls,
    missedCallsRecovered:data.missedCallsRecovered,reviewsReceived:data.reviewsReceived,averageRating:data.averageRating,
    costPerLead:data.newLeads&&data.adSpendCents?`$${(data.adSpendCents/100/data.newLeads).toFixed(2)}`:'No ad spend'}:null;
  const goalKey:Record<string,keyof Metrics>={new_leads:'newLeads',booked_jobs:'bookedJobs',answered_calls:'answeredCalls',missed_calls_recovered:'missedCallsRecovered',reviews_received:'reviewsReceived'};
  const goalMetric=data?.account.goal_metric||'';
  const goal=data?.account.goal_value?Number(data[(goalKey[goalMetric]||goalMetric) as keyof Metrics]||0):0;
  return <div className="space-y-5"><div className="flex flex-wrap gap-2"><select aria-label="Dashboard date range" className="rounded border bg-white px-3 py-2 text-sm" value={range} onChange={event=>setRange(event.target.value)}>
    <option value="this_week">This week</option><option value="this_month">This month</option><option value="last_month">Last month</option><option value="custom">Custom</option></select>
    {range==='custom'&&<><input aria-label="Start date" type="date" className="rounded border px-2" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/><input aria-label="End date" type="date" className="rounded border px-2" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></>}</div>
    {isLoading?<p>Loading dashboard...</p>:error?<p role="alert" className="text-red-600">{String(error)}</p>:values&&<><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(values).map(([key,value])=><Card key={key} className="p-4"><p className="text-xs text-muted-foreground">{nice(key)}</p><p className="mt-2 text-2xl font-semibold">{value??'-'}</p></Card>)}</div>
      {data?.account.goal_metric&&data.account.goal_value&&<Card className="p-4"><p className="text-sm">{nice(data.account.goal_metric)} goal: {goal} of {data.account.goal_value}</p><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{width:`${Math.min(100,goal/data.account.goal_value*100)}%`}}/></div></Card>}
      <Card className="p-4"><h2 className="font-semibold">Lead sources</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(data?.sourceBreakdown||{}).map(([source,count])=><p key={source} className="text-sm">{nice(source)}: {count}</p>)}</div></Card></>}
    {canManageSpend&&<Card className="space-y-3 p-4"><h2 className="font-semibold">Monthly ad spend</h2><div className="flex flex-wrap gap-2"><select aria-label="Ad platform" className="rounded border px-2" value={platform} onChange={e=>setPlatform(e.target.value)}>{['google_ads','meta_ads','local_services','other'].map(x=><option key={x} value={x}>{nice(x)}</option>)}</select><input aria-label="Spend month" type="month" className="rounded border px-2" value={month} onChange={e=>setMonth(e.target.value)}/><Input aria-label="Spend in dollars" type="number" min="0" step="0.01" className="w-36" placeholder="USD" value={amount} onChange={e=>setAmount(e.target.value)}/><Button disabled={!amount||saveSpend.isPending} onClick={()=>saveSpend.mutate()}>Save spend</Button></div>{saveSpend.error&&<p role="alert" className="text-red-600">{String(saveSpend.error)}</p>}<p className="text-xs text-muted-foreground">{spend?.slice(0,4).map(x=>`${nice(x.platform)} ${x.month}: $${(x.amount_cents/100).toFixed(2)}`).join(' · ')}</p></Card>}
  </div>;
}
type LeadPage = {rows:Lead[];stages:{id:string;name:string}[];nextCursor?:{createdAt:string;id:string}|null};
type TimelineEvent={event_type:string;body:string|null;metadata:Record<string,unknown>|null;created_at:string};
function LeadTimelineEvent({event}:{event:TimelineEvent}){
  const meta=event.metadata??{};
  const fields=event.event_type==='form'&&meta.data&&typeof meta.data==='object'&&!Array.isArray(meta.data)
    ?Object.entries(meta.data as Record<string,unknown>).filter(([,value])=>
      ['string','number','boolean'].includes(typeof value)&&String(value).trim()).slice(0,20):[];
  const details=[event.event_type==='text'&&typeof meta.direction==='string'?nice(meta.direction):null,
    event.event_type==='call'&&typeof meta.outcome==='string'?nice(meta.outcome):null,
    event.event_type==='call'&&typeof meta.duration_seconds==='number'?`${meta.duration_seconds}s`:null,
    event.event_type==='email'&&typeof meta.subject==='string'?meta.subject:null].filter(Boolean);
  return <div className="min-w-0 border-t py-3 text-sm"><p className="font-medium">{nice(event.event_type)} <span className="font-normal text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span></p>
    {details.length>0&&<p className="mt-1 text-xs text-muted-foreground">{details.join(' · ')}</p>}
    {event.body&&<p className="mt-1 whitespace-pre-wrap break-words">{event.body}</p>}
    {fields.length>0&&<dl className="mt-2 grid gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">{fields.map(([key,value])=><div key={key} className="min-w-0"><dt className="text-xs text-muted-foreground">{nice(key)}</dt><dd className="break-words">{String(value)}</dd></div>)}</dl>}
    {typeof meta.recording_url==='string'&&<audio controls src={meta.recording_url} className="mt-2 w-full"/>}
  </div>;
}
function LeadTable({data,readOnly}:{data:LeadPage;readOnly:boolean}) {
  const queryClient = useQueryClient();
  const [olderRows,setOlderRows]=useState<Lead[]>([]);
  const [nextCursor,setNextCursor]=useState(data.nextCursor??null);
  useEffect(()=>{setOlderRows([]);setNextCursor(data.nextCursor??null)},[data]);
  const loadOlder=useMutation({mutationFn:async(cursor:{createdAt:string;id:string})=>
    apiFetch(`/api/portal?action=lead_page&beforeAt=${encodeURIComponent(cursor.createdAt)}&beforeId=${encodeURIComponent(cursor.id)}`) as Promise<LeadPage>,
    onSuccess:page=>{setOlderRows(current=>{const seen=new Set([...data.rows,...current].map(row=>row.id));
      return [...current,...page.rows.filter(row=>!seen.has(row.id))]});setNextCursor(page.nextCursor??null)}});
  const allRows=[...data.rows,...olderRows.filter(row=>!data.rows.some(first=>first.id===row.id))];
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [view,setView]=useState<'list'|'board'>('list');
  const [selected,setSelected]=useState<string|null>(null);
  const [jobValue,setJobValue]=useState('');
  const change = useMutation({mutationFn:(value:{leadId:string;stageId?:string|null;notes?:string}) =>
    apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'change_lead',...value})}),
    onSuccess:() => queryClient.invalidateQueries({queryKey:['portal','leads']})});
  const valueChange=useMutation({mutationFn:(leadId:string)=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'set_job_value',leadId,value:Number(jobValue)})}),
    onSuccess:()=>{setJobValue('');void queryClient.invalidateQueries({queryKey:['portal-lead-timeline']})}});
  const {data:timeline,error:timelineError,isLoading:timelineLoading}=useQuery<{lead:Lead;events:TimelineEvent[]}>({
    queryKey:['portal-lead-timeline',selected],queryFn:()=>apiFetch(`/api/portal?action=lead_timeline&leadId=${selected}`),enabled:!!selected,retry:false});
  if (!allRows.length) return <Card className="p-8 text-center text-muted-foreground">No client leads yet.</Card>;
  const leadCard=(lead:Lead)=><Card key={lead.id} className="min-w-0 space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{lead.first_name} {lead.last_name}</h3>
      <p className="text-sm text-muted-foreground">{[lead.company,lead.phone,lead.email].filter(Boolean).join(' · ')}</p></div>
      <select aria-label={`Stage for ${lead.first_name} ${lead.last_name}`} value={lead.pipeline_stage_id ?? ''}
        disabled={readOnly || change.isPending} onChange={event => change.mutate({leadId:lead.id,stageId:event.target.value || null})}
        className="rounded border px-2 py-1 text-sm"><option value="">No stage</option>{data.stages.map(stage=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></div>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setSelected(lead.id)}>Timeline</Button>{lead.phone&&<><a href={`tel:${lead.phone}`} className="rounded border px-3 py-1 text-sm">Call</a><a href={`sms:${lead.phone}`} className="rounded border px-3 py-1 text-sm">Text</a></>}</div>
    <div className="flex gap-2"><Input aria-label={`Notes for ${lead.first_name} ${lead.last_name}`} value={notes[lead.id] ?? lead.notes ?? ''}
      onChange={event=>setNotes(current=>({...current,[lead.id]:event.target.value}))} disabled={readOnly}/>
      <Button disabled={readOnly || change.isPending || notes[lead.id] === undefined} onClick={()=>change.mutate({leadId:lead.id,notes:notes[lead.id]})}>Save note</Button></div>
  </Card>;
  return <div className="space-y-4"><div className="flex gap-2"><Button size="sm" variant={view==='list'?'default':'outline'} onClick={()=>setView('list')}>List</Button><Button size="sm" variant={view==='board'?'default':'outline'} onClick={()=>setView('board')}>Pipeline board</Button></div>
    {view==='list'?<div className="space-y-3">{allRows.map(leadCard)}</div>:<div className="flex gap-3 overflow-x-auto pb-3">{[{id:'',name:'No stage'},...data.stages].map(stage=><div key={stage.id||'unassigned'} className="w-72 shrink-0 space-y-3"><h3 className="rounded bg-slate-100 p-2 text-sm font-semibold">{stage.name}</h3>{allRows.filter(lead=>(lead.pipeline_stage_id||'')===stage.id).map(leadCard)}</div>)}</div>}
    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700"><span>{allRows.length} leads shown</span>{nextCursor&&<Button size="sm" variant="outline" disabled={loadOlder.isPending} onClick={()=>loadOlder.mutate(nextCursor)}>{loadOlder.isPending?'Loading...':'Load older leads'}</Button>}</div>
    {loadOlder.error&&<p role="alert" className="text-red-600">Could not load older leads: {String(loadOlder.error)}</p>}
    {selected&&<Card className="space-y-3 p-4"><div className="flex justify-between"><h3 className="font-semibold">Lead timeline</h3><Button size="sm" variant="outline" onClick={()=>setSelected(null)}>Close</Button></div>
      <div className="flex flex-wrap gap-2"><Input aria-label="Job value" type="number" min="0" className="w-36" placeholder="Job value" value={jobValue} onChange={e=>setJobValue(e.target.value)}/><Button disabled={readOnly||!jobValue||valueChange.isPending} onClick={()=>valueChange.mutate(selected)}>Save job value</Button></div>
      {timelineLoading&&<p className="text-sm text-muted-foreground">Loading timeline...</p>}
      {timelineError&&<p role="alert" className="text-sm text-red-600">Could not load timeline: {String(timelineError)}</p>}
      {timeline&&!timeline.events.length&&<p className="text-sm text-muted-foreground">No activity yet.</p>}
      {timeline?.events.map((event,index)=><LeadTimelineEvent key={`${event.created_at}-${event.event_type}-${index}`} event={event}/>)}</Card>}
    {change.error&&<p role="alert" className="text-red-600">{String(change.error)}</p>}
  </div>;
}
type CallRow={id:string;occurred_at:string;caller_number:string|null;status:string|null;duration_seconds:number|null;
  outcome:string|null;summary:string|null;recording_url:string|null;agent_name:string|null;booked:boolean};
function CallLog({canEdit,admin}:{canEdit:boolean;admin:boolean}) {
  const [from,setFrom]=useState(new Date(Date.now()-30*86400_000).toISOString().slice(0,10));
  const [to,setTo]=useState(new Date().toISOString().slice(0,10));
  const [outcome,setOutcome]=useState('');const [editing,setEditing]=useState<string|null>(null);
  const [summary,setSummary]=useState('');const [selectedOutcome,setSelectedOutcome]=useState('message_taken');
  const queryClient=useQueryClient();
  const {data:usage}=useQuery<{minutesUsed:number;minutesIncluded:number;agentHours:number}>({queryKey:['portal-usage'],queryFn:()=>apiFetch('/api/portal?action=usage'),retry:false});
  const [limit,setLimit]=useState('');
  const saveLimit=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'set_usage_limit',minutes:Number(limit)})}),onSuccess:()=>void queryClient.invalidateQueries({queryKey:['portal-usage']})});
  const fromDate=new Date(`${from}T00:00:00`);
  const toDate=new Date(`${to}T00:00:00`);
  const validDates=!!from&&!!to&&Number.isFinite(fromDate.getTime())&&Number.isFinite(toDate.getTime())&&fromDate<=toDate;
  const fromTime=validDates?fromDate.toISOString():'';
  const toTime=validDates?new Date(toDate.getTime()+86400_000).toISOString():'';
  const callQuery=`from=${encodeURIComponent(fromTime)}&to=${encodeURIComponent(toTime)}${outcome?`&outcome=${outcome}`:''}`;
  const {data,error}=useQuery<CallRow[]>({queryKey:['portal-call-log',from,to,outcome],queryFn:()=>apiFetch(`/api/portal?action=calls&${callQuery}`),enabled:validDates,retry:false});
  const [olderCalls,setOlderCalls]=useState<CallRow[]>([]);
  const [lastPageSize,setLastPageSize]=useState(0);
  useEffect(()=>{setOlderCalls([]);setLastPageSize(data?.length??0)},[data]);
  const allCalls=[...(data??[]),...olderCalls.filter(call=>!data?.some(first=>first.id===call.id))];
  const loadOlderCalls=useMutation({mutationFn:async(cursor:CallRow)=>apiFetch(
    `/api/portal?action=call_page&${callQuery}&beforeAt=${encodeURIComponent(cursor.occurred_at)}&beforeId=${encodeURIComponent(cursor.id)}`) as Promise<CallRow[]>,
    onSuccess:rows=>{setOlderCalls(current=>{const seen=new Set([...data??[],...current].map(call=>call.id));
      return [...current,...rows.filter(call=>!seen.has(call.id))]});setLastPageSize(rows.length)}});
  const save=useMutation({mutationFn:(callId:string)=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'update_call',callId,outcome:selectedOutcome,summary,booked:selectedOutcome==='booked'})}),onSuccess:()=>{setEditing(null);void queryClient.invalidateQueries({queryKey:['portal-call-log']})}});
  return <div className="space-y-4"><Card className="space-y-2 p-4"><h2 className="font-semibold">Call usage this month</h2><p className="text-sm">{usage?.minutesUsed??0} answered minutes · {usage?.agentHours??0} agent hours {usage?.minutesIncluded?`of ${usage.minutesIncluded} included minutes`:''}</p>{!!usage?.minutesIncluded&&<div className="h-2 rounded bg-slate-200"><div className="h-full rounded bg-blue-600" style={{width:`${Math.min(100,usage.minutesUsed/usage.minutesIncluded*100)}%`}}/></div>}{admin&&<div className="flex gap-2"><Input aria-label="Included minutes" type="number" min="0" className="w-40" placeholder="Included minutes" value={limit} onChange={e=>setLimit(e.target.value)}/><Button disabled={!limit||saveLimit.isPending} onClick={()=>saveLimit.mutate()}>Set limit</Button></div>}</Card><div className="flex flex-wrap gap-2"><input aria-label="Calls from" type="date" className="rounded border px-2 py-1" value={from} onChange={e=>setFrom(e.target.value)}/><input aria-label="Calls through" type="date" className="rounded border px-2 py-1" value={to} onChange={e=>setTo(e.target.value)}/><select aria-label="Call outcome" className="rounded border px-2 py-1" value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">All outcomes</option>{['booked','message_taken','spam','existing_customer','other'].map(x=><option key={x} value={x}>{nice(x)}</option>)}</select></div>
    {!validDates&&<p role="alert" className="text-red-600">Choose a valid start and end date.</p>}{error&&<p role="alert" className="text-red-600">{String(error)}</p>}{validDates&&!data?.length&&!error&&<Card className="p-6">No calls in this range.</Card>}
    {allCalls.map(call=><Card key={call.id} className="space-y-2 p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{call.caller_number||'Unknown caller'}</p><p className="text-xs text-muted-foreground">{new Date(call.occurred_at).toLocaleString()} · {nice(call.status||'unknown')} · {call.duration_seconds??0}s</p></div><p className="text-sm">{nice(call.outcome||'unclassified')}{call.booked?' · Booked':''}</p></div>
      {call.summary&&<p className="text-sm">{call.summary}</p>}{call.recording_url&&<audio controls src={call.recording_url} className="w-full"/>}{canEdit&&<Button size="sm" variant="outline" onClick={()=>{setEditing(call.id);setSummary(call.summary||'');setSelectedOutcome(call.outcome||'message_taken')}}>Add outcome</Button>}
      {editing===call.id&&<div className="space-y-2"><select aria-label="Agent outcome" className="rounded border p-2" value={selectedOutcome} onChange={e=>setSelectedOutcome(e.target.value)}>{['booked','message_taken','spam','existing_customer','other'].map(x=><option key={x} value={x}>{nice(x)}</option>)}</select><Textarea aria-label="Call summary" value={summary} onChange={e=>setSummary(e.target.value)}/><Button disabled={save.isPending} onClick={()=>save.mutate(call.id)}>Save call</Button></div>}
    </Card>)}{lastPageSize===200&&allCalls.length>0&&<Button variant="outline" disabled={loadOlderCalls.isPending} onClick={()=>loadOlderCalls.mutate(allCalls[allCalls.length-1])}>{loadOlderCalls.isPending?'Loading...':'Load older calls'}</Button>}{loadOlderCalls.error&&<p role="alert" className="text-red-600">Could not load older calls: {String(loadOlderCalls.error)}</p>}{save.error&&<p role="alert" className="text-red-600">{String(save.error)}</p>}</div>;
}
function ReviewRequestForm() {
  const [name,setName]=useState('');const [phone,setPhone]=useState('');const [leadId,setLeadId]=useState<string|null>(null);const queryClient=useQueryClient();
  const [leadSearch,setLeadSearch]=useState('');
  const {data:wonLeads=[]}=useQuery<Pick<Lead,'id'|'first_name'|'last_name'|'phone'>[]>({
    queryKey:['portal-won-leads',leadSearch],
    queryFn:()=>apiFetch(`/api/portal?action=won_leads&query=${encodeURIComponent(leadSearch)}`),retry:false});
  const request=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'request_review',name,phone,leadId})}),onSuccess:()=>{setName('');setPhone('');setLeadId(null);void queryClient.invalidateQueries({queryKey:['portal','reviews']});void queryClient.invalidateQueries({queryKey:['portal-review-summary']});void queryClient.invalidateQueries({queryKey:['portal-review-list']})}});
  return <Card className="space-y-3 p-4"><h2 className="font-semibold">Request a review</h2><p className="text-xs text-muted-foreground">Choose a customer who submitted a form or called your business.</p><Input aria-label="Search Won leads" placeholder="Search Won customers" value={leadSearch} maxLength={100} onChange={event=>setLeadSearch(event.target.value)}/><select aria-label="Won lead" className="w-full rounded border p-2 text-sm" value={leadId||''} onChange={e=>{const id=e.target.value;setLeadId(id||null);const lead=wonLeads.find(x=>x.id===id);if(lead){setName(`${lead.first_name} ${lead.last_name}`.trim());setPhone(lead.phone||'')}}}><option value="">Enter customer details or pick a Won lead</option>{wonLeads.map(lead=><option key={lead.id} value={lead.id}>{lead.first_name} {lead.last_name}</option>)}</select><div className="flex flex-wrap gap-2"><Input aria-label="Customer name" className="min-w-40 flex-1" placeholder="Customer name" value={name} onChange={e=>setName(e.target.value)}/><Input aria-label="Customer phone" className="min-w-40 flex-1" placeholder="+1..." value={phone} onChange={e=>setPhone(e.target.value)}/><Button disabled={!name||!/^\+1\d{10}$/.test(phone)||request.isPending} onClick={()=>request.mutate()}>Request review</Button></div>{request.error&&<p role="alert" className="text-red-600">{String(request.error)}</p>}{request.isSuccess&&<p className="text-green-700">Review request scheduled.</p>}</Card>;
}
type ReviewSummary={requestsSent:number;requestsClicked:number;reviewsReceived:number;averageRating:number|null;
  trend:Array<{month:string;rating:number;count:number}>};
type ReviewPage={rows:Record<string,unknown>[];nextCursor:{at:string;id:string}|null};
function ReviewList({kind,accountId}:{kind:'reviews'|'requests';accountId:string|null}) {
  const {data,error}=useQuery<ReviewPage>({queryKey:['portal-review-list',accountId,kind],
    queryFn:()=>apiFetch(`/api/portal?action=review_page&kind=${kind}`),enabled:!!accountId,retry:false});
  const [older,setOlder]=useState<Record<string,unknown>[]>([]);
  const [cursor,setCursor]=useState<ReviewPage['nextCursor']>(null);
  useEffect(()=>{setOlder([]);setCursor(data?.nextCursor??null)},[data]);
  const loadOlder=useMutation({mutationFn:async(value:{at:string;id:string})=>apiFetch(
    `/api/portal?action=review_page&kind=${kind}&beforeAt=${encodeURIComponent(value.at)}&beforeId=${encodeURIComponent(value.id)}`) as Promise<ReviewPage>,
    onSuccess:page=>{setOlder(current=>{const seen=new Set([...(data?.rows??[]),...current].map(row=>String(row.id)));
      return [...current,...page.rows.filter(row=>!seen.has(String(row.id)))]});setCursor(page.nextCursor)}});
  const rows=[...(data?.rows??[]),...older.filter(row=>!data?.rows.some(first=>first.id===row.id))];
  return <section className="space-y-3"><h2 className="font-semibold">{nice(kind)}</h2>{error&&<p role="alert" className="text-red-600">Could not load {kind}: {String(error)}</p>}
    {!error&&<DataTable rows={rows}/>}<div className="flex flex-wrap items-center gap-3 text-sm text-slate-700"><span>{rows.length} {kind} shown</span>{cursor&&<Button size="sm" variant="outline" disabled={loadOlder.isPending} onClick={()=>loadOlder.mutate(cursor)}>{loadOlder.isPending?'Loading...':`Load older ${kind}`}</Button>}</div>
    {loadOlder.error&&<p role="alert" className="text-red-600">Could not load older {kind}: {String(loadOlder.error)}</p>}</section>;
}
function ReviewPanel({readOnly,accountId}:{readOnly:boolean;accountId:string|null}) {
  const {data:summary,error}=useQuery<ReviewSummary>({queryKey:['portal-review-summary',accountId],
    queryFn:()=>apiFetch('/api/portal?action=review_summary'),enabled:!!accountId,retry:false});
  return <div className="space-y-4">{!readOnly&&<ReviewRequestForm/>}{error&&<p role="alert" className="text-red-600">Could not load review summary: {String(error)}</p>}{summary&&<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
    ['Requests sent',summary.requestsSent],['Requests clicked',summary.requestsClicked],
    ['Reviews received',summary.reviewsReceived],['Average rating',summary.averageRating===null?'No ratings':`${summary.averageRating} / 5`],
  ].map(([label,value])=><Card key={label} className="p-4"><p className="text-xs text-slate-700">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></Card>)}</div>}<Card className="p-4"><h2 className="font-semibold">Rating trend</h2><div className="mt-3 flex items-end gap-3 overflow-x-auto">{summary?.trend.length?summary.trend.map(item=><div key={item.month} className="min-w-16 text-center text-xs"><div className="mx-auto w-10 rounded-t bg-blue-500" style={{height:`${Math.max(8,item.rating/5*90)}px`}}/><p className="mt-1">{item.month}</p><p>{item.rating.toFixed(1)} / 5</p><p>{item.count} reviews</p></div>):<p className="text-sm text-muted-foreground">No reviews in the past six months.</p>}</div></Card><ReviewList kind="reviews" accountId={accountId}/><ReviewList kind="requests" accountId={accountId}/></div>;
}
type ReportRow={id:string;type:string;period_start:string;period_end:string;status:string;work_done:string|null;whats_next:string|null;pdf_path:string|null};
function ReportArchive({canEdit}:{canEdit:boolean}) {
  const {data,error}=useQuery<ReportRow[]>({queryKey:['portal-report-archive'],queryFn:()=>apiFetch('/api/portal?action=reports'),retry:false});
  const queryClient=useQueryClient();const [draft,setDraft]=useState<Record<string,{workDone:string;whatsNext:string}>>({});
  const update=useMutation({mutationFn:(value:{reportId:string;send:boolean})=>{const row=data?.find(x=>x.id===value.reportId);const text=draft[value.reportId];return apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'update_report',reportId:value.reportId,workDone:text?.workDone??row?.work_done??'',whatsNext:text?.whatsNext??row?.whats_next??'',send:value.send})})},onSuccess:()=>void queryClient.invalidateQueries({queryKey:['portal-report-archive']})});
  async function download(reportId:string){const result=await apiFetch(`/api/portal?action=report_file&reportId=${reportId}`) as {url:string};window.open(result.url,'_blank','noopener,noreferrer')}
  return <div className="space-y-3">{error&&<p role="alert" className="text-red-600">{String(error)}</p>}{!data?.length&&!error&&<Card className="p-6">No reports yet.</Card>}{data?.map(report=><Card key={report.id} className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{nice(report.type)} report</h3><p className="text-xs text-muted-foreground">{report.period_start} to {report.period_end} · {nice(report.status)}</p></div>{report.pdf_path&&<Button variant="outline" onClick={()=>void download(report.id)}>Download PDF</Button>}</div>
    {report.status==='draft'&&canEdit?<><label className="text-sm">What we did<Textarea className="mt-1" value={draft[report.id]?.workDone??report.work_done??''} onChange={e=>setDraft(old=>({...old,[report.id]:{workDone:e.target.value,whatsNext:old[report.id]?.whatsNext??report.whats_next??''}}))}/></label><label className="text-sm">What's next<Textarea className="mt-1" value={draft[report.id]?.whatsNext??report.whats_next??''} onChange={e=>setDraft(old=>({...old,[report.id]:{workDone:old[report.id]?.workDone??report.work_done??'',whatsNext:e.target.value}}))}/></label><div className="flex gap-2"><Button variant="outline" disabled={update.isPending} onClick={()=>update.mutate({reportId:report.id,send:false})}>Save draft</Button><Button disabled={update.isPending||!(draft[report.id]?.workDone??report.work_done)?.trim()||!(draft[report.id]?.whatsNext??report.whats_next)?.trim()} onClick={()=>update.mutate({reportId:report.id,send:true})}>Send report</Button></div></>:<><p className="text-sm">{report.work_done}</p><p className="text-sm">{report.whats_next}</p></>}
  </Card>)}{update.error&&<p role="alert" className="text-red-600">{String(update.error)}</p>}</div>;
}
function BillingPanel({rows,readOnly}:{rows:Record<string,unknown>[];readOnly:boolean}) {
  const {data}=useQuery<{package:string|null;addOns:string[];nextChargeDate:string|null}>({queryKey:['portal-billing-summary'],queryFn:()=>apiFetch('/api/portal?action=billing_summary'),retry:false});
  const billing=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'billing_portal'})}) as Promise<{url:string}>,onSuccess:value=>window.location.assign(value.url)});
  return <div className="space-y-4"><Card className="grid gap-3 p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Package</p><p className="font-semibold">{nice(data?.package||'Custom')}</p></div><div><p className="text-xs text-muted-foreground">Add-ons</p><p className="font-semibold">{data?.addOns?.length?data.addOns.join(', '):'None'}</p></div><div><p className="text-xs text-muted-foreground">Next charge</p><p className="font-semibold">{data?.nextChargeDate||'Not available'}</p></div></Card><Button disabled={readOnly||billing.isPending} onClick={()=>billing.mutate()}>Manage billing</Button>{billing.error&&<p role="alert" className="text-red-600">{String(billing.error)}</p>}<h2 className="font-semibold">Invoices</h2>{rows.length?rows.map((invoice,index)=><Card key={String(invoice.id||index)} className="flex flex-wrap items-center justify-between gap-2 p-4"><div><p className="font-medium">{show(invoice.invoice_number)} · {show(invoice.status)}</p><p className="text-sm text-muted-foreground">{show(invoice.issued_at)} · {show(invoice.currency)} {show(invoice.total)}</p></div><div className="flex gap-2">{typeof invoice.stripe_hosted_invoice_url==='string'&&<a className="rounded border px-3 py-2 text-sm" href={invoice.stripe_hosted_invoice_url} target="_blank" rel="noreferrer">View invoice</a>}{typeof invoice.stripe_invoice_pdf==='string'&&<a className="rounded border px-3 py-2 text-sm" href={invoice.stripe_invoice_pdf} target="_blank" rel="noreferrer">PDF</a>}</div></Card>):<Card className="p-6">No invoices yet.</Card>}</div>;
}
function ClientSettings({readOnly}:{readOnly:boolean}) {
  const {data}=useQuery<{name:string;phone:string|null;website:string|null;notifications:{email:boolean;text:boolean;phone?:string}}>({queryKey:['portal-client-settings'],queryFn:()=>apiFetch('/api/portal?action=client_settings'),retry:false});
  const [form,setForm]=useState<{phone:string;website:string;email:boolean;text:boolean;alertPhone:string}|null>(null);
  useEffect(()=>{if(data)setForm({phone:data.phone||'',website:data.website||'',email:data.notifications?.email!==false,text:!!data.notifications?.text,alertPhone:data.notifications?.phone||''})},[data]);
  const save=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'update_client_settings',phone:form?.phone||'',website:form?.website||'',notifications:{email:!!form?.email,text:!!form?.text,phone:form?.alertPhone||''}})})});
  if(!form)return <p>Loading settings...</p>;
  return <Card className="space-y-3 p-4"><h2 className="font-semibold">Business and notifications</h2><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Business phone<Input className="mt-1" value={form.phone} disabled={readOnly} onChange={e=>setForm(old=>old&&({...old,phone:e.target.value}))}/></label><label className="text-sm">Website<Input className="mt-1" value={form.website} disabled={readOnly} onChange={e=>setForm(old=>old&&({...old,website:e.target.value}))}/></label></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.email} disabled={readOnly} onChange={e=>setForm(old=>old&&({...old,email:e.target.checked}))}/>Email new lead and missed-call alerts</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.text} disabled={readOnly} onChange={e=>setForm(old=>old&&({...old,text:e.target.checked}))}/>Text new lead and missed-call alerts</label>{form.text&&<label className="text-sm">Alert mobile number<Input className="mt-1" placeholder="+1..." value={form.alertPhone} disabled={readOnly} onChange={e=>setForm(old=>old&&({...old,alertPhone:e.target.value}))}/></label>}{form.text&&!/^\+1\d{10}$/.test(form.alertPhone)&&<p role="alert" className="text-sm text-red-600">Enter a mobile number in +1XXXXXXXXXX format to enable text alerts.</p>}<Button disabled={readOnly||save.isPending||(form.text&&!/^\+1\d{10}$/.test(form.alertPhone))} onClick={()=>save.mutate()}>Save settings</Button>{save.error&&<p role="alert" className="text-red-600">{String(save.error)}</p>}{save.isSuccess&&<p className="text-green-700">Settings saved.</p>}</Card>;
}
function ReviewDelaySettings() {
  const {data}=useQuery<{reviewDelayHours:number}>({queryKey:['portal-client-settings'],queryFn:()=>apiFetch('/api/portal?action=client_settings'),retry:false});
  const [hours,setHours]=useState('2');
  useEffect(()=>{if(data)setHours(String(data.reviewDelayHours))},[data]);
  const save=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'set_review_delay',hours:Number(hours)})})});
  return <Card className="space-y-2 p-4"><h2 className="font-semibold">Review request timing</h2><div className="flex gap-2"><Input aria-label="Hours after job completion" type="number" min="0" max="168" className="w-36" value={hours} onChange={e=>setHours(e.target.value)}/><Button disabled={save.isPending||Number(hours)<0||Number(hours)>168} onClick={()=>save.mutate()}>Save delay</Button></div><p className="text-xs text-muted-foreground">Hours after a job is marked Won. Default is 2.</p>{save.error&&<p role="alert" className="text-red-600">{String(save.error)}</p>}</Card>;
}
function PageBuilder({initial,readOnly,onSaved}:{initial?:Page;readOnly:boolean;onSaved:()=>void}) {
  const queryClient=useQueryClient();
  const {data:availableForms}=useQuery<Snapshot>({queryKey:['portal','forms'],
    queryFn:()=>apiFetch('/api/portal?action=snapshot&section=forms')});
  const {data:versions}=useQuery<Array<{version:number;published_at:string;note:string|null}>>({
    queryKey:['portal-page-versions',initial?.id],
    queryFn:()=>apiFetch(`/api/portal?action=page_versions&pageId=${initial?.id}`),
    enabled:!!initial?.id,retry:false});
  const [draft,setDraft] = useState({id:initial?.id ?? null,title:initial?.name ?? 'New landing page',
    slug:initial?.slug ?? `new-page-${Math.random().toString(36).slice(2,7)}`,
    seoDescription:initial?.seo_description ?? '',sections:initial?.sections ?? [] as Section[],theme:{...themeDefault,...initial?.theme}});
  const latest=useRef(draft),undo=useRef<typeof draft[]>([]),redo=useRef<typeof draft[]>([]);
  const pageId=useRef(initial?.id??null),writeQueue=useRef<Promise<void>>(Promise.resolve());
  const revision=useRef(0),[changeNumber,setChangeNumber]=useState(0);
  const [saveState,setSaveState]=useState<'saved'|'unsaved'|'saving'>('saved');
  const [historyCount,setHistoryCount]=useState({undo:0,redo:0});
  function edit(change:(current:typeof draft)=>typeof draft){
    const next=change(latest.current);
    if(next===latest.current)return;
    undo.current.push(structuredClone(latest.current));
    if(undo.current.length>60)undo.current.shift();
    redo.current=[];latest.current=next;setDraft(next);
    revision.current++;setChangeNumber(revision.current);setSaveState('unsaved');
    setHistoryCount({undo:undo.current.length,redo:0});
  }
  function step(direction:'undo'|'redo'){
    const from=direction==='undo'?undo.current:redo.current;
    const to=direction==='undo'?redo.current:undo.current;
    const previous=from.pop();if(!previous)return;
    to.push(structuredClone(latest.current));latest.current=previous;setDraft(previous);
    revision.current++;setChangeNumber(revision.current);setSaveState('unsaved');
    setSelected(previous.sections.some(item=>item.id===selected)?selected:previous.sections[0]?.id??null);
    setHistoryCount({undo:undo.current.length,redo:redo.current.length});
  }
  const [selected,setSelected] = useState<string|null>(draft.sections[0]?.id ?? null);
  const [prompt,setPrompt] = useState('');
  const [suggestion,setSuggestion]=useState<{sections:Section[];theme:Theme;title:string;seoDescription:string}|null>(null);
  const [error,setError] = useState('');
  function saveDraft(snapshot:typeof draft){
    const write=writeQueue.current.then(async()=>{
      const saved=await apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'save_page',
        ...snapshot,id:pageId.current,status:'draft'})}) as {id:string};
      if(!pageId.current){pageId.current=saved.id;void queryClient.invalidateQueries({queryKey:['portal','pages']});}
      return saved;
    });
    writeQueue.current=write.then(()=>undefined,()=>undefined);
    return write;
  }
  useEffect(()=>{
    if(readOnly||!changeNumber)return;
    const timer=setTimeout(()=>{
      const snapshot=latest.current,atRevision=revision.current;
      setSaveState('saving');
      void saveDraft(snapshot).then(()=>{if(revision.current===atRevision)setSaveState('saved');setError('')})
        .catch(e=>{setSaveState('unsaved');setError(String(e))});
    },2000);
    return()=>clearTimeout(timer);
  },[changeNumber,readOnly]);
  const save = useMutation({mutationFn:async (publish:boolean) => {
    const saved=await saveDraft(latest.current);
    if(publish)await apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'publish_page',pageId:saved.id})});
  },
    onSuccess:()=>{setError('');setSaveState('saved');void queryClient.invalidateQueries({queryKey:['portal-page-versions',pageId.current]});onSaved()},
    onError:e=>setError(String(e))});
  const restore=useMutation({mutationFn:(version:number)=>apiFetch('/api/portal',{method:'POST',
    body:JSON.stringify({action:'restore_page',pageId:initial?.id,version})}) as Promise<{sections:Section[];theme:Theme}>,
    onSuccess:value=>{edit(old=>({...old,sections:value.sections,theme:{...themeDefault,...value.theme}}));
      setSelected(value.sections[0]?.id??null);setError('');
      void queryClient.invalidateQueries({queryKey:['portal','pages']});},
    onError:e=>setError(String(e))});
  const generate = useMutation({mutationFn:() => apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'ai_page',prompt,currentSections:draft.sections})}) as Promise<{sections:Section[];theme:Theme;title:string;seoDescription:string}>,
    onSuccess:value=>{setSuggestion(value);setError('')},onError:e=>setError(String(e))});
  const current = draft.sections.find(item=>item.id===selected);
  const patchSection = (patch:Partial<Section>) => edit(old=>({...old,sections:old.sections.map(item=>item.id===selected?{...item,...patch}:item)}));
  const move = (index:number,shift:number) => edit(old=>{const next=[...old.sections];const [item]=next.splice(index,1);next.splice(index+shift,0,item);return {...old,sections:next}});
  useEffect(()=>{if(readOnly)return;function key(event:KeyboardEvent){
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){
      event.preventDefault();step(event.shiftKey?'redo':'undo');
    }else if(event.key==='Escape')setSelected(null);
    else if(event.key==='Delete'&&selected&&
      !(event.target instanceof HTMLInputElement)&&!(event.target instanceof HTMLTextAreaElement)&&
      !(event.target instanceof HTMLSelectElement)){
      edit(old=>({...old,sections:old.sections.filter(item=>item.id!==selected)}));
      setSelected(null);
    }
  }window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)});
  return <div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><Input aria-label="Page title" className="min-w-48 flex-1" value={draft.title} disabled={readOnly} onChange={event=>edit(old=>({...old,title:event.target.value}))}/>
    <span role="status" className="text-xs text-muted-foreground">{saveState==='saved'?'Saved':saveState==='saving'?'Saving...':'Unsaved changes'}</span>
    <Button size="icon" variant="outline" aria-label="Undo" disabled={readOnly||!historyCount.undo} onClick={()=>step('undo')}><Undo2 className="h-4 w-4"/></Button>
    <Button size="icon" variant="outline" aria-label="Redo" disabled={readOnly||!historyCount.redo} onClick={()=>step('redo')}><Redo2 className="h-4 w-4"/></Button>
    <Button disabled={readOnly||save.isPending} onClick={()=>save.mutate(false)}><Save className="mr-1 h-4 w-4"/>Save draft</Button>
    <Button variant="outline" disabled={readOnly||save.isPending||!draft.sections.length} onClick={()=>save.mutate(true)}>Publish</Button></div>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    {initial?.id&&<details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Version history</summary>
      <div className="mt-3 space-y-2">{versions?.length?versions.map(item=><div key={item.version} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
        <div><b>Version {item.version}</b><p className="text-xs text-muted-foreground">{new Date(item.published_at).toLocaleString()}</p></div>
        <Button size="sm" variant="outline" disabled={readOnly||restore.isPending} onClick={()=>restore.mutate(item.version)}>Restore to draft</Button>
      </div>):<p className="text-sm text-muted-foreground">Publish to create a version.</p>}</div></details>}
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      <Card className="space-y-3 p-4"><h3 className="font-semibold">Sections</h3>{draft.sections.map((item,index)=><div key={item.id} className={`flex items-center gap-1 rounded border p-1 ${selected===item.id?'border-blue-500':''}`}>
        <button className="flex-1 text-left px-2 text-sm" onClick={()=>setSelected(item.id)}>{nice(item.type)}</button>
        <button aria-label="Move up" disabled={readOnly||index===0} onClick={()=>move(index,-1)}><ArrowUp className="h-3 w-3"/></button>
        <button aria-label="Move down" disabled={readOnly||index===draft.sections.length-1} onClick={()=>move(index,1)}><ArrowDown className="h-3 w-3"/></button>
        <button aria-label={item.hidden?'Show section':'Hide section'} disabled={readOnly} onClick={()=>{setSelected(item.id);edit(old=>({...old,sections:old.sections.map(section=>section.id===item.id?{...section,hidden:!section.hidden}:section)}))}}>{item.hidden?<EyeOff className="h-3 w-3"/>:<Eye className="h-3 w-3"/>}</button>
        <button aria-label="Duplicate section" disabled={readOnly||draft.sections.length>=40} onClick={()=>{const duplicate={...structuredClone(item),id:crypto.randomUUID(),blocks:item.blocks?.map(block=>({...block,id:crypto.randomUUID()}))};edit(old=>({...old,sections:[...old.sections.slice(0,index+1),duplicate,...old.sections.slice(index+1)]}));setSelected(duplicate.id)}}><Copy className="h-3 w-3"/></button>
        <button aria-label="Delete section" disabled={readOnly} onClick={()=>{edit(old=>({...old,sections:old.sections.filter(section=>section.id!==item.id)}));if(selected===item.id)setSelected(null)}}><Trash2 className="h-3 w-3"/></button></div>)}
        <div className="grid grid-cols-2 gap-1">{sections.map(type=><Button key={type} size="sm" variant="outline" disabled={readOnly||draft.sections.length>=40} onClick={()=>{const item:Section={id:crypto.randomUUID(),type,heading:`New ${type} section`,body:''};edit(old=>({...old,sections:[...old.sections,item]}));setSelected(item.id)}}><Plus className="mr-1 h-3 w-3"/>{nice(type)}</Button>)}</div>
      </Card>
      <div className="overflow-hidden rounded-xl border bg-white"><div className="border-b bg-slate-50 px-4 py-2 text-xs">Live preview</div>
        <div style={{background:draft.theme.background,color:draft.theme.foreground,fontFamily:draft.theme.font==='serif'?'Georgia,serif':'Arial,sans-serif'}}>
          {draft.sections.filter(item=>!item.hidden).map(item=><section key={item.id} onClick={()=>setSelected(item.id)} className={`cursor-pointer border-2 p-10 ${selected===item.id?'border-blue-500':'border-transparent'}`}>
            <h2 className="mb-3 text-3xl font-bold">{item.heading}</h2><p>{item.body}</p>
            {item.type==='features'&&<div className="mt-3 grid gap-2 sm:grid-cols-3">{item.items?.map((text,index)=><div key={index} className="rounded border p-3">{text}</div>)}</div>}
            {!!item.blocks?.length&&<div className="mt-3 grid gap-2 sm:grid-cols-2">{item.blocks.filter(block=>!block.hidden).map(block=><div key={block.id} className="rounded border p-3"><h3 className="font-semibold">{block.heading}</h3><p>{block.body}</p></div>)}</div>}
            {item.type==='image'&&item.imageUrl&&<img alt={item.heading||''} src={item.imageUrl} className="mt-3 max-h-80 rounded object-cover"/>}
            {item.buttonText&&<span className="mt-4 inline-block rounded px-4 py-2 text-white" style={{background:draft.theme.accent}}>{item.buttonText}</span>}
          </section>)}</div></div>
      <Card className="space-y-3 p-4"><h3 className="font-semibold">Editor</h3>
        {current&&<><label className="text-xs">Heading<Input value={current.heading??''} disabled={readOnly} onChange={event=>patchSection({heading:event.target.value})}/></label>
          <label className="text-xs">Body<Textarea value={current.body??''} disabled={readOnly} onChange={event=>patchSection({body:event.target.value})}/></label>
          {current.type==='features'&&<label className="text-xs">Features, one per line<Textarea value={(current.items??[]).join('\n')} disabled={readOnly} onChange={event=>patchSection({items:event.target.value.split('\n').slice(0,12)})}/></label>}
          {['hero','cta'].includes(current.type)&&<><label className="text-xs">Button text<Input value={current.buttonText??''} disabled={readOnly} onChange={event=>patchSection({buttonText:event.target.value})}/></label><label className="text-xs">Button URL<Input value={current.buttonUrl??''} disabled={readOnly} onChange={event=>patchSection({buttonUrl:event.target.value})}/></label></>}
          {current.type==='image'&&<label className="text-xs">Image URL<Input value={current.imageUrl??''} disabled={readOnly} onChange={event=>patchSection({imageUrl:event.target.value})}/></label>}
          {current.type==='form'&&<label className="text-xs">Form<select className="mt-1 w-full rounded border p-2" value={current.formId??''}
            disabled={readOnly} onChange={event=>patchSection({formId:event.target.value})}><option value="">Select a form</option>
            {(Array.isArray(availableForms?.data)?availableForms.data as Array<{id:string;name:string}>:[]).map(form=><option key={form.id} value={form.id}>{form.name}</option>)}</select></label>}
          <Button variant="outline" disabled={readOnly} onClick={()=>{edit(old=>({...old,sections:old.sections.filter(item=>item.id!==selected)}));setSelected(null)}}>Remove section</Button></>}
        <label className="text-xs">Page slug<Input value={draft.slug} disabled={readOnly} onChange={event=>edit(old=>({...old,slug:event.target.value}))}/></label>
        <label className="text-xs">SEO description<Textarea value={draft.seoDescription} disabled={readOnly} onChange={event=>edit(old=>({...old,seoDescription:event.target.value}))}/></label>
        <div className="grid grid-cols-3 gap-1">{(['background','foreground','accent'] as const).map(key=><label key={key} className="text-xs">{nice(key)}<input type="color" className="block h-9 w-full" value={draft.theme[key]} disabled={readOnly} onChange={event=>edit(old=>({...old,theme:{...old.theme,[key]:event.target.value}}))}/></label>)}</div>
        <label className="text-xs">Font<select className="mt-1 w-full rounded border p-2" value={draft.theme.font} disabled={readOnly}
          onChange={event=>edit(old=>({...old,theme:{...old.theme,font:event.target.value as Theme['font']}}))}>
          <option value="sans">Sans serif</option><option value="serif">Serif</option></select></label>
        <div className="border-t pt-3"><h3 className="mb-2 flex items-center gap-1 font-semibold"><Sparkles className="h-4 w-4"/>AI page assistant</h3>
          <Textarea aria-label="Page request" placeholder="Describe the page or change you want" value={prompt} disabled={readOnly} onChange={event=>setPrompt(event.target.value)}/>
          <Button className="mt-2" disabled={readOnly||generate.isPending||prompt.trim().length<5} onClick={()=>generate.mutate()}>{generate.isPending?'Creating...':'Suggest edits'}</Button></div>
        {suggestion&&<div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-sm"><p className="font-medium">Review AI suggestion</p>
          <p>{suggestion.sections.length} sections · {suggestion.title}</p>
          <p className="text-xs">Check every claim before applying. The change can be undone in one step.</p>
          <div className="flex gap-2"><Button size="sm" disabled={readOnly} onClick={()=>{edit(old=>({...old,title:suggestion.title,seoDescription:suggestion.seoDescription,sections:suggestion.sections,theme:suggestion.theme}));setSelected(suggestion.sections[0]?.id??null);setSuggestion(null)}}>Apply to draft</Button>
            <Button size="sm" variant="outline" onClick={()=>setSuggestion(null)}>Discard</Button></div></div>}
      </Card></div></div>;
}

function FeatureManager() {
  const queryClient=useQueryClient();
  const {data,error}=useQuery<Feature[]>({queryKey:['portal-features'],queryFn:()=>apiFetch('/api/portal?action=features'),retry:false});
  const {data:modelData}=useQuery<{model:string}>({queryKey:['portal-ai-model'],queryFn:()=>apiFetch('/api/portal?action=ai_model'),retry:false});
  const [userId,setUserId]=useState('');
  const [model,setModel]=useState('');
  useEffect(()=>{if(modelData?.model)setModel(modelData.model)},[modelData?.model]);
  const setFeature=useMutation({mutationFn:(value:{feature:string;enabled:boolean})=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'set_feature',...value,userId:userId||null})}),
    onSuccess:()=>{void queryClient.invalidateQueries({queryKey:['portal-features']});void queryClient.invalidateQueries({queryKey:['portal-accounts']})}});
  const setAiModel=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'set_ai_model',model})}),
    onSuccess:()=>{void queryClient.invalidateQueries({queryKey:['portal-ai-model']})}});
  if(error)return <p role="alert" className="text-sm text-red-600">{String(error)}</p>;
  return <Card className="space-y-3 p-5"><h2 className="font-semibold">Feature access</h2><p className="text-xs text-muted-foreground">Leave user ID blank for the organization default. A user setting overrides it.</p>
    <Input aria-label="User ID for feature override" placeholder="User ID for an override (optional)" value={userId} onChange={event=>setUserId(event.target.value)}/>
    <div className="grid gap-2 sm:grid-cols-2">{['client_portal','client_accounts','landing_page_builder','landing_page_ai','delivery_automation','client_page_editing'].map(feature=>{
      const current=data?.find(row=>row.feature_key===feature&&row.user_id===(userId||null))?.enabled??false;
      return <label key={feature} className="flex items-center justify-between rounded border px-3 py-2 text-sm">{nice(feature)}<input type="checkbox" checked={current} disabled={setFeature.isPending} onChange={event=>setFeature.mutate({feature,enabled:event.target.checked})}/></label>;
    })}</div><div className="flex gap-2"><Input aria-label="OpenRouter landing page model" value={model} onChange={event=>setModel(event.target.value)}/><Button variant="outline" disabled={setAiModel.isPending||!model} onClick={()=>setAiModel.mutate()}>Save model</Button></div>
    {setFeature.error&&<p role="alert" className="text-sm text-red-600">{String(setFeature.error)}</p>}
    {setAiModel.error&&<p role="alert" className="text-sm text-red-600">{String(setAiModel.error)}</p>}</Card>;
}

function StaffAssignments() {
  const queryClient=useQueryClient();
  const {data,error}=useQuery<Array<{user_id:string;name:string;email:string;role_in_account:string|null}>>({
    queryKey:['portal-staff'],queryFn:()=>apiFetch('/api/portal?action=staff'),retry:false});
  const assign=useMutation({mutationFn:(value:{userId:string;role:string|null})=>apiFetch('/api/portal',{
    method:'POST',body:JSON.stringify({action:'assign_staff',...value})}),
    onSuccess:()=>{void queryClient.invalidateQueries({queryKey:['portal-staff']});void queryClient.invalidateQueries({queryKey:['portal-accounts']})}});
  if(error)return <p role="alert" className="text-sm text-red-600">{String(error)}</p>;
  return <Card className="space-y-3 p-5"><h2 className="font-semibold">Agency staff assignments</h2>
    {data?.length?data.map(person=><div key={person.user_id} className="flex items-center justify-between gap-3 border-t py-2 text-sm"><span>{person.name} <span className="text-muted-foreground">{person.email}</span></span>
      <select aria-label={`Role for ${person.name}`} className="rounded border px-2 py-1" value={person.role_in_account||''} disabled={assign.isPending}
        onChange={event=>assign.mutate({userId:person.user_id,role:event.target.value||null})}>
        <option value="">Unassigned</option>{['account_manager','marketing','ads','agent_lead','agent'].map(role=><option key={role} value={role}>{nice(role)}</option>)}
      </select></div>):<p className="text-sm text-muted-foreground">No active agency staff members found.</p>}
    {assign.error&&<p role="alert" className="text-sm text-red-600">{String(assign.error)}</p>}
  </Card>;
}

function ClientStaffInvite() {
  const [name,setName]=useState('');const [email,setEmail]=useState('');
  const invite=useMutation<{invited:boolean;inviteSent:boolean;inviteUrl:string|null}>({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'invite_staff',name,email})}),
    onSuccess:()=>{setName('');setEmail('')}});
  return <Card className="space-y-3 p-5"><h2 className="font-semibold">Invite client staff</h2>
    <div className="flex flex-wrap gap-2"><Input className="min-w-40 flex-1" aria-label="Staff name" placeholder="Name" value={name} onChange={event=>setName(event.target.value)}/>
      <Input className="min-w-48 flex-1" aria-label="Staff email" type="email" placeholder="Email" value={email} onChange={event=>setEmail(event.target.value)}/>
      <Button disabled={!name||!email||invite.isPending} onClick={()=>invite.mutate()}>Create invite</Button></div>
    {invite.data?.inviteSent&&<p className="text-sm text-green-700">Invitation sent.</p>}
    {invite.data?.inviteUrl&&<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="font-medium">Invitation created. Share this private link with the staff member. It expires in 7 days.</p>
      <div className="flex flex-wrap gap-2"><Input aria-label="Staff invitation link" readOnly value={invite.data.inviteUrl} className="min-w-0 flex-1"/>
        <Button variant="outline" onClick={()=>void navigator.clipboard.writeText(invite.data?.inviteUrl||'')}>Copy link</Button></div>
    </div>}
    {invite.error&&<p role="alert" className="text-sm text-red-600">{String(invite.error)}</p>}</Card>;
}

function AccountSettings({value,onSaved}:{value:Record<string,unknown>;onSaved:()=>void}) {
  const [form,setForm]=useState<Record<string,string>>({});
  const [brand,setBrand]=useState({primary:'#285ce6',text:'#172033',background:'#ffffff',font:'Arial'});
  useEffect(()=>{setForm(Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
    Array.isArray(item)?item.join(', '):typeof item==='object'?JSON.stringify(item||{}):String(item??'')])));
    const saved=value.brand as Partial<typeof brand>|undefined;
    if(saved)setBrand(old=>({...old,...saved}));
  },[value]);
  const save=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'update_account',settings:{
    phone:form.phone||'',website:form.website||'',timezone:form.timezone||'America/New_York',
    logoUrl:form.logo_url||'',primaryDomain:form.primary_domain||'',mightycallNumber:form.mightycall_number||'',
    googleReviewLink:form.google_review_link||'',gbpUrl:form.gbp_url||'',
    metaAdAccountId:form.meta_ad_account_id||'',googleAdsCustomerId:form.google_ads_customer_id||'',
    stripeCustomerId:form.stripe_customer_id||'',
    goalMetric:form.goal_metric||'',goalValue:form.goal_value?Number(form.goal_value):null,
    launchDate:form.launch_date||'',addOns:(form.add_ons||'').split(',').map(x=>x.trim()).filter(Boolean),brand,
  }})}),onSuccess});
  function onSuccess(){onSaved()}
  const fields:[string,string][]=[['phone','Phone'],['website','Website'],['timezone','Timezone'],['logo_url','Logo URL'],
    ['primary_domain','Primary domain'],['mightycall_number','MightyCall number (+1...)'],
    ['google_review_link','Google review link'],['gbp_url','Google Business Profile URL'],
    ['meta_ad_account_id','Meta ad account ID'],['google_ads_customer_id','Google Ads customer ID'],
    ['stripe_customer_id','Stripe customer ID'],
    ['goal_metric','Goal metric'],['goal_value','Goal value'],['launch_date','Launch date (YYYY-MM-DD)'],['add_ons','Add-ons (comma separated)']];
  return <Card className="space-y-4 p-5"><h2 className="font-semibold">Account settings</h2>
    <div className="grid gap-3 md:grid-cols-2">{fields.map(([key,label])=><label key={key} className="text-xs">{label}<Input className="mt-1" value={form[key]??''} onChange={event=>setForm(old=>({...old,[key]:event.target.value}))}/></label>)}</div>
    <div className="grid gap-3 sm:grid-cols-4">{(['primary','text','background'] as const).map(key=><label key={key} className="text-xs">Brand {key}<input type="color" className="block h-10 w-full" value={brand[key]} onChange={event=>setBrand(old=>({...old,[key]:event.target.value}))}/></label>)}<label className="text-xs">Brand font<Input value={brand.font} onChange={event=>setBrand(old=>({...old,font:event.target.value}))}/></label></div>
    <Button disabled={save.isPending} onClick={()=>save.mutate()}>Save settings</Button>
    {save.error&&<p role="alert" className="text-sm text-red-600">{String(save.error)}</p>}</Card>;
}

export default function ClientPortal() {
  const [location,navigate] = useLocation();
  const {role,pagePermissions} = useAuth();
  const queryClient = useQueryClient();
  const path = location.replace(/^\/leadgen/,'');
  const current = path.split('/')[2] as PortalPage|undefined;
  const tab = pages.includes(current as PortalPage) ? current as PortalPage : null;
  const agencyRole = ['owner','admin','member','viewer','agent','agency_admin','agency_staff'].includes(role);
  const {data:accounts,error:accountsError,isLoading:accountsLoading} = useQuery<Accounts>({queryKey:['portal-accounts'],queryFn:()=>apiFetch('/api/portal?action=accounts'),retry:false});
  const viewingAsClient=accounts?.selected?.viewAsClient===true;
  const agency=agencyRole&&!viewingAsClient;
  const admin=['owner','admin','agency_admin'].includes(role)&&!viewingAsClient;
  const {data:closedCompanies} = useQuery<ClosedCompany[]>({queryKey:['portal-closed-companies'],
    queryFn:()=>apiFetch('/api/portal?action=closed_companies'),enabled:admin&&!tab,retry:false});
  const [companyId,setCompanyId] = useState('');
  const [businessName,setBusinessName]=useState('');
  const [businessPhone,setBusinessPhone]=useState('');
  const [businessWebsite,setBusinessWebsite]=useState('');
  const [ownerEmail,setOwnerEmail] = useState('');
  const [ownerName,setOwnerName] = useState('');
  const [packageName,setPackageName] = useState('starter');
  const createClient = useMutation<{accountId:string;existing:boolean;inviteSent:boolean;inviteUrl:string|null}>({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify(companyId?
    {action:'create_client',companyId,package:packageName,ownerEmail,ownerName}:
    {action:'create_client_manual',name:businessName,phone:businessPhone,website:businessWebsite,package:packageName,ownerEmail,ownerName})}),
    onSuccess:()=>{void queryClient.invalidateQueries({queryKey:['portal-accounts']});void queryClient.invalidateQueries({queryKey:['portal-closed-companies']})}});
  const selectedId = accounts?.selected?.accountId ?? (accounts?.accounts.length===1?accounts.accounts[0].id:null);
  const {data:branding}=useQuery<{name:string;logoUrl:string|null;brand:{primary?:string;text?:string;background?:string}|null}>({queryKey:['portal-branding',selectedId],queryFn:()=>apiFetch('/api/portal?action=branding'),enabled:!!selectedId,retry:false});
  const {data:snapshot,error:pageError,isLoading:pageLoading} = useQuery<Snapshot>({queryKey:['portal',tab,selectedId],queryFn:()=>apiFetch(`/api/portal?action=snapshot&section=${tab}`),enabled:!!tab&&tab!=='launchpad'&&!!selectedId,retry:false});
  const {data:pageStats}=useQuery<Array<{id:string;visits:number;leads:number}>>({queryKey:['portal-page-stats',selectedId],queryFn:()=>apiFetch('/api/portal?action=page_stats'),enabled:tab==='pages'&&!!selectedId,retry:false});
  const {data:pageEditAllowed=false}=useQuery<boolean>({queryKey:['portal-page-edit-allowed',selectedId],
    queryFn:()=>apiFetch('/api/portal?action=page_edit_allowed'),enabled:tab==='pages'&&!!selectedId,retry:false});
  const [editing,setEditing] = useState<Page|undefined>();
  const [creating,setCreating] = useState(false);
  useEffect(()=>{setEditing(undefined);setCreating(false)},[tab,selectedId]);
  async function viewAs(accountId:string) {
    await apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'switch',accountId,viewAsClient:true})});
    await queryClient.invalidateQueries({queryKey:['portal']});
    await queryClient.invalidateQueries({queryKey:['portal-accounts']});
    navigate('/client-portal/dashboard');
  }
  async function exportData() {
    if (!tab) return;
    const {data} = await supabase.auth.getSession();
    const response = await fetch(`${BASE}/api/portal?action=export&section=${tab}`,{headers:{authorization:`Bearer ${data.session?.access_token||''}`}});
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=`${tab}.csv`;link.click();URL.revokeObjectURL(url);
  }
  if (accountsLoading) return <p>Loading client portal…</p>;
  if (accountsError) return <div className="space-y-4"><Card role="alert" className="p-6"><h1 className="font-semibold">Client portal unavailable</h1><p className="mt-2 text-sm">{String(accountsError)}</p></Card>{admin&&<FeatureManager/>}</div>;
  if (!accounts) return null;
  const limited = role==='client_staff';
  return <div className="space-y-6"><div className="flex flex-wrap items-center gap-3 rounded-xl border p-4" style={{background:branding?.brand?.background||'#ffffff',borderColor:branding?.brand?.primary||undefined,color:branding?.brand?.text||undefined}}>{branding?.logoUrl?<img src={branding.logoUrl} alt={`${branding.name} logo`} className="h-12 w-12 rounded object-contain"/>:<div className="flex h-12 w-12 items-center justify-center rounded bg-blue-600 font-bold text-white">VS</div>}<div><h1 className="text-xl font-semibold sm:text-2xl">{branding?.name||'Victory Sync'} portal</h1><p className="text-xs opacity-70 sm:text-sm">Leads, calls, pages, reviews, reports, and billing.</p></div></div>
    {accounts.selected?.viewAsClient&&<div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm"><span>Viewing as client. Changes are disabled.</span><Button size="sm" variant="outline" onClick={()=>void apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'switch',accountId:selectedId,viewAsClient:false})}).then(()=>queryClient.invalidateQueries({queryKey:['portal-accounts']})).then(()=>queryClient.invalidateQueries({queryKey:['portal']}))}>End client view</Button></div>}
    {!tab && admin && <Card className="space-y-4 p-5"><div><h2 className="font-semibold">Add a client</h2><p className="mt-1 text-sm text-muted-foreground">Start with a new business or select a company already marked Client.</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Existing client company</span><select aria-label="Existing client company" className="h-10 w-full rounded border px-3 text-sm" value={companyId} onChange={event=>{const id=event.target.value;setCompanyId(id);const company=closedCompanies?.find(item=>item.id===id);setOwnerEmail(company?.email||'');setOwnerName(company?.contact_name||'')}}><option value="">Create a new business</option>{closedCompanies?.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="space-y-1 text-sm"><span>Package</span><select aria-label="Package" className="h-10 w-full rounded border px-3 text-sm" value={packageName} onChange={event=>setPackageName(event.target.value)}>{['starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom'].map(value=><option key={value} value={value}>{nice(value)}</option>)}</select></label></div>
      {!companyId&&<div className="grid gap-3 sm:grid-cols-3"><Input aria-label="Business name" placeholder="Business name" value={businessName} onChange={event=>setBusinessName(event.target.value)}/><Input aria-label="Business phone" placeholder="Business phone" value={businessPhone} onChange={event=>setBusinessPhone(event.target.value)}/><Input aria-label="Business website" placeholder="https://business.com" value={businessWebsite} onChange={event=>setBusinessWebsite(event.target.value)}/></div>}
      <div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Owner name" placeholder="Owner name" value={ownerName} onChange={event=>setOwnerName(event.target.value)}/><Input aria-label="Owner email" placeholder="Owner email" type="email" value={ownerEmail} onChange={event=>setOwnerEmail(event.target.value)}/></div>
      <Button disabled={(!companyId&&!businessName.trim())||!ownerEmail||!ownerName||createClient.isPending} onClick={()=>createClient.mutate()}>{createClient.isPending?'Creating...':'Create client account'}</Button>
      {createClient.error&&<p role="alert" className="text-sm text-red-600">{String(createClient.error)}</p>}
      {createClient.data?.inviteSent&&<p className="text-sm text-green-700">Client created. Invitation emailed to {ownerEmail}.</p>}
      {createClient.data?.inviteUrl&&<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-medium">Client created. Email sending is not configured, so share this private invitation link with the owner. It expires in 7 days.</p><div className="flex flex-wrap gap-2"><Input aria-label="Client invitation link" readOnly value={createClient.data.inviteUrl} className="min-w-0 flex-1"/><Button variant="outline" onClick={()=>void navigator.clipboard.writeText(createClient.data.inviteUrl||'')}>Copy link</Button></div></div>}
      {createClient.data?.existing&&<p className="text-sm text-muted-foreground">This company already has a client account.</p>}
    </Card>}
    {!tab && agency && <AgencyOperations admin={admin} onOpen={id=>void apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'switch',accountId:id,viewAsClient:false})}).then(()=>queryClient.invalidateQueries({queryKey:['portal-accounts']})).then(()=>navigate('/client-portal/dashboard'))} onViewAs={id=>void viewAs(id)}/>}
    {admin&&!tab&&<FeatureManager/>}
    {(!tab && !agency) && <p>Select an account to continue.</p>}
    {tab&&<><nav aria-label="Portal pages" className="flex gap-2 overflow-x-auto pb-2">{pages.filter(page=>canAccessPath(`/client-portal/${page}`,pagePermissions,role)).map(page=><Link key={page} href={`/client-portal/${page}`} className={`shrink-0 rounded-lg px-3 py-2 text-sm ${tab===page?'bg-blue-600 text-white':'border bg-white'}`}>{nice(page)}</Link>)}</nav>
      {tab==='launchpad'?<Launchpad accountId={selectedId} role={role} pagePermissions={pagePermissions}/>:pageLoading?<p>Loading {tab}…</p>:pageError?<Card role="alert" className="p-6">{String(pageError)}</Card>:snapshot&&<>
        {['leads','calls','reviews','reports'].includes(tab)&&<div className="flex justify-end"><Button variant="outline" size="sm" disabled={snapshot.readOnly} onClick={()=>void exportData()}><Download className="mr-1 h-4 w-4"/>Export</Button></div>}
        {tab==='dashboard'&&<Dashboard canManageSpend={admin||role==='agency_staff'||role==='member'}/>}
        {tab==='leads'&&<LeadTable data={snapshot.data as {rows:Lead[];stages:{id:string;name:string}[]}} readOnly={snapshot.readOnly||limited}/>}
        {tab==='pages'&&<div className="space-y-4"><Button disabled={snapshot.readOnly||!pageEditAllowed} onClick={()=>{setCreating(true);setEditing(undefined)}}><Plus className="mr-1 h-4 w-4"/>New page</Button>{(creating||editing)?<PageBuilder key={editing?.id??'new'} initial={editing} readOnly={snapshot.readOnly||!pageEditAllowed} onSaved={()=>{setCreating(false);setEditing(undefined);void queryClient.invalidateQueries({queryKey:['portal','pages']});void queryClient.invalidateQueries({queryKey:['portal-page-stats']})}}/>:<div className="grid gap-3 md:grid-cols-2">{(snapshot.data as Page[]).map(page=>{const stats=pageStats?.find(x=>x.id===page.id);return <Card key={page.id} className="p-4"><h3 className="font-semibold">{page.name}</h3><p className="mb-2 text-xs text-muted-foreground">/{page.slug} · {page.status}</p><p className="mb-3 text-sm">{stats?.visits??0} visits · {stats?.leads??0} leads · {stats?.visits?((stats.leads/stats.visits)*100).toFixed(1):'0'}% conversion</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setEditing(page)}>{pageEditAllowed&&!snapshot.readOnly?"Edit":"View"}</Button>{pageEditAllowed&&!snapshot.readOnly&&<Link href={`/landing-pages/${page.id}?from=client-portal`}><Button size="sm" variant="outline">Full builder</Button></Link>}{page.status==='published'&&<a aria-label={`Open ${page.name} published page`} href={`${BASE}/p/${page.public_slug||page.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-white px-3 hover:bg-slate-50"><ExternalLink className="h-4 w-4"/></a>}</div></Card>})}</div>}</div>}
        {tab==='billing'&&<BillingPanel rows={snapshot.data as Record<string,unknown>[]} readOnly={snapshot.readOnly}/>}
        {tab==='settings'&&<div className="space-y-4">{(admin||role==='client_owner'||viewingAsClient)&&<ClientSettings readOnly={snapshot.readOnly}/>}{admin&&!snapshot.readOnly&&<AccountSettings value={snapshot.data as Record<string,unknown>} onSaved={()=>void queryClient.invalidateQueries({queryKey:['portal','settings']})}/>}{admin&&!snapshot.readOnly&&<ReviewDelaySettings/>}{admin&&<StaffAssignments/>}{(admin||role==='client_owner'||role==='client')&&!viewingAsClient&&<ClientStaffInvite/>}</div>}
        {tab==='calls'&&<CallLog canEdit={agency&&!snapshot.readOnly} admin={admin&&!snapshot.readOnly}/>}
        {tab==='reviews'&&<ReviewPanel readOnly={snapshot.readOnly||limited} accountId={selectedId}/>}
        {tab==='reports'&&<ReportArchive canEdit={agency&&!snapshot.readOnly}/>}
        {tab==='forms'&&<DataTable rows={snapshot.data as Record<string,unknown>[]}/>}
      </>}</>}
  </div>;
}
