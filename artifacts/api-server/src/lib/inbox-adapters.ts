import {ImapFlow} from 'imapflow';
import {simpleParser} from 'mailparser';
import {decryptCredentials} from '../../../../lib/email-security.js';
import type {InboxAdapter,InboxBatch,InboundMessage} from '../../../../lib/sequence-service.js';
import {deliveryReport} from '../../../../lib/delivery-report.js';

const address=(value:string)=>String(value??'').match(/<?([^\s<>]+@[^\s<>]+)>?/)?.[1]?.toLowerCase()??'';
export class ResendInbox implements InboxAdapter {
 constructor(private apiKey:string,private fetcher:typeof fetch=fetch){}
 private async get(path:string){const r=await this.fetcher(`https://api.resend.com${path}`,{headers:{authorization:`Bearer ${this.apiKey}`},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Inbox unavailable');return await r.json() as any;}
 async poll(m:Record<string,any>):Promise<InboxBatch>{
  const cursor=m.inbox_cursor??{},query=new URLSearchParams({limit:'20'});
  if(cursor.after)query.set('after',String(cursor.after));
  const page=await this.get(`/emails/receiving?${query}`);if(!Array.isArray(page.data))throw new Error('Invalid inbox response');
  const head=cursor.head??page.data[0]?.id??cursor.latest;
  let done=!page.has_more;const messages:InboundMessage[]=[];
  for(const row of page.data){
   if(row.id===cursor.latest||new Date(row.created_at)<new Date(m.inbox_configured_at)){done=true;break;}
   if(![...(row.to??[]),...(row.cc??[])].some((to:string)=>address(to)===m.from_email.toLowerCase()))continue;
   const item=await this.get(`/emails/receiving/${encodeURIComponent(row.id)}`);
   const headers=Object.fromEntries(Object.entries(item.headers??{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
   messages.push({id:String(item.id),from:address(item.from),subject:String(item.subject??''),text:String(item.text??'').slice(0,50000),receivedAt:item.created_at,headers});
  }
  if(page.has_more&&!page.data.length)throw new Error('Inbox pagination did not advance');
  return {messages,caughtUp:done,cursor:done?{latest:head}:{latest:cursor.latest,head,after:page.data.at(-1).id}};
 }
}

export class ImapInbox implements InboxAdapter {
 constructor(private config:{host:string;port:number;user:string;password:string;folder:string},private clientFactory:(options:ConstructorParameters<typeof ImapFlow>[0])=>ImapFlow=options=>new ImapFlow(options)){}
 async poll(m:Record<string,any>):Promise<InboxBatch>{
  const c=this.clientFactory({host:this.config.host,port:993,secure:true,tls:{rejectUnauthorized:true},auth:{user:this.config.user,pass:this.config.password},logger:false,disableAutoIdle:true,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000});
  c.on('error',()=>{});
  try{
   await c.connect();const lock=await c.getMailboxLock(this.config.folder??'INBOX',{readOnly:true});
   try{
    if(!c.mailbox)throw new Error('Inbox unavailable');
    const validity=String(c.mailbox.uidValidity),cursor=m.inbox_cursor??{};
    const last=cursor.validity===validity?Number(cursor.uid??0):0;
    const top=c.mailbox.uidNext-1;
    if(top<=last)return {messages:[],caughtUp:true,cursor:{validity,uid:top}};
    const found=await c.search({uid:`${last+1}:${top}`,since:new Date(m.inbox_configured_at)},{uid:true});
    const ids=(found||[]).filter(uid=>uid>last&&uid<=top).sort((a,b)=>a-b).slice(0,100);
    const messages:InboundMessage[]=[];
    if(ids.length){
     for await(const item of c.fetch(ids,{envelope:true,internalDate:true,headers:true,source:{maxLength:200000}},{uid:true})){
      if(item.internalDate&&new Date(item.internalDate)<new Date(m.inbox_configured_at))continue;
      // MailParser supports keepDeliveryStatus; the installed @types package omits it.
      const parserOptions={skipHtmlToText:true,skipTextToHtml:true,skipImageLinks:true,keepDeliveryStatus:true};
      const parsed=await simpleParser(item.source??item.headers??Buffer.alloc(0),parserOptions);
      const contentType=parsed.headers.get('content-type') as {value?:string;params?:Record<string,string>}|undefined;
      const report=deliveryReport(parsed.attachments,contentType?.value==='multipart/report'&&contentType.params?.['report-type']==='delivery-status');
      const from=parsed.from?.value[0]?.address??item.envelope?.from?.[0]?.address;
      if(!from)continue;
      messages.push({id:`imap:${this.config.folder}:${validity}:${item.uid}`,from:from.toLowerCase(),subject:parsed.subject??item.envelope?.subject??'',text:(parsed.text??'').slice(0,50000),receivedAt:new Date(item.internalDate??Date.now()).toISOString(),headers:Object.fromEntries([...parsed.headers].map(([k,v])=>[k,String(v)])),deliveryReport:report});
     }
    }
    const caughtUp=(found||[]).length<=100;
    return {messages,caughtUp,cursor:{validity,uid:caughtUp?top:ids.at(-1)}};
   }finally{lock.release();}
  }finally{await c.logout().catch(()=>c.close());}
 }
}
export function inboxAdapter(mailbox:Record<string,any>):InboxAdapter{
 const credentials=decryptCredentials(mailbox.inbound_credentials,mailbox.from_email) as any;
 if(mailbox.inbound_provider==='resend')return new ResendInbox(credentials.apiKey);
 if(mailbox.inbound_provider==='imap')return new ImapInbox(credentials);
 throw new Error('Inbox provider is not configured');
}
