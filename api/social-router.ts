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
import access from '../lib/social-routes/social-access.js';
import oauth from '../lib/social-routes/social-oauth.js';
import posts from '../lib/social-routes/social-posts.js';
import reports from '../lib/social-routes/social-reports.js';
import threadsOauth from '../lib/social-routes/social-threads-oauth.js';
import unipile from '../lib/social-routes/social-unipile.js';
import repStats from '../lib/social-routes/social-rep-stats.js';
import attribution from '../lib/social-routes/social-attribution.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };
const handlers: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
  social, 'social-accounts': accounts, 'social-bulk': bulk, 'social-daily': daily,
  'social-draft': draft, 'social-inbox': inbox, 'social-primary': primary,
  'social-reply': reply, 'social-review': review, 'social-webhook': webhook,
  'social-worker': worker, 'dm-campaigns': campaigns, 'dm-queue': queue,
  'social-access': access, 'social-oauth': oauth,
  'social-posts': posts, 'social-reports': reports,
  'social-threads-oauth': threadsOauth,
  'social-unipile': unipile,
  'social-rep-stats': repStats,
  'social-attribution': attribution,
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
