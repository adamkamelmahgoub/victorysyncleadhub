import { workspaceButton } from "@/components/page-layout";
import { PageTitle, PageDescription } from "@/components/page-layout";
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Link} from 'wouter';
import {apiFetch} from '@/lib/api';
import {useToast} from '@/hooks/use-toast';
type Row={lead_id:string;first_name:string;last_name:string;email:string;company:string|null;unsubscribed_at:string};
const button = workspaceButton;
export default function EmailUnsubscribes(){
 const cache=useQueryClient(),{toast}=useToast();const {data=[],isLoading,error}=useQuery<Row[]>({queryKey:['email-unsubscribes'],queryFn:()=>apiFetch('/email/unsubscribes')});
 const restore=useMutation({mutationFn:(id:string)=>apiFetch(`/email/unsubscribes/${id}/reenroll`,{method:'POST',body:'{}'}),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['email-unsubscribes']});toast({title:'Contact eligible for outreach again',description:'You can now enroll this contact in a campaign or sequence.'});}});
 if(isLoading)return <main className="p-6">Loading unsubscribed contacts…</main>;if(error)return <main className="p-6 text-red-600" role="alert">{error.message}</main>;
 return <div className="page-stack"><header><PageTitle>Unsubscribed contacts</PageTitle><PageDescription>Contacts who opted out of email outreach. Re-enroll removes an unsubscribe suppression and records the operator action in the audit log.</PageDescription></header>
  <div className="overflow-auto workspace-panel"><table className="workspace-table w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Contact</th><th>Email</th><th>Company</th><th>Unsubscribed</th><th/></tr></thead><tbody>{data.map(row=><tr className="border-b" key={row.lead_id}><td className="p-3"><Link className="underline" href={`/leads/${row.lead_id}`}>{row.first_name} {row.last_name}</Link></td><td>{row.email}</td><td>{row.company??'–'}</td><td>{new Date(row.unsubscribed_at).toLocaleString()}</td><td><button className={button} disabled={restore.isPending} onClick={()=>restore.mutate(row.lead_id)}>Re-enroll</button></td></tr>)}</tbody></table>{!data.length&&<p className="p-6 text-sm text-muted-foreground">No unsubscribed contacts.</p>}</div>
  <p className="text-xs text-muted-foreground">DNC, hard-bounce, and manual exclusions cannot be restored from this page.</p></div>;
}
