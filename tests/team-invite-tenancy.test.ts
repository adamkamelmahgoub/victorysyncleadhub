import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('team and invite migration is repeatable and enforces account reads', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.auth_role() returns text language sql stable as $$
        select current_setting('qa.role', true) $$;
      create function public.is_agency_admin() returns boolean language sql stable as $$
        select public.auth_role() = 'agency_admin' $$;
      create function public.can_access_account(uuid) returns boolean language sql stable as $$
        select $1::text = current_setting('qa.account', true) $$;
      create table public.team_members (
        id uuid primary key, user_id uuid, auth_user_id text,
        client_account_id uuid, name text
      );
      create table public.invite_codes (code_hash text primary key);
      grant usage on schema public, auth to authenticated;
      grant execute on all functions in schema public, auth to authenticated;
      grant all on public.team_members, public.invite_codes to authenticated;
      insert into public.team_members values
        ('00000000-0000-4000-8000-000000000001',null,null,'10000000-0000-4000-8000-000000000001','Account A'),
        ('00000000-0000-4000-8000-000000000002',null,null,'10000000-0000-4000-8000-000000000002','Account B');
      insert into public.invite_codes values ('secret-hash');
    `);
    const sql = readFileSync(new URL('../supabase/migrations/20261102_01_team_invite_tenancy.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const policies = await db.query<{ policyname: string }>(
      "select policyname from pg_policies where tablename='team_members' order by policyname",
    );
    assert.deepEqual(policies.rows.map(row => row.policyname), [
      'team_directory_admin', 'team_directory_read', 'team_directory_tenancy',
    ]);
    await db.exec(`
      set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
      set qa.account = '10000000-0000-4000-8000-000000000001';
      set qa.role = 'client_owner';
      set role authenticated;
    `);
    const visible = await db.query<{ name: string }>('select name from public.team_members');
    assert.deepEqual(visible.rows.map(row => row.name), ['Account A']);
    await db.exec("set qa.role = 'client_staff'");
    const staff = await db.query('select name from public.team_members');
    assert.equal(staff.rows.length, 0);
    await db.exec("set qa.role = 'agency_staff'");
    const assigned = await db.query<{ name: string }>('select name from public.team_members');
    assert.deepEqual(assigned.rows.map(row => row.name), ['Account A']);
    const changed = await db.query("update public.team_members set name='changed' returning id");
    assert.equal(changed.rows.length, 0);
    await assert.rejects(db.query('select * from public.invite_codes'));
    await db.exec("set qa.role = 'agency_admin'");
    const admin = await db.query('select name from public.team_members');
    assert.equal(admin.rows.length, 2);
  } finally {
    await db.close();
  }
});
