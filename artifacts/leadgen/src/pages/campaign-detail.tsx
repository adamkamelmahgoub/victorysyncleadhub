import { useParams, Link } from "wouter";
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {apiFetch} from '@/lib/api';
import {allCampaignContacts,addCampaignContacts,type CampaignContact} from '@/lib/campaign-membership';

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, CheckCircle2, TrendingUp, ExternalLink } from "lucide-react";


const STATUS_COLORS: Record<string, string> = {
  new: "hsl(185 100% 50%)",
  contacted: "hsl(280 85% 60%)",
  qualified: "hsl(40 90% 60%)",
  proposal: "hsl(140 70% 50%)",
  converted: "hsl(140 70% 45%)",
  lost: "hsl(350 85% 60%)",
};

export default function CampaignDetail() {
  const {id=''}=useParams<{id:string}>();
  const cache=useQueryClient();
  const {data:campaign,isLoading,error}=useQuery<{id:string|number;name:string;description?:string;status:string}>({queryKey:['campaign',id],enabled:!!id,queryFn:()=>apiFetch('/campaigns/'+encodeURIComponent(id))});
  const {data:leadsData,isLoading:leadsLoading,error:membersError}=useQuery<{leads:CampaignContact[];total:number}>({queryKey:['campaign-members',id],enabled:!!id,queryFn:()=>apiFetch('/campaigns/'+encodeURIComponent(id)+'/leads')});
  const leads=leadsData?.leads??[];
  const leadCount=leadsData?.total??0;
  const convertedCount=leads.filter(l=>l.status==='converted').length;
  const convRate=leadCount?Math.round(convertedCount/leadCount*100):0;
  const [adding,setAdding]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState<Array<string|number>>([]),[visible,setVisible]=useState(100),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[progress,setProgress]=useState(0);
  const {data:contacts,isFetching:loadingContacts,error:contactsError}=useQuery({queryKey:['campaign-all-contacts'],enabled:adding,queryFn:({signal})=>allCampaignContacts(apiFetch,signal)});
  const members=new Set(leads.map(l=>String(l.id)));
  const available=(contacts?.leads??[]).filter(l=>!members.has(String(l.id))&&[l.firstName,l.lastName,l.email,l.company].join(' ').toLowerCase().includes(search.toLowerCase()));
  async function addSelected(){setSaving(true);setSaveError('');try{await addCampaignContacts(apiFetch,id,selected,setProgress);setSelected([]);setAdding(false);await cache.invalidateQueries({queryKey:['campaign-members',id]});await cache.invalidateQueries({queryKey:['/api/campaigns']});}catch(e){setSaveError(e instanceof Error?e.message:'Could not add contacts');}finally{setSaving(false);}}

  if (isLoading) {
    return (

        <div className="space-y-5">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>

    );
  }

  if (!campaign) {
    return <div className="text-center py-20 text-muted-foreground">{error?.message??'Campaign not found.'}</div>;
  }

  return (

      <div className="space-y-5">
        <div className="flex items-center gap-3">
            <Link href="/campaigns">
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">{campaign.name}</h1>
            {campaign.description && <p className="text-xs text-muted-foreground mt-0.5">{campaign.description}</p>}
          </div>
          <Badge variant="outline" className="ml-auto capitalize" style={{ borderColor: campaign.status === "active" ? "hsl(140 70% 50% / 0.5)" : "hsl(40 90% 60% / 0.5)", color: campaign.status === "active" ? "hsl(140 70% 50%)" : "hsl(40 90% 60%)" }}>
            {campaign.status}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Leads", value: leadCount, icon: Users },
            { label: "Converted", value: convertedCount, icon: CheckCircle2 },
            { label: "Conv. Rate", value: `${convRate}%`, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="p-4 border border-border bg-card flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Leads in Campaign</p><Button className="mt-2" onClick={()=>setAdding(!adding)}>{adding?'Close':'Add leads'}</Button>{membersError&&<p role="alert">{membersError.message}</p>}
            {adding&&<div className="mt-3 space-y-2"><input className="rounded border bg-background p-2" aria-label="Search contacts" placeholder="Search contacts" value={search} onChange={e=>{setSearch(e.target.value);setVisible(100);}}/><Button variant="outline" disabled={loadingContacts} onClick={()=>setSelected([...new Set([...selected,...available.map(l=>l.id)])])}>Select all {available.length} matching leads</Button><Button variant="outline" onClick={()=>setSelected([])}>Clear selection</Button><p>{selected.length} selected</p>{loadingContacts&&<p>Loading all contacts...</p>}{contactsError&&<p role="alert">{contactsError.message}</p>}<div className="max-h-72 overflow-y-auto">{available.slice(0,visible).map(l=><label key={l.id} className="flex gap-2 py-2"><input type="checkbox" checked={selected.includes(l.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,l.id]:ids.filter(id=>id!==l.id))}/>{l.firstName} {l.lastName} - {l.email}</label>)}</div>{available.length>visible&&<Button variant="outline" onClick={()=>setVisible(n=>n+100)}>Show more</Button>}<Button disabled={saving||!selected.length} onClick={addSelected}>{saving?'Adding '+progress+' / '+selected.length:'Add selected leads'}</Button>{saveError&&<p role="alert">{saveError} Retry to continue; existing campaign members are preserved.</p>}</div>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leadsLoading && [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={5} className="px-5 py-3"><Skeleton className="h-8 w-full" /></td></tr>
                ))}
                {!leadsLoading && leads.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No leads in this campaign</td></tr>
                )}
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {lead.firstName?.[0]}{lead.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs text-muted-foreground">{lead.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.company ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs capitalize" style={{ borderColor: (STATUS_COLORS[lead.status] ?? "hsl(215 20% 65%)") + "60", color: STATUS_COLORS[lead.status] }}>
                        {lead.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-primary">{lead.score}</span>
                    </td>
                    <td className="px-4 py-3">
                        <Link href={`/leads/${lead.id}`}>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

  );
}
