import { createHmac, timingSafeEqual } from 'node:crypto';

export type Channel = 'instagram' | 'facebook' | 'whatsapp' | 'x' | 'linkedin' | 'email' | 'sms' | 'other';
export type InboundEvent = {
  channel: Channel; accountId: string; senderId: string; recipientId: string;
  externalMessageId: string; body: string; timestamp: Date; isEcho: boolean;
  attachments: unknown[];
};
export type MessageStatusEvent = { kind:'message_status'; channel:'whatsapp'; accountId:string; externalMessageId:string;
  status:'sent'|'delivered'|'read'|'failed'; timestamp:Date; error:string|null };
export type ManualPlatform = 'tiktok'|'threads'|'nextdoor'|'yelp'|'angi'|'youtube';
export type ReplyRequest = {accountExternalId:string;recipientId:string;body:string;accessToken:string;graphVersion:string};
export type ProviderAdapter = {
  channel: Channel | ManualPlatform;
  capabilities: { canInitiateDM: boolean; canReply: boolean; replyWindowHours: number | null; supportsEcho: boolean; enabled:boolean };
  connect(): Promise<never>;
  refreshToken(): Promise<never>;
  handleWebhook(payload: unknown): InboundEvent[];
  sendReply(request:ReplyRequest): Promise<string>;
  fetchHistory(): Promise<never>;
};

/** Verify the exact raw request body before JSON parsing. */
export function verifyMetaSignature(rawBody: Buffer, signature: string | undefined, appSecret: string): boolean {
  if (!appSecret || !signature?.startsWith('sha256=')) return false;
  const digest = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const supplied = signature.slice(7);
  return /^[a-f0-9]{64}$/i.test(supplied) && timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(digest, 'hex'));
}

export function replyAllowed(channel: Channel, lastInboundAt: Date | null, now = new Date()): boolean {
  if (!['instagram', 'facebook', 'whatsapp'].includes(channel) || !lastInboundAt) return false;
  const elapsed = now.getTime() - lastInboundAt.getTime();
  return elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000;
}

export function parseMetaWebhook(payload: any): InboundEvent[] {
  const events: InboundEvent[] = [];
  const channel: Channel = payload?.object === 'instagram' ? 'instagram' : 'facebook';
  if (!['instagram', 'page'].includes(payload?.object)) return events;
  for (const entry of payload.entry || []) {
    for (const item of entry.messaging || []) {
      const message = item.message;
      if (!message?.mid || !item.sender?.id || !item.recipient?.id) continue;
      const isEcho = message.is_echo === true;
      events.push({ channel, accountId: String(entry.id), senderId: String(item.sender.id),
        recipientId: String(item.recipient.id), externalMessageId: String(message.mid),
        body: String(message.text || ''), timestamp: new Date(Number(item.timestamp || entry.time || Date.now())),
        isEcho, attachments: Array.isArray(message.attachments) ? message.attachments : [] });
    }
  }
  return events;
}

export function parseWhatsAppWebhook(payload: any): InboundEvent[] {
  if (payload?.object !== 'whatsapp_business_account') return [];
  const events: InboundEvent[] = [];
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    for (const message of value.messages || []) {
      if (!message.id || !message.from || !value.metadata?.phone_number_id) continue;
      events.push({ channel: 'whatsapp', accountId: String(value.metadata.phone_number_id), senderId: String(message.from),
        recipientId: String(value.metadata.phone_number_id), externalMessageId: String(message.id),
        body: String(message.text?.body || ''), timestamp: new Date(Number(message.timestamp) * 1000),
        isEcho: false, attachments: message.type === 'text' ? [] : [message] });
    }
  }
  return events;
}

export function parseWhatsAppStatuses(payload:any):MessageStatusEvent[] {
  if(payload?.object!=='whatsapp_business_account')return [];
  const events:MessageStatusEvent[]=[];
  for(const entry of payload.entry||[])for(const change of entry.changes||[]){
    const value=change.value||{},accountId=value.metadata?.phone_number_id;
    if(!accountId)continue;
    for(const item of value.statuses||[]){
      if(!item.id||!['sent','delivered','read','failed'].includes(item.status))continue;
      events.push({kind:'message_status',channel:'whatsapp',accountId:String(accountId),externalMessageId:String(item.id),
        status:item.status,timestamp:new Date(Number(item.timestamp||Date.now()/1000)*1000),
        error:item.status==='failed'?String(item.errors?.[0]?.title||'Provider delivery failed').slice(0,500):null});
    }
  }
  return events;
}

const unavailable = async (): Promise<never> => { throw new Error('Provider connection is not configured'); };
async function sendMetaReply(channel:'facebook'|'whatsapp',request:ReplyRequest):Promise<string>{
  if(!/^v\d+\.\d+$/.test(request.graphVersion))throw new Error('META_GRAPH_VERSION is not configured');
  const endpoint=`https://graph.facebook.com/${request.graphVersion}/${encodeURIComponent(request.accountExternalId)}/messages`;
  const payload=channel==='whatsapp'
    ? {messaging_product:'whatsapp',to:request.recipientId,type:'text',text:{body:request.body}}
    : {recipient:{id:request.recipientId},messaging_type:'RESPONSE',message:{text:request.body}};
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${request.accessToken}`,'content-type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const result=await response.json() as{message_id?:string;messages?:Array<{id:string}>;error?:{message?:string}};
  if(!response.ok)throw new Error(`Provider rejected reply: ${result.error?.message||response.status}`);
  const id=channel==='whatsapp'?result.messages?.[0]?.id:result.message_id;
  if(!id)throw new Error('Provider did not return a message ID');
  return id;
}
export const providerAdapters: Record<Channel|ManualPlatform, ProviderAdapter> = Object.fromEntries(
  (['instagram','facebook','whatsapp','x','linkedin','email','sms','other','tiktok','threads','nextdoor','yelp','angi','youtube'] as Array<Channel|ManualPlatform>).map((channel) => [channel, {
    channel,
    capabilities: {
      canInitiateDM: false,
      canReply: ['facebook','whatsapp'].includes(channel),
      replyWindowHours: ['instagram','facebook','whatsapp'].includes(channel) ? 24 : null,
      supportsEcho: ['instagram','facebook'].includes(channel),
      enabled: channel!=='x'||process.env.SOCIAL_X_DM_ENABLED==='true',
    },
    connect: unavailable, refreshToken: unavailable,
    handleWebhook: channel === 'whatsapp' ? parseWhatsAppWebhook : ['instagram','facebook'].includes(channel) ? parseMetaWebhook : () => [],
    sendReply:channel==='facebook'||channel==='whatsapp'?(request:ReplyRequest)=>sendMetaReply(channel,request):unavailable,
    fetchHistory: unavailable,
  }]),
) as Record<Channel|ManualPlatform, ProviderAdapter>;
