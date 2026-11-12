import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';

test('billing customer RPC stays in the account and rejects staff roles',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;
      create table public.sub_accounts(id uuid primary key,stripe_customer_id text);
      insert into public.sub_accounts values
        ('${accountA}','cus_account_a'),('${accountB}','cus_account_b');
      create function public.auth_role() returns text language sql stable as $$
        select current_setting('test.role',true) $$;
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$
        select true $$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select current_setting('test.role',true)='agency_admin'
          or p_account::text=current_setting('test.account',true) $$;
      grant usage on schema public to authenticated;
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261026_02_client_portal_rpc.sql',import.meta.url),'utf8');
    const start=migration.indexOf('create or replace function public.portal_billing_customer(');
    const end=migration.indexOf('end $$;',start)+'end $$;'.length;
    assert.ok(start>=0&&end>start);
    await db.exec(migration.slice(start,end));
    await db.exec(`grant execute on function public.portal_billing_customer(uuid) to authenticated;
      set role authenticated; set test.role='client_owner'; set test.account='${accountA}';`);
    assert.equal((await db.query<{customer:string}>(
      `select public.portal_billing_customer('${accountA}') as customer`)).rows[0].customer,'cus_account_a');
    await assert.rejects(db.query(`select public.portal_billing_customer('${accountB}')`),/Access denied/);
    await db.exec(`set test.role='client_staff'`);
    await assert.rejects(db.query(`select public.portal_billing_customer('${accountA}')`),/Access denied/);
    await db.exec(`set test.role='agency_staff'`);
    await assert.rejects(db.query(`select public.portal_billing_customer('${accountA}')`),/Access denied/);
    await db.exec(`set test.role='agency_admin'`);
    assert.equal((await db.query<{customer:string}>(
      `select public.portal_billing_customer('${accountB}') as customer`)).rows[0].customer,'cus_account_b');
  }finally{await db.close()}
});
