import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';

test('billing archive lists every invoice only for the permitted account',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;create role anon;
      create table public.invoices(id uuid primary key,client_account_id uuid,
        invoice_number text,status text,currency text,total numeric,amount_due numeric,
        amount_paid numeric,issued_at timestamptz,due_at timestamptz,paid_at timestamptz,
        stripe_hosted_invoice_url text,stripe_invoice_pdf text);
      create function public.portal_page_allowed(p_page text) returns boolean language sql stable as $$
        select p_page='billing' and current_setting('test.role',true)='client_owner'$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      insert into public.invoices(id,client_account_id,invoice_number,issued_at)
        select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          'INV-'||i,now() from generate_series(1,125) i;
      insert into public.invoices values
        ('40000000-0000-4000-8000-000000000001','${accountB}','PRIVATE',
          null,null,null,null,null,now(),null,null,null,null);
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261103_02_portal_invoices.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated;set test.role='client_owner';set test.account='${accountA}'`);
    const rows=(await db.query<{rows:Array<{invoice_number:string}>}>(
      `select public.portal_invoices('${accountA}') as rows`)).rows[0].rows;
    assert.equal(rows.length,125);
    assert.ok(rows.every(row=>row.invoice_number!=='PRIVATE'));
    await assert.rejects(db.query(`select public.portal_invoices('${accountB}')`),/Invoices unavailable/);
    await db.exec(`set test.role='client_staff'`);
    await assert.rejects(db.query(`select public.portal_invoices('${accountA}')`),/Invoices unavailable/);
  }finally{await db.close()}
});
