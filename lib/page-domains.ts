import {z} from 'zod';

export const pageDomainSchema=z.object({domain:z.string().trim().toLowerCase().min(4).max(253)
  .regex(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Enter a domain name without https:// or a path')}).strict().refine(
  value=>!value.domain.endsWith('.vercel.app')&&!value.domain.endsWith('.localhost')&&
    value.domain!=='victorysync.com'&&!value.domain.endsWith('.victorysync.com'),
  'Use a client-owned domain');

export type DomainStatus={name:string;verified:boolean;verification:Array<{type:string;domain:string;value:string}>};
function endpoint(domain?:string){
  const token=process.env.VERCEL_API_TOKEN,project=process.env.VERCEL_PROJECT_ID;
  if(!token||!project)throw new Error('Domain connection is not configured');
  const version=domain?'v9':'v10';
  const url=new URL(`https://api.vercel.com/${version}/projects/${encodeURIComponent(project)}/domains${domain?`/${encodeURIComponent(domain)}`:''}`);
  const team=process.env.VERCEL_TEAM_ID||process.env.VERCEL_ORG_ID;
  if(team)url.searchParams.set('teamId',team);
  return {url,token};
}
async function request(domain:string|undefined,method:'GET'|'POST',body?:Record<string,string>){
  const {url,token}=endpoint(domain);
  const response=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  const payload=await response.json().catch(()=>({})) as Record<string,unknown>;
  return {response,payload};
}
function shape(payload:Record<string,unknown>):DomainStatus{
  return {name:String(payload.name||''),verified:payload.verified===true,
    verification:Array.isArray(payload.verification)?payload.verification.filter(
      (item):item is {type:string;domain:string;value:string}=>item!==null&&typeof item==='object'&&
      typeof item.type==='string'&&typeof item.domain==='string'&&typeof item.value==='string'):[]};
}
export async function getPageDomainStatus(domain:string):Promise<DomainStatus|null>{
  const {response,payload}=await request(domain,'GET');
  if(response.status===404)return null;
  if(!response.ok)throw new Error('Could not check domain status');
  return shape(payload);
}
export async function registerPageDomain(domain:string):Promise<DomainStatus>{
  const existing=await getPageDomainStatus(domain);
  if(existing)return existing;
  const {response,payload}=await request(undefined,'POST',{name:domain});
  if(!response.ok)throw new Error(response.status===409?'Domain belongs to another project':'Could not connect domain');
  return shape(payload);
}
export async function verifyPageDomain(domain:string):Promise<DomainStatus>{
  const {url,token}=endpoint(domain);url.pathname+='/verify';
  const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});
  const payload=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok)throw new Error('Domain verification is still pending');
  return shape(payload);
}
