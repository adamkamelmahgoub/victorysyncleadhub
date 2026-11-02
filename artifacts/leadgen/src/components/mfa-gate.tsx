import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Factor = {id:string;totp?:{qr_code:string;secret:string}};
function mfaErrorMessage(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === 'object' && caught !== null && 'message' in caught && typeof caught.message === 'string' && caught.message) return caught.message;
  if (typeof caught === 'string' && caught && caught !== '[object Object]') return caught;
  return 'Could not set up two-step verification. Please try again or contact your administrator.';
}
export function MfaGate({children,required}:{children:ReactNode;required:boolean}) {
  const [level,setLevel]=useState<'loading'|'aal1'|'aal2'>('loading');
  const [factor,setFactor]=useState<Factor|null>(null);
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!required){setLevel('aal2');return}
    let mounted=true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({data,error})=>{
      if(!mounted)return;
      if(error){setError(error.message);setLevel('aal1')}
      else setLevel(data.currentLevel==='aal2'?'aal2':'aal1');
    });
    return()=>{mounted=false};
  },[required]);
  async function prepare() {
    setBusy(true);setError('');
    try {
      const listed=await supabase.auth.mfa.listFactors();
      if(listed.error)throw listed.error;
      if(!listed.data||!Array.isArray(listed.data.totp))
        throw new Error('Authenticator setup is unavailable. Sign in again or contact your administrator.');
      const existing=listed.data.totp[0];
      if(existing){setFactor({id:existing.id});return}
      const enrolled=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'VictorySync authenticator'});
      if(enrolled.error)throw enrolled.error;
      if(!enrolled.data?.id||!enrolled.data.totp)
        throw new Error('Authenticator setup is unavailable. Sign in again or contact your administrator.');
      setFactor({id:enrolled.data.id,totp:enrolled.data.totp});
    }catch(caught){setError(mfaErrorMessage(caught))}
    finally{setBusy(false)}
  }
  async function verify() {
    if(!factor)return;
    setBusy(true);setError('');
    try{
      const result=await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code:code.trim()});
      if(result.error)throw result.error;
      await supabase.auth.refreshSession();
      setLevel('aal2');
    }catch(caught){setError(mfaErrorMessage(caught))}
    finally{setBusy(false)}
  }
  if(!required||level==='aal2')return <>{children}</>;
  if(level==='loading')return <main className="p-8 text-sm">Checking two-step verification…</main>;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-md space-y-4 p-6">
    <h1 className="text-xl font-semibold">Two-step verification required</h1>
    <p className="text-sm text-muted-foreground">Agency access requires an authenticator code.</p>
    {!factor?<Button disabled={busy} onClick={()=>void prepare()}>Continue</Button>:<>
      {factor.totp&&<div className="space-y-2"><img src={`data:image/svg+xml;base64,${btoa(factor.totp.qr_code)}`} alt="Authenticator QR code" className="h-48 w-48"/><p className="text-xs">Or enter this secret in your authenticator app: <code>{factor.totp.secret}</code></p></div>}
      <Input aria-label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event=>setCode(event.target.value)} maxLength={8}/>
      <Button disabled={busy||code.trim().length<6} onClick={()=>void verify()}>Verify code</Button>
    </>}
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  </Card></main>;
}
