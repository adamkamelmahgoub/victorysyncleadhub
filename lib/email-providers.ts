import { EmailInputError } from './email-security.js';
export type VerificationStatus='valid'|'risky'|'invalid'|'unverified';
export interface VerificationProvider {name:string;verify(email:string):Promise<VerificationStatus>}
export class ZeroBounceVerifier implements VerificationProvider {
  name='zerobounce';
  constructor(private apiKey:string,private fetcher:typeof fetch=fetch) {}
  async verify(email:string):Promise<VerificationStatus> {
    if(!this.apiKey) throw new EmailInputError('Configure the email verification provider key');
    let data:any;
    try {const response=await this.fetcher('https://api.zerobounce.net/v2/validate',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({api_key:this.apiKey,email,timeout:'20'}),signal:AbortSignal.timeout(25000)});if(!response.ok) throw new Error();data=await response.json();if(data.error) throw new Error();}catch {throw new EmailInputError('Email verification is unavailable; the address remains blocked');}
    if(String(data.address ?? '').trim().toLowerCase()!==email.trim().toLowerCase()) return 'unverified';
    if(data.status==='valid' && !data.catchall_domain && !['role_based','disposable','toxic','possible_trap','accept_all'].includes(data.sub_status)) return 'valid';
    if(['invalid','spamtrap','abuse','do_not_mail'].includes(data.status)) return 'invalid';
    if(data.status==='valid'||data.status==='catch-all') return 'risky';return 'unverified';
  }
}
export type OutboundMessage={jobId:string;fromEmail:string;fromName:string;to:string;subject:string;text:string;messageId:string;headers:Record<string,string>};
export interface EmailTransport {prepare?(fromEmail:string):Promise<void>;send(message:OutboundMessage):Promise<{messageId:string}>}
export class SmtpRecipientRejected extends Error {constructor(){super('SMTP permanently rejected the recipient');}}
export class ResendTransport implements EmailTransport {
 constructor(private apiKey:string,private fetcher:typeof fetch=fetch,private domainId:string=''){}
 async prepare(fromEmail:string) {
  try {
   if(!/^[a-f0-9-]{36}$/i.test(this.domainId)) throw new Error();
   const response=await this.fetcher(`https://api.resend.com/domains/${this.domainId}`,{headers:{authorization:`Bearer ${this.apiKey}`},signal:AbortSignal.timeout(10000)});
   if(!response.ok) throw new Error();
   const domain=await response.json() as {name?:string;status?:string;click_tracking?:boolean;open_tracking?:boolean};
   if(domain.name!==fromEmail.split('@')[1] || domain.status!=='verified' || domain.click_tracking!==false || domain.open_tracking!==false) throw new Error();
  } catch {throw new EmailInputError('Resend requires a verified matching domain with open and click tracking disabled');}
 }
 async send(message:OutboundMessage) {
  try {
   const response=await this.fetcher('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${this.apiKey}`,'content-type':'application/json','Idempotency-Key':`outreach/${message.jobId}`},body:JSON.stringify({from:`${message.fromName.replace(/["\r\n<>]/g,'')} <${message.fromEmail}>`,to:[message.to],subject:message.subject,text:message.text,headers:message.headers,tags:[{name:'outreach_job_id',value:message.jobId}]}),signal:AbortSignal.timeout(20000)});
   if(!response.ok) throw new Error();const result=await response.json() as {id?:string};if(!result.id) throw new Error();return {messageId:result.id};
  }catch {throw new Error('Provider dispatch outcome is unknown');}
 }
}
