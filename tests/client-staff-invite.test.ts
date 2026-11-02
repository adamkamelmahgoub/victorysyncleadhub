import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

test('client owner receives a private staff invite link when email is unavailable', async () => {
  const before = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
    APP_URL: process.env.APP_URL,
  };
  Object.assign(process.env, {
    SUPABASE_URL: 'https://invite-test.invalid',
    SUPABASE_ANON_KEY: 'anon-test-key',
    VERCEL_ENV: 'preview',
    APP_URL: 'https://app.victorysync.com',
  });
  const originalFetch = globalThis.fetch;
  const userId = '10000000-0000-4000-8000-000000000001';
  const accountId = '20000000-0000-4000-8000-000000000001';
  const token = `header.${Buffer.from(JSON.stringify({ sub: userId, crm_role: 'client_owner', aal: 'aal1' })).toString('base64url')}.signature`;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: userId, email: 'owner@example.test' });
    if (path === '/rest/v1/rpc/auth_role') return Response.json('client_owner');
    if (path === '/rest/v1/rpc/portal_accounts') return Response.json([{ id: accountId }]);
    if (path === '/rest/v1/rpc/portal_invite_client_staff') return Response.json('private-invite-code');
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    const { default: handler } = await import('../api/portal.js');
    const body = JSON.stringify({ action: 'invite_staff', name: 'Staff Member', email: 'staff@example.test' });
    const req = Object.assign(Readable.from([body]), {
      method: 'POST', url: '/api/portal', headers: { authorization: `Bearer ${token}` },
    });
    let output: { invited?: boolean; inviteSent?: boolean; inviteUrl?: string | null } = {};
    const res = { statusCode: 0, setHeader() {}, end(value: string) { output = JSON.parse(value); } };
    await handler(req as never, res as never);
    assert.equal(res.statusCode, 201);
    assert.equal(output.invited, true);
    assert.equal(output.inviteSent, false);
    const link = new URL(String(output.inviteUrl));
    assert.equal(link.origin, 'https://app.victorysync.com');
    assert.equal(link.searchParams.get('invite'), 'private-invite-code');
    assert.equal(link.searchParams.get('email'), 'staff@example.test');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
