import type { IncomingMessage, ServerResponse } from 'node:http';
import social from '../lib/social-routes/social.js';
import accounts from '../lib/social-routes/social-accounts.js';
import bulk from '../lib/social-routes/social-bulk.js';
import daily from '../lib/social-routes/social-daily.js';
import draft from '../lib/social-routes/social-draft.js';
import inbox from '../lib/social-routes/social-inbox.js';
import primary from '../lib/social-routes/social-primary.js';
import reply from '../lib/social-routes/social-reply.js';
import review from '../lib/social-routes/social-review.js';
import webhook from '../lib/social-routes/social-webhook.js';
import worker from '../lib/social-routes/social-worker.js';
import campaigns from '../lib/social-routes/dm-campaigns.js';
import queue from '../lib/social-routes/dm-queue.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };
const handlers: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
  social, 'social-accounts': accounts, 'social-bulk': bulk, 'social-daily': daily,
  'social-draft': draft, 'social-inbox': inbox, 'social-primary': primary,
  'social-reply': reply, 'social-review': review, 'social-webhook': webhook,
  'social-worker': worker, 'dm-campaigns': campaigns, 'dm-queue': queue,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url || '/', 'https://local.invalid').pathname;
  const name = path.replace(/^\/(?:leadgen\/)?api\//, '');
  const route = handlers[name];
  if (!route || !/^\/(?:leadgen\/)?api\//.test(path)) {
    res.statusCode = 404; res.end('Not found'); return;
  }
  await route(req, res);
}
