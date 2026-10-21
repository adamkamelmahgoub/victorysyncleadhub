import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Copy} from 'lucide-react';
import {apiFetch} from '@/lib/api';

type Config={calendly_configured:boolean;stripe_configured:boolean;calendly_webhook_url:string;stripe_webhook_url:string};
export function SocialAttributionSettings(){
  const qc=useQueryClient(),[secrets,setSecrets]=useState({calendly:'',stripe:''}),[notice,setNotice]=useState('');
  const config=useQuery<Config>({queryKey:['social-attribution-config'],queryFn:()=>apiFetch('/api/social-attribution')});
  const save=useMutation({mutationFn:(provider:'calendly'|'stripe')=>apiFetch('/api/social-attribution',{method:'POST',body:JSON.stringify({provider,signing_secret:secrets[provider]})}),
    onSuccess:(_,provider)=>{setSecrets(value=>({...value,[provider]:''}));setNotice(`${provider==='calendly'?'Calendly':'Stripe'} webhook signing secret saved.`);void qc.invalidateQueries({queryKey:['social-attribution-config']});}});
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"><h2 className="text-lg font-semibold">Booking and revenue attribution</h2>
    <p className="mt-1 text-sm text-muted-foreground">Signed Calendly and Stripe webhooks connect audits and payments to the lead and rep. Paste each endpoint signing secret here. Secrets stay in Supabase Vault.</p>
    {config.isError&&<p role="alert" className="mt-3 text-sm text-destructive">Only the workspace owner can configure attribution.</p>}
    {notice&&<p role="status" className="mt-3 rounded-lg bg-primary/5 p-3 text-sm text-primary">{notice}</p>}
    {save.isError&&<p role="alert" className="mt-3 text-sm text-destructive">{String(save.error)}</p>}
    <div className="mt-5 grid gap-4 xl:grid-cols-2">{(['calendly','stripe'] as const).map(provider=><div key={provider} className="rounded-xl border border-border bg-background p-4"><h3 className="font-semibold capitalize">{provider}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{provider==='calendly'?'Subscribe to invitee.created and invitee.canceled.':'Subscribe to checkout.session.completed, invoice.paid, charge.refunded, and charge.dispute.created.'}</p>
      <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs"><strong>Webhook URL</strong><div className="mt-1 flex items-center gap-2 break-all text-muted-foreground">{config.data?.[`${provider}_webhook_url`]||'Loading'}<button type="button" title={`Copy ${provider} webhook URL`} onClick={()=>void navigator.clipboard.writeText(config.data?.[`${provider}_webhook_url`]||'')}><Copy className="h-4 w-4"/></button></div></div>
      <label className="mt-3 block text-xs font-medium">Signing secret<input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" type="password" autoComplete="new-password" value={secrets[provider]} onChange={event=>setSecrets(current=>({...current,[provider]:event.target.value}))} placeholder={config.data?.[`${provider}_configured`]?'Enter to rotate secret':'Paste endpoint signing secret'}/></label>
      <button className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!secrets[provider]||save.isPending} onClick={()=>save.mutate(provider)}>Save {provider} secret</button>
    </div>)}</div></section>;
}
