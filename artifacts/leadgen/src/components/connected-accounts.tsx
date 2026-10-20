import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Facebook, Instagram, MessageCircle, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type Account={id:string;platform:string;display_platform:string|null;profile_url:string|null;connection_mode:string;label:string;status:string;token_expires_at:string|null;last_webhook_at:string|null;last_error:string|null;daily_new_dm_cap:number;daily_followup_cap:number;warmup_enabled:boolean};
type Config={configured:boolean;app_id:string;graph_version:string;callback_url:string;webhook_url:string};
type ThreadsConfig={configured:boolean;app_id:string;callback_url:string};
const input='mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
const panel='rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6';

export function ConnectedAccounts(){
  const qc=useQueryClient();
  const [appId,setAppId]=useState('');
  const [secret,setSecret]=useState('');
  const [version,setVersion]=useState('v25.0');
  const [verifyToken,setVerifyToken]=useState('');
  const [wabaId,setWabaId]=useState('');
  const [phoneId,setPhoneId]=useState('');
  const [waToken,setWaToken]=useState('');
  const [notice,setNotice]=useState('');
  const [manualPlatform,setManualPlatform]=useState('linkedin');
  const [manualLabel,setManualLabel]=useState('');
  const [manualUrl,setManualUrl]=useState('');
  const [threadsToken,setThreadsToken]=useState('');
  const [threadsAppId,setThreadsAppId]=useState(''),[threadsAppSecret,setThreadsAppSecret]=useState('');
  const config=useQuery<Config>({queryKey:['social-oauth-config'],queryFn:()=>apiFetch('/api/social-oauth')});
  const threadsConfig=useQuery<ThreadsConfig>({queryKey:['social-threads-config'],queryFn:()=>apiFetch('/api/social-threads-oauth')});
  useEffect(()=>{if(config.data){setAppId(config.data.app_id);setVersion(config.data.graph_version);}},[config.data]);
  useEffect(()=>{if(threadsConfig.data)setThreadsAppId(threadsConfig.data.app_id);},[threadsConfig.data]);
  const accounts=useQuery<{accounts:Account[]}>({queryKey:['social-connected-accounts'],queryFn:()=>apiFetch('/api/social-accounts')});
  const refresh=()=>{void qc.invalidateQueries({queryKey:['social-connected-accounts']});void qc.invalidateQueries({queryKey:['social-oauth-config']});};
  const update=useMutation({mutationFn:(data:Record<string,unknown>)=>apiFetch('/api/social-accounts',{method:'PATCH',body:JSON.stringify(data)}),onSuccess:refresh});
  const manual=useMutation({mutationFn:()=>apiFetch('/api/social-accounts',{method:'POST',body:JSON.stringify({platform:manualPlatform,label:manualLabel,profile_url:manualUrl})}),
    onSuccess:()=>{setManualLabel('');setManualUrl('');setNotice('Account added for manual-assisted posting and outreach.');refresh();}});
  const threads=useMutation({mutationFn:()=>apiFetch('/api/social-accounts',{method:'POST',body:JSON.stringify({action:'threads_token',access_token:threadsToken})}),
    onSuccess:()=>{setThreadsToken('');setNotice('Threads account connected for API publishing and insights.');refresh();}});
  const action=useMutation({mutationFn:(data:Record<string,unknown>)=>apiFetch('/api/social-oauth',{method:'POST',body:JSON.stringify(data)}) as Promise<Record<string,string|boolean>>,
    onSuccess:(result,variables)=>{refresh();if(variables.action==='configure'){setVerifyToken(String(result.verify_token||''));setSecret('');setNotice('Meta app saved. Copy the webhook verify token now; it is shown only once.');}
      if(variables.action==='start'&&result.authorization_url)window.location.assign(String(result.authorization_url));
      if(variables.action==='whatsapp'){setWaToken('');setNotice('WhatsApp Business connected.');}}});
  const threadsAction=useMutation({mutationFn:(data:Record<string,unknown>)=>apiFetch('/api/social-threads-oauth',{method:'POST',body:JSON.stringify(data)}) as Promise<Record<string,string|boolean>>,
    onSuccess:(result,variables)=>{if(variables.action==='configure'){setThreadsAppSecret('');setNotice('Threads app saved. Add the callback URL in the Threads developer dashboard.');void qc.invalidateQueries({queryKey:['social-threads-config']});}
      if(variables.action==='start'&&result.authorization_url)window.location.assign(String(result.authorization_url));}});
  return <section className="space-y-5" aria-label="Connected social accounts">
    <div className={panel}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-primary"/>Connected accounts</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Connect business accounts from here. App secrets and account tokens are encrypted in Supabase Vault and never shown to teammates.</p></div></div>
      {new URLSearchParams(window.location.search).get('social_connect')&&<p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Meta returned to Victory Sync. Check the accounts below, then send a test message.</p>}
      {new URLSearchParams(window.location.search).get('threads_connect')&&<p className="mt-4 rounded-xl bg-primary/5 p-3 text-sm text-primary">Threads connection result: {new URLSearchParams(window.location.search).get('threads_connect')?.replaceAll('_',' ')}. Check the account below.</p>}
      {notice&&<p role="status" className="mt-4 rounded-xl bg-primary/5 p-3 text-sm text-primary">{notice}</p>}
      {action.isError&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{String(action.error)}</p>}
      {accounts.isError&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Accounts could not be loaded.</p>}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{accounts.data?.accounts.map((account)=><div key={account.id} className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2">{account.platform==='instagram'?<Instagram className="h-5 w-5 text-pink-600"/>:account.platform==='facebook'?<Facebook className="h-5 w-5 text-blue-600"/>:<MessageCircle className="h-5 w-5 text-emerald-600"/>}<div><strong>{account.label}</strong><div className="text-xs capitalize text-muted-foreground">{account.platform}</div></div></div>
          <span className={`rounded-full px-2.5 py-1 text-xs ${account.status==='active'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{account.status}</span></div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground"><div>{account.connection_mode==='manual'?'Manual-assisted connection':`Webhook: ${account.last_webhook_at?new Date(account.last_webhook_at).toLocaleString():'Waiting for first event'}`}</div><div>Token expiry: {account.connection_mode==='manual'?'No API token':account.token_expires_at?new Date(account.token_expires_at).toLocaleString():'Not reported'}</div></div>
        {account.profile_url&&<a className="mt-2 inline-block text-xs text-primary underline" href={account.profile_url} target="_blank" rel="noreferrer">Open profile</a>}
        {account.last_error&&<p role="alert" className="mt-2 text-xs text-red-700">{account.last_error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-xs"><label>New DMs <input className="ml-1 w-16 rounded-lg border px-2 py-1" type="number" min="0" max="1000" defaultValue={account.daily_new_dm_cap} onBlur={(e)=>update.mutate({id:account.id,action:'caps',daily_new_dm_cap:Number(e.target.value)})}/></label>
          <label>Follow-ups <input className="ml-1 w-16 rounded-lg border px-2 py-1" type="number" min="0" max="1000" defaultValue={account.daily_followup_cap} onBlur={(e)=>update.mutate({id:account.id,action:'caps',daily_followup_cap:Number(e.target.value)})}/></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={account.warmup_enabled} onChange={(e)=>update.mutate({id:account.id,action:'caps',warmup_enabled:e.target.checked})}/> Warmup</label>
          {account.status!=='disconnected'&&<button className="text-red-700 hover:underline" onClick={()=>update.mutate({id:account.id,action:'disconnect'})}>Disconnect</button>}</div>
      </div>)}</div>
      {!accounts.isLoading&&!accounts.data?.accounts.length&&<div className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No accounts connected yet. Add a public profile below or connect Meta.</div>}
    </div>
    <div className={panel}><h3 className="font-semibold">Add any social profile</h3><p className="mt-1 text-sm text-muted-foreground">Use a profile for manual-assisted publishing and outreach on platforms without an approved API connection. Victory Sync will schedule work and track completed posts; it will never log in to a personal account or automate a browser.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium">Platform<select className={input} value={manualPlatform} onChange={e=>setManualPlatform(e.target.value)}>{['linkedin','x','tiktok','threads','youtube','pinterest','bluesky','mastodon','nextdoor','yelp','instagram','facebook','other'].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs font-medium">Account label<input className={input} value={manualLabel} onChange={e=>setManualLabel(e.target.value)} placeholder="Victory Sync"/></label>
        <label className="text-xs font-medium">Public profile URL<input className={input} type="url" value={manualUrl} onChange={e=>setManualUrl(e.target.value)} placeholder="https://..."/></label></div>
      {manual.isError&&<p role="alert" className="mt-3 text-sm text-red-700">{String(manual.error)}</p>}
      <button className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={!manualLabel||!manualUrl||manual.isPending} onClick={()=>manual.mutate()}>Add profile</button>
    </div>
    <div className={panel}><h3 className="font-semibold">Threads API</h3><p className="mt-1 text-sm text-muted-foreground">Authorize your Threads account to schedule text, image, or video posts and read supported post insights. Enter your Threads app credentials here once; no server environment variables are needed.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Threads App ID<input className={input} value={threadsAppId} onChange={e=>setThreadsAppId(e.target.value)} inputMode="numeric"/></label><label className="text-xs font-medium">Threads App Secret<input className={input} type="password" autoComplete="new-password" value={threadsAppSecret} onChange={e=>setThreadsAppSecret(e.target.value)} placeholder={threadsConfig.data?.configured?'Enter to rotate secret':'Paste app secret'}/></label></div>
      <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs"><strong>OAuth callback</strong><div className="mt-1 flex items-center gap-2 break-all text-muted-foreground">{threadsConfig.data?.callback_url||'Loading…'}<button type="button" title="Copy Threads callback" onClick={()=>void navigator.clipboard.writeText(threadsConfig.data?.callback_url||'')}><Copy className="h-4 w-4"/></button></div></div>
      {threadsAction.isError&&<p role="alert" className="mt-2 text-sm text-destructive">{String(threadsAction.error)}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={!threadsAppId||!threadsAppSecret||threadsAction.isPending} onClick={()=>threadsAction.mutate({action:'configure',app_id:threadsAppId,app_secret:threadsAppSecret})}>Save Threads app</button><button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!threadsConfig.data?.configured||threadsAction.isPending} onClick={()=>threadsAction.mutate({action:'start'})}>Connect Threads <ExternalLink className="ml-1 inline h-4 w-4"/></button></div>
      <details className="mt-5 border-t border-border pt-4 text-sm"><summary className="cursor-pointer font-medium">Connect with an existing long-lived token</summary><p className="mt-2 text-xs text-muted-foreground">For an account you have already authorized in another tool. The token stays in Supabase Vault.</p><label className="mt-3 block text-xs font-medium">Threads user access token<input className={input} type="password" autoComplete="new-password" value={threadsToken} onChange={e=>setThreadsToken(e.target.value)}/></label>
      {threads.isError&&<p role="alert" className="mt-2 text-sm text-red-700">{String(threads.error)}</p>}
      <button className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={!threadsToken||threads.isPending} onClick={()=>threads.mutate()}>Save token</button></details>
    </div>
    {config.data?.configured!==undefined&&<div className="grid gap-5 xl:grid-cols-2"><div className={panel}><h3 className="flex items-center gap-2 font-semibold"><Facebook className="h-5 w-5 text-blue-600"/><Instagram className="h-5 w-5 text-pink-600"/>Facebook Pages and Instagram</h3>
      <p className="mt-2 text-sm text-muted-foreground">Enter your Meta developer app once, then authorize your Pages through Facebook Login. Linked Professional Instagram accounts are discovered automatically.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Meta App ID<input className={input} value={appId} onChange={(e)=>setAppId(e.target.value)} inputMode="numeric"/></label><label className="text-xs font-medium">Graph API version<input className={input} value={version} onChange={(e)=>setVersion(e.target.value)}/></label></div>
      <label className="mt-3 block text-xs font-medium">Meta App Secret<input className={input} type="password" autoComplete="new-password" value={secret} onChange={(e)=>setSecret(e.target.value)} placeholder={config.data?.configured?'Enter to rotate app secret':'Paste app secret'}/></label>
      <div className="mt-4 space-y-2 rounded-xl bg-muted/50 p-3 text-xs">{[['OAuth callback',config.data?.callback_url],['Webhook callback',config.data?.webhook_url],...(verifyToken?[['Webhook verify token — copy now',verifyToken]]:[])].map(([label,value])=><div key={label}><strong>{label}</strong><div className="mt-1 flex items-center gap-2 break-all text-muted-foreground">{value||'Loading…'}<button title={`Copy ${label}`} onClick={()=>void navigator.clipboard.writeText(value||'')}><Copy className="h-4 w-4"/></button></div></div>)}</div>
      <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={action.isPending||!secret} onClick={()=>action.mutate({action:'configure',app_id:appId,app_secret:secret,graph_version:version})}>Save app setup</button>
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!config.data?.configured||action.isPending} onClick={()=>action.mutate({action:'start'})}>Connect with Facebook <ExternalLink className="ml-1 inline h-4 w-4"/></button></div>
      <p className="mt-3 text-xs text-muted-foreground">Add both callback URLs in the Meta developer dashboard before connecting. Use a Professional Instagram account linked to a Page.</p></div>
      <div className={panel}><h3 className="flex items-center gap-2 font-semibold"><MessageCircle className="h-5 w-5 text-emerald-600"/>WhatsApp Business</h3><p className="mt-2 text-sm text-muted-foreground">Connect an approved Cloud API business number. This app sends only replies inside the customer support window.</p>
        <div className="mt-4 space-y-3"><label className="block text-xs font-medium">WABA ID<input className={input} value={wabaId} onChange={(e)=>setWabaId(e.target.value)} inputMode="numeric"/></label><label className="block text-xs font-medium">Phone Number ID<input className={input} value={phoneId} onChange={(e)=>setPhoneId(e.target.value)} inputMode="numeric"/></label>
          <label className="block text-xs font-medium">Cloud API access token<input className={input} type="password" autoComplete="new-password" value={waToken} onChange={(e)=>setWaToken(e.target.value)}/></label></div>
        <button className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!config.data?.configured||!wabaId||!phoneId||!waToken||action.isPending} onClick={()=>action.mutate({action:'whatsapp',waba_id:wabaId,phone_number_id:phoneId,access_token:waToken})}>Connect WhatsApp Business</button>
      </div></div>}
  </section>;
}
