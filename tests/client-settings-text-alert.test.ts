import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('text alerts require a valid phone in the account settings RPC',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select '20000000-0000-4000-8000-000000000001'::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as
        $$select '{"email":"owner@example.test"}'::jsonb$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as
        $$select p_account='10000000-0000-4000-8000-000000000001'::uuid$$;
      create function public.portal_page_allowed(p_page text) returns boolean language sql stable as
        $$select p_page='settings'$$;
      create function public.auth_role() returns text language sql stable as
        $$select 'client_owner'::text$$;
      create table public.sub_accounts(id uuid primary key,phone text,website text,
        settings jsonb not null default '{}'::jsonb,updated_at timestamptz);
      create table public.portal_activity_log(actor_id uuid,actor_email text,organization_id text,
        client_account_id text,event_type text,action text,target text,metadata jsonb);
      insert into public.sub_accounts(id) values('10000000-0000-4000-8000-000000000001');
    `);
    const migration=await readFile(new URL('../supabase/migrations/20261107_01_client_text_alert_phone.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const account='10000000-0000-4000-8000-000000000001';
    const save=(id:string,notifications:Record<string,unknown>)=>db.query(
      `select public.portal_update_client_settings($1,'','',$2::jsonb)`,[id,JSON.stringify(notifications)]);
    await assert.rejects(()=>save(account,{email:true,text:true,phone:''}),/Invalid settings/);
    await assert.rejects(()=>save(account,{email:true,text:true,phone:'123'}),/Invalid settings/);
    assert.equal(Number((await db.query<{count:number}>('select count(*) from public.portal_activity_log')).rows[0].count),0);
    await save(account,{email:true,text:true,phone:'+15125550123'});
    assert.equal((await db.query<{settings:{notifications:{phone:string}}}>(
      'select settings from public.sub_accounts where id=$1',[account])).rows[0].settings.notifications.phone,'+15125550123');
    await save(account,{email:true,text:false,phone:''});
    await assert.rejects(()=>save('10000000-0000-4000-8000-000000000002',
      {email:true,text:false,phone:''}),/Invalid settings/);
  }finally{await db.close()}
});
