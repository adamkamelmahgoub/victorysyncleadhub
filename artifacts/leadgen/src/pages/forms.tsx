import {useState} from "react";
import {Link, useLocation} from "wouter";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {FileText,Plus,Copy,ExternalLink,Archive,ArrowRight} from "lucide-react";
import {PageTitle,PageDescription} from "@/components/page-layout";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Badge} from "@/components/ui/badge";
import {apiFetch} from "@/lib/api";
import {useToast} from "@/hooks/use-toast";

type Form={id:string;name:string;description:string|null;status:string;slug:string;publicUrl:string;embedCode:string;submissionCount:number;fields:unknown[];updatedAt:string};
export default function Forms(){
  const [open,setOpen]=useState(false),[name,setName]=useState(""),[description,setDescription]=useState("");
  const [,navigate]=useLocation(),queryClient=useQueryClient(),{toast}=useToast();
  const list=useQuery({queryKey:["marketing-forms"],queryFn:()=>apiFetch("/api/forms") as Promise<Form[]>});
  const create=useMutation({mutationFn:()=>apiFetch("/api/forms",{method:"POST",body:JSON.stringify({name,description,status:"inactive",fields:[]})}) as Promise<Form>,onSuccess:(form)=>{queryClient.invalidateQueries({queryKey:["marketing-forms"]});setOpen(false);setName("");setDescription("");navigate(`/forms/${form.id}`);},onError:(error)=>toast({title:"Could not create form",description:error.message,variant:"destructive"})});
  const archive=useMutation({mutationFn:(id:string)=>apiFetch(`/api/forms/${id}`,{method:"DELETE"}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:["marketing-forms"]});toast({title:"Form deactivated"});},onError:(error)=>toast({title:"Could not deactivate form",description:error.message,variant:"destructive"})});
  const copy=async(value:string)=>{await navigator.clipboard.writeText(value);toast({title:"Copied to clipboard"});};
  return <div className="page-stack">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><PageTitle>Forms</PageTitle><PageDescription>Capture leads from your pages or any website.</PageDescription></div><div className="flex gap-2"><Link href="/landing-pages"><Button variant="outline">Landing pages</Button></Link><Button onClick={()=>setOpen(true)}><Plus className="mr-2 h-4 w-4"/>New form</Button></div></div>
    {list.isError&&<Card className="p-5 text-destructive">Could not load forms: {list.error.message} <Button variant="outline" size="sm" onClick={()=>list.refetch()}>Retry</Button></Card>}
    {list.isPending&&<Card className="p-8 text-muted-foreground">Loading forms…</Card>}
    {list.isSuccess&&list.data.length===0&&<Card className="p-12 text-center"><FileText className="mx-auto mb-3 h-9 w-9 text-muted-foreground"/><h2 className="font-semibold">Create your first form</h2><p className="mt-1 text-sm text-muted-foreground">Add fields, publish it, and share the link or embed code.</p><Button className="mt-4" onClick={()=>setOpen(true)}>New form</Button></Card>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.data?.map(form=><Card key={form.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Badge variant="outline">{form.status}</Badge><h2 className="mt-2 truncate font-semibold">{form.name}</h2><p className="mt-1 text-sm text-muted-foreground line-clamp-2">{form.description||"No description"}</p></div><FileText className="h-5 w-5 text-muted-foreground"/></div><div className="my-5 flex gap-8 border-y py-3 text-sm"><div><b>{form.submissionCount}</b><span className="block text-muted-foreground">Submissions</span></div><div><b>{form.fields.length}</b><span className="block text-muted-foreground">Fields</span></div></div><div className="flex flex-wrap gap-2"><Link href={`/forms/${form.id}`}><Button size="sm">Edit <ArrowRight className="ml-1 h-3 w-3"/></Button></Link><Button variant="outline" size="sm" onClick={()=>copy(form.embedCode)}><Copy className="mr-1 h-3 w-3"/>Embed</Button>{form.status==="active"&&<a href={form.publicUrl} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><ExternalLink className="mr-1 h-3 w-3"/>Open</Button></a>}{form.status==="active"&&<Button variant="ghost" size="sm" onClick={()=>archive.mutate(form.id)}><Archive className="h-3 w-3"/><span className="sr-only">Deactivate {form.name}</span></Button>}</div></Card>)}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>New form</DialogTitle></DialogHeader><div className="space-y-3"><Input aria-label="Form name" placeholder="Form name" value={name} onChange={event=>setName(event.target.value)}/><Textarea aria-label="Description" placeholder="Description (optional)" value={description} onChange={event=>setDescription(event.target.value)}/><p className="text-xs text-muted-foreground">Forms begin inactive. Add fields, then publish.</p><Button disabled={!name.trim()||create.isPending} onClick={()=>create.mutate()}>{create.isPending?"Creating…":"Create form"}</Button></div></DialogContent></Dialog>
  </div>;
}
