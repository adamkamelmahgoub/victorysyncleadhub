import { createHmac, timingSafeEqual } from 'node:crypto';

export type Channel = 'instagram' | 'facebook' | 'whatsapp' | 'x' | 'linkedin' | 'email' | 'sms' | 'other';
export type InboundEvent = {
  channel: Channel; accountId: string; senderId: string; recipientId: string;
  externalMessageId: string; body: string; timestamp: Date; isEcho: boolean;
  attachments: unknown[];
};
export type ProviderAdapter = {
  channel: Channel;
  capabilities: { canInitiateDM: boolean; canReply: boolean; replyWindowHours: number | null; supportsEcho: boolean };
  connect(): Promise<never>;
  refreshToken(): Promise<never>;
  handleWebhook(payload: unknown): InboundEvent[];
  sendReply(): Promise<never>;
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

const unavailable = async (): Promise<never> => { throw new Error('Provider connection is not configured'); };
export const providerAdapters: Record<Channel, ProviderAdapter> = Object.fromEntries(
  (['instagram','facebook','whatsapp','x','linkedin','email','sms','other'] as Channel[]).map((channel) => [channel, {
    channel,
    capabilities: {
      canInitiateDM: false,
      canReply: ['instagram','facebook','whatsapp'].includes(channel),
      replyWindowHours: ['instagram','facebook','whatsapp'].includes(channel) ? 24 : null,
      supportsEcho: ['instagram','facebook'].includes(channel),
    },
    connect: unavailable, refreshToken: unavailable,
    handleWebhook: channel === 'whatsapp' ? parseWhatsAppWebhook : ['instagram','facebook'].includes(channel) ? parseMetaWebhook : () => [],
    sendReply: unavailable, fetchHistory: unavailable,
  }]),
) as Record<Channel, ProviderAdapter>;
