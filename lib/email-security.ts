import { createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import {isIP} from 'node:net';
export class EmailInputError extends Error { status = 400; }
const setupMessages = new Set([
 'Verify DNS and configure encrypted credentials before enabling mailbox',
 'Mailbox must match its sending domain', 'Warmup ramp cannot be skipped',
 'Burned mailboxes cannot be resumed', 'No active mailbox capacity available',
 'Lead must be verified, unsuppressed and have a confirmed timezone', 'Mailbox is not enabled',
 'Check the receiving inbox before enabling bounce monitoring', 'SMTP mailbox not found',
 'Workflow must exist and be active', 'Choose a send email step', 'Eligible contact required',
 'Event key already used for different email', 'Unsupported template variable',
]);
export function emailOperationError(error: unknown) {
 const message=error instanceof Error?error.message:'';
 if(error instanceof EmailInputError||setupMessages.has(message))return {status:400,error:message};
 return {status:503,error:'Email operation could not be completed. Check configuration and retry.'};
}
export function keyring() {
  try {
    const keys=JSON.parse(process.env.OUTREACH_ENCRYPTION_KEYS ?? '{}') as Record<string,string>;
    const id=process.env.OUTREACH_ENCRYPTION_KEY_ID ?? '';
    if(!/^[a-zA-Z0-9_-]+$/.test(id) || Buffer.from(keys[id] ?? '', 'base64').length!==32) throw new Error();
    return {id,keys};
  } catch {throw new EmailInputError('Configure a 32-byte mailbox encryption key and key ID');}
}
export function encryptCredentials(value: unknown,email: string) {
  const {id,keys}=keyring();const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(keys[id],'base64'),iv);
  cipher.setAAD(Buffer.from(`victorysync:mailbox:${email.trim().toLowerCase()}`));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return ['enc','v1',id,iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join(':');
}
export function decryptCredentials(envelope: string,email: string): {password?:string;apiKey?:string;domainId?:string} {
  try {
    const [prefix,version,id,iv,tag,ciphertext,...extra]=envelope.split(':');const {keys}=keyring();
    if(prefix!=='enc'||version!=='v1'||extra.length) throw new Error();
    const decipher=createDecipheriv('aes-256-gcm',Buffer.from(keys[id],'base64'),Buffer.from(iv,'base64url'));
    decipher.setAAD(Buffer.from(`victorysync:mailbox:${email.trim().toLowerCase()}`));decipher.setAuthTag(Buffer.from(tag,'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8'));
  } catch {throw new EmailInputError('Mailbox credentials could not be decrypted');}
}
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const unsubscribeToken=()=>randomBytes(32).toString('base64url');
export function safeEqual(a:string,b:string) {const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}
export function verifyEventSignature(raw:string,timestamp:string,signature:string,secret:string,now=Date.now()) {
  if(secret.length<32 || !/^\d+$/.test(timestamp) || Math.abs(now/1000-Number(timestamp))>300) throw new EmailInputError('Invalid event signature');
  const expected=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');
  if(!safeEqual(expected,signature)) throw new EmailInputError('Invalid event signature');
}
export function verifyResendSignature(raw:string,id:string,timestamp:string,signatures:string,secret:string,now=Date.now()) {
  if(!id || !/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300 || !secret.startsWith('whsec_')) throw new EmailInputError('Invalid event signature');
  const expected=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(`${id}.${timestamp}.${raw}`).digest('base64');
  if(!signatures.split(' ').some(s=>s.startsWith('v1,') && safeEqual(expected,s.slice(3)))) throw new EmailInputError('Invalid event signature');
}
export function publicEmailUrl() {
  const configured=process.env.OUTREACH_PUBLIC_URL?.trim() || process.env.APP_URL?.trim();
  const production=process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  try {
    const url=new URL(configured || (production?`https://${production}`:''));
    if(url.protocol!=='https:' || !url.hostname.includes('.') || isIP(url.hostname) || url.hostname==='invalid.invalid' || url.hostname.endsWith('.localhost') || url.username || url.password || url.search || url.hash || url.pathname!=='/') throw new Error();
    return url.origin;
  } catch {throw new EmailInputError('Set OUTREACH_PUBLIC_URL to your portal HTTPS address (for example https://crm.yourdomain.com), then redeploy. APP_URL or the Vercel production domain can also supply this address.');}
}
export function plainText(subject:string,body:string,approved:string[]) {
  if(!subject.trim()||subject.length>998||/[\r\n]/.test(subject)||!body.trim()||body.length>50000||/<\/?[a-z][^>]*>/i.test(body)) throw new EmailInputError('Use a plain text subject and body without HTML');
  const urls=[...body.matchAll(/https?:\/\/[^\s<>"']+/gi)].map(m=>m[0].replace(/[.,;!?)]+$/,''));
  if(/\bwww\./i.test(body.replace(/https?:\/\/[^\s]+/gi,''))) throw new EmailInputError('Use full HTTPS URLs for direct links');
  for(const value of urls) {
    let u:URL;try {u=new URL(value);}catch {throw new EmailInputError('Invalid link');}
    if(u.protocol!=='https:'||u.username||u.password||u.port||!approved.includes(u.hostname.toLowerCase())||/^(bit\.ly|t\.co|tinyurl\.com|lnkd\.in|safelinks\.protection\.outlook\.com)$/i.test(u.hostname)||/(?:url|redirect|target|destination|dest|continue|return|tracking|utm_)/i.test([...u.searchParams.keys()].join(' '))||/https?(?::|%3a)/i.test(u.pathname+u.search)) throw new EmailInputError('Only approved direct HTTPS links are allowed; no redirects or tracking URLs');
  }
  return urls;
}
export async function checkDirectLinks(urls:string[],fetcher:typeof fetch=fetch) {
  for(const url of new Set(urls)) {
    let response:Response;try {response=await fetcher(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(5000)});}catch {throw new EmailInputError('A direct link could not be verified');}
    if(response.status<200 || response.status>=300 || response.headers.has('location')) throw new EmailInputError('Redirected or unavailable links cannot be sent');
  }
}
