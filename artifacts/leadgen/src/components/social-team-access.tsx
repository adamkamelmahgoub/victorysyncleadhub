import { useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Member={id:string;name:string;email:string;role:string;status:string;permissions:string[]};
const labels:Record<string,string>={inbox_view:'View inbox',inbox_reply:'Reply to DMs',queue_work:'Work DM queue',campaign_manage:'Manage DM campaigns',
  socials_manage:'Edit social profiles',accounts_manage:'Manage account caps',posts_create:'Create posts',posts_publish:'Publish posts',reports_view:'View reports',mcp_use:'Use social MCP'};
export function SocialTeamAccess(){
  const {role}=useAuth(),qc=useQueryClient();
  const [edits,setEdits]=useState<Record<string,string[]>>({});
  const owner=role==='owner'||role==='admin';
  const access=useQuery<{members:Member[];available:string[]}>({queryKey:['social-team-access'],queryFn:()=>apiFetch('/api/social-access'),enabled:owner});
  const save=useMutation({mutationFn:(input:{id:string;permissions:string[]})=>apiFetch('/api/social-access',{method:'PATCH',body:JSON.stringify({team_member_id:input.id,permissions:input.permissions})}),
    onSuccess:()=>void qc.invalidateQueries({queryKey:['social-team-access']})});
  if(!owner)return null;
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="h-5 w-5 text-primary"/>Social workspace access</h2>
    <p className="mt-1 text-sm text-muted-foreground">Cold outreach belongs to your internal team. Choose exactly what each member can do; client and viewer accounts are excluded.</p></div></div>
    <div className="mt-4 space-y-3">{access.data?.members.filter((member)=>member.role!=='owner').map((member)=>{
      const selected=edits[member.id]??member.permissions;
      return <div key={member.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">{member.name}</strong><span className="ml-2 text-xs capitalize text-muted-foreground">{member.role} · {member.status}</span><div className="text-xs text-muted-foreground">{member.email}</div></div>
        <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50" disabled={save.isPending||member.status!=='active'||!edits[member.id]} onClick={()=>save.mutate({id:member.id,permissions:selected})}>Save access</button></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{access.data?.available.map((permission)=><label key={permission} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(permission)} disabled={member.status!=='active'} onChange={(e)=>setEdits((before)=>({...before,[member.id]:e.target.checked?[...selected,permission]:selected.filter((value)=>value!==permission)}))}/>{labels[permission]||permission}</label>)}</div></div>;
    })}</div>
    {access.isError&&<p className="mt-3 text-sm text-muted-foreground">Only the organization owner can edit social access.</p>}
    {save.isError&&<p role="alert" className="mt-3 text-sm text-red-700">{String(save.error)}</p>}
  </section>;
}
