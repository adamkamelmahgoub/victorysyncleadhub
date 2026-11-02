import test from 'node:test';
import assert from 'node:assert/strict';

test('legacy sub-account reads use the caller JWT and non-admin writes are denied', async () => {
  const before = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  Object.assign(process.env, {
    SUPABASE_URL: 'https://account-boundary.test',
    SUPABASE_ANON_KEY: 'anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
  });
  const originalFetch = globalThis.fetch;
  const userId = '10000000-0000-4000-8000-000000000001';
  const token = `header.${Buffer.from(JSON.stringify({ sub: userId, crm_role: 'member' })).toString('base64url')}.signature`;
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, user_metadata: { role: 'member' } });
    if (url.pathname === '/rest/v1/rpc/client_feature_enabled') return Response.json(false);
    if (url.pathname === '/rest/v1/portal_activity_log') return Response.json([]);
    if (url.pathname === '/rest/v1/sub_accounts') {
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${token}`);
      reads++;
      return Response.json([{ id: '20000000-0000-4000-8000-000000000001', name: 'Assigned account' }]);
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  try {
    const { default: handler } = await import('../api/[...path].js');
    const invoke = async (method: string, url: string) => {
      let output: Record<string, unknown> | null = null;
      const res = { statusCode: 0, setHeader() {}, end(body?: string) { output = JSON.parse(body || '{}'); } };
      await handler({ method, url, headers: { authorization: `Bearer ${token}` }, on() {} }, res);
      return { status: res.statusCode, output };
    };
    assert.equal((await invoke('GET', '/api/sub-accounts')).status, 200);
    assert.equal((await invoke('GET', '/api/sub-accounts-stats')).status, 200);
    assert.equal(reads, 2);
    assert.equal((await invoke('PATCH', '/api/sub-accounts/20000000-0000-4000-8000-000000000001')).status, 403);
    assert.equal(reads, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
