import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowDown, ArrowUp, Plus, Save, Sparkles, Download, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { canAccessPath } from '@/lib/permissions';
import { AccountSwitcher } from '@/components/account-switcher';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Page = {id:string;name:string;slug:string;status:'draft'|'published';seo_description:string;
  sections:Section[];theme:Theme;created_at:string};
type Section = {id:string;type:'hero'|'text'|'features'|'image'|'cta'|'form';heading?:string;body?:string;
  buttonText?:string;buttonUrl?:string;imageUrl?:string;formId?:string;items?:string[]};
type Theme = {background:string;foreground:string;accent:string;font:'sans'|'serif'};
type Account = {id:string;name:string;health_score:number;leads_this_week:number;overdue_tasks:number;failed_payments:number;last_active_at:string|null};
type ClosedCompany = {id:string;name:string;email:string|null;contact_name:string|null};
type Accounts = {accounts:Account[];selected:{accountId:string|null;viewAsClient:boolean}|null};
type Feature = {feature_key:string;user_id:string|null;enabled:boolean};
type Snapshot = {accountId:string;readOnly:boolean;data:unknown};
type Lead = {id:string;first_name:string;last_name:string;company:string;phone:string;email:string;pipeline_stage_id:string|null;notes:string|null;created_at:string};
const pages = ['dashboard','leads','calls','pages','forms','reviews','reports','billing','settings'] as const;
type PortalPage = typeof pages[number];
const themeDefault:Theme = {background:'#ffffff',foreground:'#172033',accent:'#285ce6',font:'sans'};
const sections:Section['type'][] = ['hero','text','features','image','cta','form'];
const BASE = import.meta.env.BASE_URL.replace(/\/$/,'');

function nice(value:string) { return value.replace(/_/g,' ').replace(/\b\w/g,c => c.toUpperCase()); }
function show(value:unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function DataTable({rows}:{rows:Record<string,unknown>[]}) {
  if (!rows.length) return <Card className="p-8 text-center text-muted-foreground">No records yet.</Card>;
  const columns = Object.keys(rows[0]).filter(key => !['sections','theme','data'].includes(key)).slice(0,9);
  return <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm">
    <thead className="bg-slate-50"><tr>{columns.map(key=><th key={key} className="whitespace-nowrap px-4 py-3">{nice(key)}</th>)}</tr></thead>
    <tbody>{rows.map((row,index)=><tr key={String(row.id ?? index)} className="border-t">{columns.map(key=><td key={key} className="max-w-64 truncate px-4 py-3" title={show(row[key])}>{show(row[key])}</td>)}</tr>)}</tbody>
  </table></div>;
}
function LeadTable({data,readOnly}:{data:{rows:Lead[];stages:{id:string;name:string}[]};readOnly:boolean}) {
  const queryClient = useQueryClient();
  const [notes,setNotes] = useState<Record<string,string>>({});
  const change = useMutation({mutationFn:(value:{leadId:string;stageId?:string|null;notes?:string}) =>
    apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'change_lead',...value})}),
    onSuccess:() => queryClient.invalidateQueries({queryKey:['portal','leads']})});
  if (!data.rows.length) return <Card className="p-8 text-center text-muted-foreground">No client leads yet.</Card>;
  return <div className="space-y-3">{data.rows.map(lead=><Card key={lead.id} className="p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{lead.first_name} {lead.last_name}</h3>
      <p className="text-sm text-muted-foreground">{[lead.company,lead.phone,lead.email].filter(Boolean).join(' · ')}</p></div>
      <select aria-label={`Stage for ${lead.first_name} ${lead.last_name}`} value={lead.pipeline_stage_id ?? ''}
        disabled={readOnly || change.isPending} onChange={event => change.mutate({leadId:lead.id,stageId:event.target.value || null})}
        className="rounded border px-2 py-1 text-sm"><option value="">No stage</option>{data.stages.map(stage=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></div>
    <div className="mt-3 flex gap-2"><Input aria-label={`Notes for ${lead.first_name} ${lead.last_name}`} value={notes[lead.id] ?? lead.notes ?? ''}
      onChange={event=>setNotes(current=>({...current,[lead.id]:event.target.value}))} disabled={readOnly}/>
      <Button disabled={readOnly || change.isPending || notes[lead.id] === undefined} onClick={()=>change.mutate({leadId:lead.id,notes:notes[lead.id]})}>Save note</Button></div>
  </Card>)}</div>;
}
function PageBuilder({initial,readOnly,onSaved}:{initial?:Page;readOnly:boolean;onSaved:()=>void}) {
  const {data:availableForms}=useQuery<Snapshot>({queryKey:['portal','forms'],
    queryFn:()=>apiFetch('/api/portal?action=snapshot&section=forms')});
  const [draft,setDraft] = useState({id:initial?.id ?? null,title:initial?.name ?? 'New landing page',
    slug:initial?.slug ?? `new-page-${Math.random().toString(36).slice(2,7)}`,status:initial?.status ?? 'draft' as 'draft'|'published',
    seoDescription:initial?.seo_description ?? '',sections:initial?.sections ?? [] as Section[],theme:{...themeDefault,...initial?.theme}});
  const [selected,setSelected] = useState<string|null>(draft.sections[0]?.id ?? null);
  const [prompt,setPrompt] = useState('');
  const [error,setError] = useState('');
  const save = useMutation({mutationFn:() => apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'save_page',...draft})}),
    onSuccess:()=>{setError('');onSaved()},onError:e=>setError(String(e))});
  const generate = useMutation({mutationFn:() => apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'ai_page',prompt,currentSections:draft.sections})}) as Promise<{sections:Section[];theme:Theme;title:string;seoDescription:string}>,
    onSuccess:value=>{setDraft(current=>({...current,...value}));setSelected(value.sections[0]?.id ?? null);setError('')},onError:e=>setError(String(e))});
  const current = draft.sections.find(item=>item.id===selected);
  const patchSection = (patch:Partial<Section>) => setDraft(old=>({...old,sections:old.sections.map(item=>item.id===selected?{...item,...patch}:item)}));
  const move = (index:number,shift:number) => setDraft(old=>{const next=[...old.sections];const [item]=next.splice(index,1);next.splice(index+shift,0,item);return {...old,sections:next}});
  return <div className="space-y-4"><div className="flex items-center gap-2"><Input aria-label="Page title" value={draft.title} disabled={readOnly} onChange={event=>setDraft(old=>({...old,title:event.target.value}))}/>
    <Button disabled={readOnly||save.isPending} onClick={()=>save.mutate()}><Save className="mr-1 h-4 w-4"/>Save</Button>
    <Button variant="outline" disabled={readOnly||save.isPending} onClick={()=>setDraft(old=>({...old,status:old.status==='draft'?'published':'draft'}))}>{draft.status==='draft'?'Set published':'Set draft'}</Button></div>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      <Card className="space-y-3 p-4"><h3 className="font-semibold">Sections</h3>{draft.sections.map((item,index)=><div key={item.id} className={`flex items-center gap-1 rounded border p-1 ${selected===item.id?'border-blue-500':''}`}>
        <button className="flex-1 text-left px-2 text-sm" onClick={()=>setSelected(item.id)}>{nice(item.type)}</button>
        <button aria-label="Move up" disabled={readOnly||index===0} onClick={()=>move(index,-1)}><ArrowUp className="h-3 w-3"/></button>
        <button aria-label="Move down" disabled={readOnly||index===draft.sections.length-1} onClick={()=>move(index,1)}><ArrowDown className="h-3 w-3"/></button></div>)}
        <div className="grid grid-cols-2 gap-1">{sections.map(type=><Button key={type} size="sm" variant="outline" disabled={readOnly} onClick={()=>{const item:Section={id:crypto.randomUUID(),type,heading:`New ${type} section`,body:''};setDraft(old=>({...old,sections:[...old.sections,item]}));setSelected(item.id)}}><Plus className="mr-1 h-3 w-3"/>{nice(type)}</Button>)}</div>
      </Card>
      <div className="overflow-hidden rounded-xl border bg-white"><div className="border-b bg-slate-50 px-4 py-2 text-xs">Live preview</div>
        <div style={{background:draft.theme.background,color:draft.theme.foreground,fontFamily:draft.theme.font==='serif'?'Georgia,serif':'Arial,sans-serif'}}>
          {draft.sections.map(item=><section key={item.id} onClick={()=>setSelected(item.id)} className={`cursor-pointer border-2 p-10 ${selected===item.id?'border-blue-500':'border-transparent'}`}>
            <h2 className="mb-3 text-3xl font-bold">{item.heading}</h2><p>{item.body}</p>
            {item.type==='features'&&<div className="mt-3 grid gap-2 sm:grid-cols-3">{item.items?.map((text,index)=><div key={index} className="rounded border p-3">{text}</div>)}</div>}
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
          <Button variant="outline" disabled={readOnly} onClick={()=>{setDraft(old=>({...old,sections:old.sections.filter(item=>item.id!==selected)}));setSelected(null)}}>Remove section</Button></>}
        <label className="text-xs">Page slug<Input value={draft.slug} disabled={readOnly} onChange={event=>setDraft(old=>({...old,slug:event.target.value}))}/></label>
        <label className="text-xs">SEO description<Textarea value={draft.seoDescription} disabled={readOnly} onChange={event=>setDraft(old=>({...old,seoDescription:event.target.value}))}/></label>
        <div className="grid grid-cols-3 gap-1">{(['background','foreground','accent'] as const).map(key=><label key={key} className="text-xs">{nice(key)}<input type="color" className="block h-9 w-full" value={draft.theme[key]} disabled={readOnly} onChange={event=>setDraft(old=>({...old,theme:{...old.theme,[key]:event.target.value}}))}/></label>)}</div>
        <label className="text-xs">Font<select className="mt-1 w-full rounded border p-2" value={draft.theme.font} disabled={readOnly}
          onChange={event=>setDraft(old=>({...old,theme:{...old.theme,font:event.target.value as Theme['font']}}))}>
          <option value="sans">Sans serif</option><option value="serif">Serif</option></select></label>
        <div className="border-t pt-3"><h3 className="mb-2 flex items-center gap-1 font-semibold"><Sparkles className="h-4 w-4"/>AI page assistant</h3>
          <Textarea aria-label="Page request" placeholder="Describe the page or change you want" value={prompt} disabled={readOnly} onChange={event=>setPrompt(event.target.value)}/>
          <Button className="mt-2" disabled={readOnly||generate.isPending||prompt.trim().length<5} onClick={()=>generate.mutate()}>{generate.isPending?'Creating…':'Create or edit'}</Button></div>
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
    <div className="grid gap-2 sm:grid-cols-2">{['client_portal','client_accounts','landing_page_builder','landing_page_ai','delivery_automation'].map(feature=>{
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
  const invite=useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'invite_staff',name,email})}),
    onSuccess:()=>{setName('');setEmail('')}});
  return <Card className="space-y-3 p-5"><h2 className="font-semibold">Invite client staff</h2>
    <div className="flex flex-wrap gap-2"><Input className="min-w-40 flex-1" aria-label="Staff name" placeholder="Name" value={name} onChange={event=>setName(event.target.value)}/>
      <Input className="min-w-48 flex-1" aria-label="Staff email" type="email" placeholder="Email" value={email} onChange={event=>setEmail(event.target.value)}/>
      <Button disabled={!name||!email||invite.isPending} onClick={()=>invite.mutate()}>Send invite</Button></div>
    {invite.isSuccess&&<p className="text-sm text-green-700">Invitation sent.</p>}
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
  const agency = ['owner','admin','member','viewer','agent','agency_admin','agency_staff'].includes(role);
  const {data:accounts,error:accountsError,isLoading:accountsLoading} = useQuery<Accounts>({queryKey:['portal-accounts'],queryFn:()=>apiFetch('/api/portal?action=accounts'),retry:false});
  const admin = ['owner','admin','agency_admin'].includes(role);
  const {data:closedCompanies} = useQuery<ClosedCompany[]>({queryKey:['portal-closed-companies'],
    queryFn:()=>apiFetch('/api/portal?action=closed_companies'),enabled:admin&&!tab,retry:false});
  const [companyId,setCompanyId] = useState('');
  const [ownerEmail,setOwnerEmail] = useState('');
  const [ownerName,setOwnerName] = useState('');
  const [packageName,setPackageName] = useState('starter');
  const createClient = useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({
    action:'create_client',companyId,package:packageName,ownerEmail,ownerName})}),
    onSuccess:()=>{void queryClient.invalidateQueries({queryKey:['portal-accounts']});void queryClient.invalidateQueries({queryKey:['portal-closed-companies']})}});
  const selectedId = accounts?.selected?.accountId ?? (accounts?.accounts.length===1?accounts.accounts[0].id:null);
  const {data:snapshot,error:pageError,isLoading:pageLoading} = useQuery<Snapshot>({queryKey:['portal',tab,selectedId],queryFn:()=>apiFetch(`/api/portal?action=snapshot&section=${tab}`),enabled:!!tab&&!!selectedId,retry:false});
  const [editing,setEditing] = useState<Page|undefined>();
  const [creating,setCreating] = useState(false);
  useEffect(()=>{setEditing(undefined);setCreating(false)},[tab,selectedId]);
  const billing = useMutation({mutationFn:()=>apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'billing_portal'})}) as Promise<{url:string}>,
    onSuccess:value=>window.location.assign(value.url)});
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
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Client portal</h1><p className="text-sm text-muted-foreground">Leads, calls, pages, reviews, reports, and billing for the selected account.</p></div><AccountSwitcher/></div>
    {admin&&!tab&&<FeatureManager/>}
    {accounts.selected?.viewAsClient&&<div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm"><span>Viewing as client. Changes are disabled.</span><Button size="sm" variant="outline" onClick={()=>void apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'switch',accountId:selectedId,viewAsClient:false})}).then(()=>queryClient.invalidateQueries({queryKey:['portal-accounts']})).then(()=>queryClient.invalidateQueries({queryKey:['portal']}))}>End client view</Button></div>}
    {!tab && admin && <Card className="space-y-3 p-5"><h2 className="font-semibold">Create client from a closed company</h2>
      <div className="grid gap-3 md:grid-cols-4"><select aria-label="Closed company" className="rounded border px-3 py-2 text-sm" value={companyId} onChange={event=>{const id=event.target.value;setCompanyId(id);const company=closedCompanies?.find(item=>item.id===id);setOwnerEmail(company?.email||'');setOwnerName(company?.contact_name||'')}}><option value="">Select company</option>{closedCompanies?.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select>
        <Input aria-label="Owner name" placeholder="Owner name" value={ownerName} onChange={event=>setOwnerName(event.target.value)}/>
        <Input aria-label="Owner email" placeholder="Owner email" type="email" value={ownerEmail} onChange={event=>setOwnerEmail(event.target.value)}/>
        <select aria-label="Package" className="rounded border px-3 py-2 text-sm" value={packageName} onChange={event=>setPackageName(event.target.value)}>{['starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom'].map(value=><option key={value} value={value}>{nice(value)}</option>)}</select></div>
      <Button disabled={!companyId||!ownerEmail||!ownerName||createClient.isPending} onClick={()=>createClient.mutate()}>Create account and send invite</Button>
      {createClient.error&&<p role="alert" className="text-sm text-red-600">{String(createClient.error)}</p>}
      {createClient.isSuccess&&<p className="text-sm text-green-700">Client account created.</p>}
    </Card>}
    {!tab && agency && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{accounts.accounts.map(account=><Card key={account.id} className="space-y-3 p-5"><h2 className="font-semibold">{account.name}</h2><div className="grid grid-cols-2 gap-2 text-sm"><span>Health: {account.health_score}</span><span>Leads this week: {account.leads_this_week}</span><span>Overdue tasks: {account.overdue_tasks}</span><span>Failed payments: {account.failed_payments}</span><span className="col-span-2">Last client login: {account.last_active_at?new Date(account.last_active_at).toLocaleString():'Never'}</span></div><div className="flex gap-2"><Button size="sm" onClick={()=>void apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'switch',accountId:account.id,viewAsClient:false})}).then(()=>queryClient.invalidateQueries({queryKey:['portal-accounts']})).then(()=>navigate('/client-portal/dashboard'))}>Open</Button>{admin&&<Button size="sm" variant="outline" onClick={()=>void viewAs(account.id)}>View as client</Button>}</div></Card>)}</div>}
    {(!tab && !agency) && <p>Select an account to continue.</p>}
    {tab&&<><nav aria-label="Portal pages" className="flex flex-wrap gap-2">{pages.filter(page=>canAccessPath(`/client-portal/${page}`,pagePermissions,role)).map(page=><Link key={page} href={`/client-portal/${page}`} className={`rounded-lg px-3 py-2 text-sm ${tab===page?'bg-blue-600 text-white':'border bg-white'}`}>{nice(page)}</Link>)}</nav>
      {pageLoading?<p>Loading {tab}…</p>:pageError?<Card role="alert" className="p-6">{String(pageError)}</Card>:snapshot&&<>
        {['leads','calls','reviews','reports'].includes(tab)&&<div className="flex justify-end"><Button variant="outline" size="sm" disabled={snapshot.readOnly} onClick={()=>void exportData()}><Download className="mr-1 h-4 w-4"/>Export</Button></div>}
        {tab==='dashboard'&&<div className="grid gap-4 md:grid-cols-3">{Object.entries((snapshot.data||{}) as Record<string,unknown>).filter(([key])=>key!=='account').map(([key,value])=><Card key={key} className="p-5"><p className="text-xs text-muted-foreground">{nice(key)}</p><p className="mt-2 text-2xl font-semibold">{show(value)}</p></Card>)}</div>}
        {tab==='leads'&&<LeadTable data={snapshot.data as {rows:Lead[];stages:{id:string;name:string}[]}} readOnly={snapshot.readOnly||limited}/>}
        {tab==='pages'&&<div className="space-y-4"><Button disabled={snapshot.readOnly} onClick={()=>{setCreating(true);setEditing(undefined)}}><Plus className="mr-1 h-4 w-4"/>New page</Button>{(creating||editing)?<PageBuilder key={editing?.id??'new'} initial={editing} readOnly={snapshot.readOnly} onSaved={()=>{setCreating(false);setEditing(undefined);void queryClient.invalidateQueries({queryKey:['portal','pages']})}}/>:<div className="grid gap-3 md:grid-cols-2">{(snapshot.data as Page[]).map(page=><Card key={page.id} className="p-4"><h3 className="font-semibold">{page.name}</h3><p className="mb-3 text-xs text-muted-foreground">/{page.slug} · {page.status}</p><div className="flex gap-2"><Button size="sm" onClick={()=>setEditing(page)}>Edit</Button>{page.status==='published'&&<a href={`${BASE}/api/public/landing/${page.slug}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="h-4 w-4"/></Button></a>}</div></Card>)}</div>}</div>}
        {tab==='billing'&&<div className="space-y-4"><Button disabled={snapshot.readOnly||billing.isPending} onClick={()=>billing.mutate()}>Manage payments in Stripe</Button>{billing.error&&<p role="alert" className="text-red-600">{String(billing.error)}</p>}<DataTable rows={snapshot.data as Record<string,unknown>[]}/></div>}
        {tab==='settings'&&<div className="space-y-4">{admin&&!snapshot.readOnly?<AccountSettings value={snapshot.data as Record<string,unknown>} onSaved={()=>void queryClient.invalidateQueries({queryKey:['portal','settings']})}/>:<Card className="p-5"><dl className="grid gap-3 md:grid-cols-2">{Object.entries(snapshot.data as Record<string,unknown>).map(([key,value])=><div key={key}><dt className="text-xs text-muted-foreground">{nice(key)}</dt><dd className="text-sm">{show(value)}</dd></div>)}</dl></Card>}{admin&&<StaffAssignments/>}{(admin||role==='client_owner'||role==='client')&&<ClientStaffInvite/>}</div>}
        {['calls','reviews','reports'].includes(tab)&&Object.entries(snapshot.data as Record<string,unknown>).map(([key,value])=><div key={key} className="space-y-2"><h2 className="font-semibold">{nice(key)}</h2><DataTable rows={Array.isArray(value)?value as Record<string,unknown>[]:[]}/></div>)}
        {tab==='forms'&&<DataTable rows={snapshot.data as Record<string,unknown>[]}/>}
      </>}</>}
  </div>;
}
