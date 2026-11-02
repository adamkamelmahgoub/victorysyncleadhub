import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpPool } from '../lib/mcp-auth.js';

test('legacy client page URL redirects to the canonical published snapshot', async () => {
  const original = mcpPool.query;
  const account = '10000000-0000-4000-8000-000000000001';
  const page = '20000000-0000-4000-8000-000000000001';
  let published = true;
  mcpPool.query = (async (sql: string) => {
    if (sql.includes('from public.marketing_landing_pages'))
      return { rows: [{ id: page, title: 'Draft title', seo_description: '', sections: [], theme: {},
        client_account_id: account, canonical_page_id: page, status: 'draft' }], rowCount: 1 };
    if (sql.includes('from public.landing_pages'))
      return { rows: published ? [{ slug: 'published-page' }] : [], rowCount: published ? 1 : 0 };
    throw new Error(`Unexpected SQL ${sql.slice(0,80)}`);
  }) as typeof mcpPool.query;
  try {
    const { default: handler } = await import('../api/client-landing.js');
    const invoke = async () => {
      let location = '';
      const res = { statusCode: 0, setHeader(key: string, value: string) {
        if (key === 'location') location = value;
      }, end() {} };
      await handler({ method: 'GET', url: '/api/public/landing/old-slug?utm_source=google',
        headers: { host: 'app.victorysync.com' } } as never, res as never);
      return { status: res.statusCode, location };
    };
    assert.deepEqual(await invoke(), { status: 307, location: '/p/published-page?utm_source=google' });
    published = false;
    assert.equal((await invoke()).status, 404);
  } finally {
    mcpPool.query = original;
  }
});
