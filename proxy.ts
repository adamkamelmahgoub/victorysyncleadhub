import {next,rewrite} from '@vercel/functions';

export const config={matcher:'/'};

export function isClientPageHost(value:string){
  const host=value.trim().toLowerCase().replace(/:\d+$/,'').replace(/\.$/,'');
  if(!/^[a-z0-9.-]+$/.test(host)||!host.includes('.'))return false;
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))return false;
  if(host==='app.victorysync.com'||host==='portal.victorysync.com'||
    host==='victorysync.com'||host==='www.victorysync.com'||
    host.endsWith('.vercel.app')||host.endsWith('.localhost'))return false;
  return true;
}

export default function proxy(request:Request){
  const host=request.headers.get('host')||new URL(request.url).host;
  if(!isClientPageHost(host))return next();
  return rewrite(new URL('/api/domain-page',request.url));
}
