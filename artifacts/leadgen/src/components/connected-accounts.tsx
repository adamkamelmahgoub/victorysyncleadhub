import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
type Account={id:string;platform:string;label:string;external_account_id:string|null;status:string;token_expires_at:string|null;last_webhook_at:string|null;last_error:string|null;daily_new_dm_cap:number;daily_followup_cap:number;warmup_enabled:boolean};
export function ConnectedAccounts(){const qc=useQueryClient();const key=['social-connected-accounts'];
  const accounts=useQuery<{accounts:Account[]}>({queryKey:key,queryFn:()=>apiFetch('/api/social-accounts')});
  const update=useMutation({mutationFn:(data:Record<string,unknown>)=>apiFetch('/api/social-accounts',{method:'PATCH',body:JSON.stringify(data)}),onSuccess:()=>void qc.invalidateQueries({queryKey:key})});
  return <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Connected Accounts</h2>
    <p className="mt-1 text-sm text-muted-foreground">Business messaging accounts. Tokens stay on the server; setup is described in SETUP.md.</p>
    {accounts.isLoading&&<p className="mt-3 text-sm">Loading accounts…</p>}
    {accounts.isError&&<p role="alert" className="mt-3 text-sm text-destructive">Could not load accounts.</p>}
    <div className="mt-4 space-y-3">{accounts.data?.accounts.map((account)=><div key={account.id} className="rounded border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><strong>{account.label}</strong><span className="capitalize text-muted-foreground">{account.platform}</span><span className={account.status==='active'?'text-emerald-700':'text-amber-700'}>{account.status}</span></div>
      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><span>Last webhook: {account.last_webhook_at?new Date(account.last_webhook_at).toLocaleString():'Never'}</span><span>Token expiry: {account.token_expires_at?new Date(account.token_expires_at).toLocaleString():'Unknown'}</span></div>
      {account.last_error&&<p role="alert" className="mt-2 text-xs text-destructive">{account.last_error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3"><label>New DM cap <input aria-label={`New DM cap for ${account.label}`} className="ml-1 w-16 rounded border px-1 py-1" type="number" min="0" max="1000" defaultValue={account.daily_new_dm_cap} onBlur={(e)=>update.mutate({id:account.id,action:'caps',daily_new_dm_cap:Number(e.target.value)})}/></label>
        <label>Reply cap <input aria-label={`Reply cap for ${account.label}`} className="ml-1 w-16 rounded border px-1 py-1" type="number" min="0" max="1000" defaultValue={account.daily_followup_cap} onBlur={(e)=>update.mutate({id:account.id,action:'caps',daily_followup_cap:Number(e.target.value)})}/></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={account.warmup_enabled} onChange={(e)=>update.mutate({id:account.id,action:'caps',warmup_enabled:e.target.checked})}/> Warmup</label>
        {account.status!=='disconnected'&&<button className="rounded border px-2 py-1 text-destructive" onClick={()=>update.mutate({id:account.id,action:'disconnect'})}>Disconnect</button>}
      </div>
    </div>)}</div>
    {!accounts.isLoading&&!accounts.data?.accounts.length&&<p className="mt-3 text-sm text-muted-foreground">No accounts connected.</p>}
    {update.isError&&<p role="alert" className="mt-3 text-sm text-destructive">{String(update.error)}</p>}
  </section>;
}
