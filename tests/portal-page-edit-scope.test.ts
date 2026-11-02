import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('portal page edit RPC limits staff to marketing assignments', async () => {
  const db = new PGlite();
  const account = '10000000-0000-4000-8000-000000000001';
  const user = '20000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create function public.auth_role() returns text language sql stable as $$
        select current_setting('qa.role',true) $$;
      create function public.is_agency_admin() returns boolean language sql stable as $$
        select public.auth_role()='agency_admin' $$;
      create function public.can_access_account(uuid) returns boolean language sql stable as $$
        select $1::text=current_setting('qa.account',true) $$;
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$
        select $1='pages' $$;
      create function public.client_feature_enabled(text) returns boolean language sql stable as $$
        select current_setting('qa.editing',true)='true' $$;
      create table public.sub_accounts(id uuid primary key,organization_id uuid);
      create table public.sub_account_assignments(sub_account_id uuid,user_id uuid,role_in_account text);
      create table public.marketing_landing_pages(
        id uuid primary key default gen_random_uuid(),client_account_id uuid,organization_id uuid,
        title text,slug text,sections jsonb,theme jsonb,seo_description text,status text,updated_at timestamptz);
      create table public.forms(id uuid primary key,client_account_id uuid);
      create table public.portal_activity_log(actor_id uuid,actor_email text,organization_id text,
        client_account_id text,event_type text,action text,target text);
      insert into public.sub_accounts values ('${account}','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1');
      insert into public.sub_account_assignments values ('${account}','${user}','ads');
      grant usage on schema public,auth to authenticated;
      grant execute on all functions in schema public,auth to authenticated;
    `);
    const sql = readFileSync(new URL('../supabase/migrations/20261102_03_portal_page_edit_scope.sql',import.meta.url),'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(`
      set request.jwt.claim.sub = '${user}';
      set qa.account = '${account}';
      set qa.editing = 'false';
      set qa.role = 'agency_staff';
      set role authenticated;
    `);
    const allowed = async () => (await db.query<{allowed:boolean}>(
      `select public.portal_page_edit_allowed('${account}'::uuid) allowed`)).rows[0].allowed;
    assert.equal(await allowed(),false);
    await db.exec('reset role');
    await db.exec("update public.sub_account_assignments set role_in_account='marketing'");
    await db.exec('set role authenticated');
    assert.equal(await allowed(),true);
    await db.exec("set qa.role = 'client_staff'");
    assert.equal(await allowed(),false);
    await db.exec("set qa.role = 'client_owner'");
    assert.equal(await allowed(),false);
    await db.exec("set qa.editing = 'true'");
    assert.equal(await allowed(),true);
    await db.exec("set qa.role = 'agency_admin'");
    assert.equal(await allowed(),true);
  } finally {
    await db.close();
  }
});
