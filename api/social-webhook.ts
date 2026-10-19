import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseMetaWebhook, parseWhatsAppWebhook, verifyMetaSignature } from '../lib/social-providers.js';
import { socialRest } from '../lib/social-service.js';

export const config = { api: { bodyParser: false }, maxDuration: 30 };
function answer(res: ServerResponse, status: number, body: string) { res.statusCode = status; res.end(body); }
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const query = new URL(req.url || '/', 'https://local.invalid').searchParams;
  if (req.method === 'GET') {
    const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (token && query.get('hub.mode') === 'subscribe' && query.get('hub.verify_token') === token)
      return answer(res, 200, query.get('hub.challenge') || '');
    return answer(res, 403, 'Invalid verification token');
  }
  if (req.method !== 'POST') return answer(res, 405, 'Method not allowed');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) return answer(res, 413, 'Payload too large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks);
  const signature = req.headers['x-hub-signature-256'];
  if (!verifyMetaSignature(raw, Array.isArray(signature) ? signature[0] : signature, process.env.META_APP_SECRET || ''))
    return answer(res, 401, 'Invalid signature');
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    const provider = parsed.object === 'whatsapp_business_account' ? 'whatsapp' : parsed.object === 'instagram' ? 'instagram' : 'facebook';
    const events = provider === 'whatsapp' ? parseWhatsAppWebhook(parsed) : parseMetaWebhook(parsed);
    const inbox = await socialRest<Array<{ id: number }>>('webhook_inbox', { method: 'POST', body: JSON.stringify({
      provider, method: 'POST', content_type: req.headers['content-type'] || null, raw_text: raw.toString('utf8'), parsed,
      headers: { 'x-hub-signature-256': '[verified]' }, query: {},
    }) });
    if (events.length) await socialRest('social_webhook_events?on_conflict=provider,event_key', {
      method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(events.map((event) => ({ provider, inbox_id: inbox[0].id,
        event_key: `${event.accountId}:${event.externalMessageId}`,
        payload: { ...event, timestamp: event.timestamp.toISOString() } }))),
    });
    return answer(res, 200, 'EVENT_RECEIVED');
  } catch {
    return answer(res, 503, 'Webhook temporarily unavailable');
  }
}
