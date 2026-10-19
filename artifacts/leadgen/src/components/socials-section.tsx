import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clipboard, ExternalLink, Plus, Search, Star, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type Profile = { id:string; platform:string; handle:string; profile_url:string|null; is_primary:boolean; verified:boolean; confidence:number; source:string };
const options = ['instagram','facebook','linkedin_person','linkedin_company','x','tiktok','youtube','threads','whatsapp','yelp','nextdoor','angi','other'];
export function SocialsSection({ entityType, entityId, readOnly = false }: { entityType:'lead'|'contact'|'company'; entityId:string; readOnly?:boolean }) {
  const queryClient = useQueryClient();
  const [platform,setPlatform] = useState('instagram');
  const [handle,setHandle] = useState('');
  const [error,setError] = useState('');
  const [copied,setCopied] = useState<string|null>(null);
  const path = `/api/social?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`;
  const key = ['social-profiles',entityType,entityId];
  const profiles = useQuery<{profiles:Profile[]}>({queryKey:key,queryFn:()=>apiFetch(path)});
  const change = useMutation({mutationFn:async ({method,payload}:{method:'POST'|'PATCH'|'DELETE';payload:Record<string,unknown>})=>
    apiFetch(path,{method,body:JSON.stringify(payload)}),
    onSuccess:()=>{setError('');setHandle('');void queryClient.invalidateQueries({queryKey:key});},
    onError:(reason)=>setError(String(reason))});
  async function copy(value:string) { await navigator.clipboard.writeText(value);setCopied(value);window.setTimeout(()=>setCopied(null),1500); }
  return <section className="rounded-xl border bg-card p-4" aria-label="Social profiles">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Socials</h2>
      {!readOnly && <button className="flex items-center gap-1 rounded border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={change.isPending}
        onClick={()=>change.mutate({method:'POST',payload:{action:'find'}})}><Search className="h-4 w-4"/> Find socials</button>}
    </div>
    {profiles.isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading profiles…</p>}
    {profiles.isError && <p role="alert" className="mt-2 text-sm text-destructive">Could not load social profiles.</p>}
    <div className="mt-3 space-y-2">{profiles.data?.profiles.map((profile)=><div key={profile.id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
      <span className="min-w-24 capitalize">{profile.platform.replace('_',' ')}</span>
      <a href={profile.profile_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-primary hover:underline"><ExternalLink className="h-3 w-3"/> @{profile.handle}</a>
      {profile.verified && <span title="Verified in CRM" className="flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3"/> Verified</span>}
      {profile.is_primary && <span className="text-amber-700">Primary</span>}
      {profile.confidence < 70 && <span className="text-amber-700">Review ({profile.confidence}%)</span>}
      <div className="ml-auto flex items-center gap-1">
        <button aria-label={`Copy ${profile.platform} handle`} title="Copy handle" className="rounded p-2 hover:bg-muted" onClick={()=>void copy(profile.handle)}>{copied===profile.handle?<Check className="h-4 w-4"/>:<Clipboard className="h-4 w-4"/>}</button>
        {!readOnly && !profile.is_primary && profile.confidence>=70 && <button aria-label="Set primary" title="Set primary" className="rounded p-2 hover:bg-muted" onClick={()=>change.mutate({method:'PATCH',payload:{profile_id:profile.id,is_primary:true}})}><Star className="h-4 w-4"/></button>}
        {!readOnly && !profile.verified && <button aria-label="Mark verified" title="Mark verified" className="rounded p-2 hover:bg-muted" onClick={()=>change.mutate({method:'PATCH',payload:{profile_id:profile.id,verified:true}})}><Check className="h-4 w-4"/></button>}
        {!readOnly && <button aria-label="Remove profile" title="Remove profile" className="rounded p-2 text-destructive hover:bg-muted" onClick={()=>change.mutate({method:'DELETE',payload:{profile_id:profile.id}})}><Trash2 className="h-4 w-4"/></button>}
      </div>
    </div>)}</div>
    {!profiles.isLoading && !profiles.data?.profiles.length && <p className="mt-2 text-sm text-muted-foreground">No social profiles saved.</p>}
    {!readOnly && <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event)=>{event.preventDefault();change.mutate({method:'POST',payload:{platform,handle}});}}>
      <select aria-label="Social platform" className="rounded border bg-background px-2 py-2 text-sm" value={platform} onChange={(event)=>setPlatform(event.target.value)}>{options.map((item)=><option key={item} value={item}>{item.replace('_',' ')}</option>)}</select>
      <input aria-label="Handle or profile URL" className="min-w-44 flex-1 rounded border bg-background px-3 py-2 text-sm" value={handle} onChange={(event)=>setHandle(event.target.value)} placeholder="@handle or profile URL"/>
      <button className="flex items-center gap-1 rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={!handle.trim()||change.isPending}><Plus className="h-4 w-4"/> Add</button>
    </form>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </section>;
}
