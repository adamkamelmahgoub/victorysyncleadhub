import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('package templates deny direct client and anonymous access while provisioning can read them',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.client_package_templates(package text primary key,onboarding_tasks jsonb);
      insert into public.client_package_templates values('starter','[]');
      grant all on table public.client_package_templates to public,anon,authenticated;
      grant usage on schema public to anon,authenticated;
      create function public.template_for_provisioning(p_package text) returns jsonb
        language sql security definer set search_path='' as $$
          select onboarding_tasks from public.client_package_templates where package=p_package $$;
      grant execute on function public.template_for_provisioning(text) to authenticated;
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261102_08_client_package_template_access.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const privileges=await db.query<{anon_read:boolean;client_read:boolean;client_write:boolean;rls:boolean}>(`
      select has_table_privilege('anon','public.client_package_templates','select') anon_read,
        has_table_privilege('authenticated','public.client_package_templates','select') client_read,
        has_table_privilege('authenticated','public.client_package_templates','insert') client_write,
        (select relrowsecurity from pg_class where oid='public.client_package_templates'::regclass) rls`);
    assert.deepEqual(privileges.rows[0],{anon_read:false,client_read:false,client_write:false,rls:true});
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.client_package_templates'),/permission denied/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query('select * from public.client_package_templates'),/permission denied/);
    const provisioned=await db.query<{tasks:unknown}>(
      `select public.template_for_provisioning('starter') as tasks`);
    assert.deepEqual(provisioned.rows[0].tasks,[]);
  }finally{await db.close()}
});
