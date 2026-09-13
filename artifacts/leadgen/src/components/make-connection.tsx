import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function MakeConnection() {
 const [token,setToken]=useState('');
 const status=useQuery<{configured:boolean}>({queryKey:['make-connection'],queryFn:()=>apiFetch('/api/email/settings/make')});
 const connection=useMutation({mutationFn:(method:string)=>apiFetch('/api/email/settings/make',{method}),onSuccess:(data:{token?:string})=>{setToken(data.token??'');void status.refetch();}});
 const base=`${window.location.origin}/api/email/make`;
 return <details className="rounded-xl border bg-white p-4">
  <summary className="cursor-pointer font-semibold">Make connection · {status.data?.configured?'Connected token':'Not connected'}</summary>
  <div className="space-y-3 mt-3 text-sm">
   <p>Build and schedule your scenarios in Make using any of its app triggers, routers, filters, delays, and actions. The CRM editor stores email templates and mailbox choices; Make executes the scenario.</p>
   <div className="flex gap-2"><button className="border rounded px-3 py-2" disabled={connection.isPending} onClick={()=>{if(!status.data?.configured||window.confirm('Replace the Make token? Update every Make HTTP connection using the old token.'))connection.mutate('POST');}}>{status.data?.configured?'Replace token':'Create connection token'}</button>
   {status.data?.configured&&<button className="border rounded px-3 py-2" disabled={connection.isPending} onClick={()=>connection.mutate('DELETE')}>Disconnect Make</button>}</div>
   {token&&<div><p>Copy this token into Make's HTTP credentials. It is shown only now.</p><input aria-label="Make connection token" className="w-full border rounded p-2 font-mono" readOnly type="password" value={token}/><button className="underline" onClick={()=>void navigator.clipboard.writeText(token)}>Copy token</button></div>}
   {(connection.error||status.error)&&<p role="alert" className="text-red-600">{String((connection.error||status.error)?.message)}</p>}
   <p>In Make, add <strong>HTTP → Make a request</strong>, with header <code>Authorization: Bearer YOUR_TOKEN</code> and JSON content type.</p>
   <p className="break-all">Base URL: <code>{base}</code></p>
   <ul className="list-disc pl-5 space-y-1">
    <li><code>GET /catalog</code> lists workflow IDs, steps, and mailboxes.</li>
    <li><code>POST /events/claim</code> with <code>{'{}'}</code> returns up to 20 CRM events. Use an Iterator and filters in Make, then <code>POST /events/ack</code> with the event's <code>id</code> and <code>lease</code> after success. Unacknowledged events retry after 10 minutes.</li>
    <li><code>POST /queue</code> with <code>eventKey, leadId, mailboxId, subject, body</code> queues email. Keep eventKey stable on retries and unique per contact and step.</li>
    <li>To use a saved email step instead, send <code>eventKey, leadId, workflowId, stepIndex</code>. Step numbers start at 0; enable the saved workflow and choose its mailbox first.</li>
    <li>Schedule <code>POST /process</code> with <code>{'{}'}</code> to send one eligible queued email per run, and <code>POST /poll</code> every 5 minutes to check replies. Neither needs a worker token.</li>
   </ul>
   <p>Supported CRM events: contact created, tags/status/stage/disposition changed, call logged, inbound reply and out-of-office. Events start after connecting. External triggers, custom webhooks, and additional nodes are configured in Make.</p>
   <a className="underline" href="https://apps.make.com/http" target="_blank" rel="noreferrer">Make HTTP setup guide</a>
  </div>
 </details>;
}
