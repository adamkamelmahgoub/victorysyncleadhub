import crypto from 'node:crypto';

export type PortalSelection={accountId:string|null;viewAsClient:boolean;userId:string;issuedAt:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(){
  const value=process.env.PORTAL_COOKIE_SECRET||process.env.SESSION_SECRET;
  if(!value||value.length<32)throw new Error('Portal cookie secret is not configured');
  return value;
}
export function signPortalSelection(value:PortalSelection){
  const body=Buffer.from(JSON.stringify(value)).toString('base64url');
  const mac=crypto.createHmac('sha256',secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}
export function readPortalSelection(cookieHeader:string|undefined,userId:string):PortalSelection|null{
  const raw=cookieHeader?.split(';').map(value=>value.trim()).find(value=>value.startsWith('vs_portal='))?.slice(10);
  if(!raw)return null;
  const [body,mac]=raw.split('.');
  if(!body||!mac)return null;
  const expected=crypto.createHmac('sha256',secret()).update(body).digest();
  const actual=Buffer.from(mac,'base64url');
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
  try{
    const value=JSON.parse(Buffer.from(body,'base64url').toString()) as PortalSelection;
    if(value.userId!==userId||!Number.isFinite(value.issuedAt)||value.issuedAt>Date.now()||
      Date.now()-value.issuedAt>7*24*3600_000||
      (value.accountId!==null&&!uuid.test(value.accountId))||typeof value.viewAsClient!=='boolean')return null;
    return value;
  }catch{return null}
}
