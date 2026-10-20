import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/page-layout';

type Profile={id:string;entity_type:string;entity_id:string;platform:string;handle:string;profile_url:string|null;confidence:number;source:string};
export default function SocialReview(){
  const qc=useQueryClient();
  const query=useQuery<{profiles:Profile[]}>({queryKey:['social-review'],queryFn:()=>apiFetch('/api/social-review')});
  const review=useMutation({mutationFn:(input:{profile_id:string;action:'approve'|'reject'})=>apiFetch('/api/social-review',{method:'POST',body:JSON.stringify(input)}),
    onSuccess:()=>{void qc.invalidateQueries({queryKey:['social-review']});}});
  return <div className="page-stack"><PageHeader title="Review socials" description="Check profiles with less than 70% confidence before using them for outreach."/>
    {query.isLoading&&<p className="text-sm text-muted-foreground">Loading review queue…</p>}
    {query.isError&&<p role="alert" className="text-sm text-destructive">Could not load social profiles.</p>}
    {review.isError&&<p role="alert" className="text-sm text-destructive">{String(review.error)}</p>}
    <div className="space-y-2">{query.data?.profiles.map((profile)=><div key={profile.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-sm">
      <div className="min-w-0 flex-1"><strong className="capitalize">{profile.platform.replace('_',' ')}</strong> · @{profile.handle}
        <p className="text-muted-foreground">{profile.entity_type} · {profile.confidence}% · {profile.source}</p>
        <a className="text-primary underline" href={profile.profile_url||'#'} target="_blank" rel="noopener noreferrer">Open profile</a>
        <a className="ml-3 text-primary underline" href={profile.entity_type==='lead'?`/leads/${profile.entity_id}`:profile.entity_type==='company'?`/companies/${profile.entity_id}`:'/leads'}>Open CRM record</a>
      </div>
      <button className="rounded border px-3 py-2" disabled={review.isPending} onClick={()=>review.mutate({profile_id:profile.id,action:'reject'})}>Reject</button>
      <button className="rounded bg-primary px-3 py-2 text-primary-foreground" disabled={review.isPending} onClick={()=>review.mutate({profile_id:profile.id,action:'approve'})}>Approve</button>
    </div>)}</div>
    {!query.isLoading&&!query.data?.profiles.length&&<p className="text-sm text-muted-foreground">No profiles need review.</p>}
  </div>;
}
