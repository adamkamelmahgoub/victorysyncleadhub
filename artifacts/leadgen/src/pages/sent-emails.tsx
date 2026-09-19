import { PageTitle, PageDescription } from "@/components/page-layout";
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'wouter';
import {Mail,Search} from 'lucide-react';
import {apiFetch} from '@/lib/api';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
type EmailRow={id:string;leadId?:string;recipientEmail:string;recipientName?:string;company?:string;fromEmail:string;subject:string;body:string;sentAt:string;campaignId?:string;campaignName?:string};
type Result={items:EmailRow[];total:number};
const PAGE=100;
export default function SentEmails(){
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0);
 const {data,isLoading,error}=useQuery<Result>({queryKey:['sent-emails',search,offset],queryFn:()=>apiFetch(`/email/sent?query=${encodeURIComponent(search)}&limit=${PAGE}&offset=${offset}`)});
 const items=data?.items??[];
 return <div className="page-stack">
  <header><PageTitle>Sent emails</PageTitle><PageDescription>Every email successfully accepted by a sending provider.</PageDescription></header>
  <form className="flex max-w-xl gap-2" onSubmit={e=>{e.preventDefault();setOffset(0);setSearch(query.trim());}}><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search recipient, subject, sender, company, or campaign"/></div><Button type="submit">Search</Button></form>
  {isLoading?<p>Loading sent emails...</p>:error?<p className="text-red-600" role="alert">{error.message}</p>:<div className="overflow-auto workspace-panel"><table className="workspace-table w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">Sent</th><th>Recipient</th><th>From</th><th>Subject</th><th>Campaign</th><th>Message</th></tr></thead><tbody>{items.map(row=><tr className="border-b align-top" key={row.id}><td className="p-3 whitespace-nowrap">{new Date(row.sentAt).toLocaleString()}</td><td>{row.leadId?<Link className="underline" href={`/leads/${row.leadId}`}>{row.recipientName||row.recipientEmail}</Link>:row.recipientEmail}<div className="text-xs text-muted-foreground">{row.recipientEmail}{row.company?` · ${row.company}`:''}</div></td><td>{row.fromEmail}</td><td className="max-w-64 font-medium">{row.subject}</td><td>{row.campaignName??'Individual / sequence'}</td><td className="max-w-80 whitespace-pre-wrap text-xs text-muted-foreground">{row.body.length>240?`${row.body.slice(0,240)}...`:row.body}</td></tr>)}</tbody></table>{!items.length&&<div className="p-10 text-center text-muted-foreground"><Mail className="mx-auto mb-2 h-7 w-7"/>No sent emails found.</div>}</div>}
  <div className="flex items-center justify-between text-sm"><span>{data?.total??0} sent emails</span><div className="flex gap-2"><Button variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-PAGE))}>Previous</Button><Button variant="outline" disabled={offset+PAGE>=(data?.total??0)} onClick={()=>setOffset(offset+PAGE)}>Next</Button></div></div>
 </div>;
}
