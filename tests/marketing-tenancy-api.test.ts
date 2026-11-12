import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mcpPool } from '../lib/mcp-auth.js';
import { signPortalSelection } from '../lib/portal-cookie.js';

test('assigned agency staff cannot list all pages or edit without a marketing assignment', async () => {
  const before = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    PORTAL_COOKIE_SECRET: process.env.PORTAL_COOKIE_SECRET,
  };
  Object.assign(process.env, {
    SUPABASE_URL: 'https://marketing-tenancy.test',
    SUPABASE_ANON_KEY: 'anon-test-key',
    PORTAL_COOKIE_SECRET: 'test-cookie-secret-that-is-at-least-thirty-two-characters',
  });
  const originalFetch = globalThis.fetch;
  const originalQuery = mcpPool.query;
  const userId = '10000000-0000-4000-8000-000000000001';
  const accountId = '20000000-0000-4000-8000-000000000001';
  const accountScopes: unknown[][] = [];
  let assignment = 'agent';
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: userId, email_confirmed_at: '2026-01-01T00:00:00Z' });
    if (path === '/rest/v1/rpc/can_access_account')
      return Response.json(JSON.parse(String(init?.body)).p_account_id === accountId);
    throw new Error(`Unexpected request ${path}`);
  };
  mcpPool.query = (async (sql: string, values?: unknown[]) => {
    if (sql.includes('from public.user_feature_access')) return { rows: [{ enabled: true }], rowCount: 1 };
    if (sql.includes('from public.team_members')) return { rows: [{ role: 'agency_staff', page_permissions: ['pages'] }], rowCount: 1 };
    if (sql.includes('from public.profiles')) return { rows: [], rowCount: 0 };
    if (sql.includes('from public.sub_account_assignments')) return { rows: [{ role_in_account: assignment }], rowCount: 1 };
    if (sql.includes('from public.landing_pages') && sql.includes('order by updated_at')) {
      accountScopes.push(values || []);
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected SQL ${sql.slice(0,80)}`);
  }) as typeof mcpPool.query;
  try {
    const { default: handler } = await import('../lib/marketing-routes/marketing.js');
    const cookie = `vs_portal=${signPortalSelection({ accountId, viewAsClient: false, userId, issuedAt: Date.now() })}`;
    const otherCookie = `vs_portal=${signPortalSelection({ accountId: '20000000-0000-4000-8000-000000000002', viewAsClient: false, userId, issuedAt: Date.now() })}`;
    const invoke = async (method: string, path: string, selectedCookie?: string) => {
      const req = Object.assign(Readable.from([]), {
        method, url: path, headers: {
          authorization: 'Bearer test-token',
          ...(selectedCookie ? { cookie: selectedCookie } : {}),
        },
      });
      let payload: { error?: string } = {};
      const res = { statusCode: 0, setHeader() {}, end(value: string) { payload = JSON.parse(value); } };
      await handler(req as never, res as never);
      return { status: res.statusCode, payload };
    };
    assert.equal((await invoke('GET', '/api/landing-pages')).status, 403);
    assert.equal((await invoke('GET', '/api/landing-pages', otherCookie)).status, 403);
    assert.equal(accountScopes.length, 0);
    assert.equal((await invoke('GET', '/api/landing-pages', cookie)).status, 200);
    assert.equal(accountScopes[0]?.[1], accountId);
    assert.equal((await invoke('POST', '/api/landing-pages', cookie)).status, 403);
    assignment = 'marketing';
    assert.equal((await invoke('GET', '/api/forms', cookie)).status, 403);
  } finally {
    globalThis.fetch = originalFetch;
    mcpPool.query = originalQuery;
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
