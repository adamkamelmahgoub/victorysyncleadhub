import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {canAccessPath} from '../artifacts/leadgen/src/lib/permissions.js';

test('portal SQL and browser routes agree on page access by role',async()=>{
  const db=new PGlite();
  const userId='10000000-0000-4000-8000-000000000001';
  const migration=readFileSync(new URL('../supabase/migrations/20261026_05_portal_legacy_admin_access.sql',import.meta.url),'utf8');
  const functionSql=migration.slice(0,migration.indexOf('revoke all on function public.portal_page_allowed'));
  const pages=['dashboard','leads','calls','pages','forms','reviews','reports','billing','settings'];
  try{
    await db.exec(`create schema auth;
      create role authenticated;
      create table public.team_members(user_id uuid,auth_user_id text,role text,page_permissions jsonb,
        is_active boolean,client_account_id uuid,created_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable as $$
        select '10000000-0000-4000-8000-000000000001'::uuid $$;
      create function public.auth_role() returns text language sql stable as $$
        select case current_setting('test.portal_role',true)
          when 'member' then 'agency_staff' when 'viewer' then 'agency_staff'
          when 'owner' then 'agency_admin' when 'admin' then 'agency_admin'
          else current_setting('test.portal_role',true) end $$;
      create function public.is_agency_admin() returns boolean language sql stable as $$
        select public.auth_role()='agency_admin' $$;
      create function public.client_feature_enabled(text) returns boolean language sql stable as $$
        select true $$;`);
    await db.exec(functionSql);
    await db.query(`insert into public.team_members(user_id,role,page_permissions,is_active)
      values($1,'client_staff','["dashboard","leads","calls"]',true)`,[userId]);
    for(const {role,permissions} of [
      {role:'agency_admin',permissions:['dashboard']},
      {role:'agency_staff',permissions:['dashboard','leads','pages','reports','billing']},
      {role:'client_owner',permissions:['dashboard','leads','pages','reviews','billing']},
      {role:'client_staff',permissions:['dashboard','leads','calls','billing']},
      {role:'member',permissions:['dashboard']},
    ]){
      await db.query('select set_config($1,$2,false)',['test.portal_role',role]);
      await db.query('update public.team_members set role=$1,page_permissions=$2::jsonb where user_id=$3',
        [role,JSON.stringify(permissions),userId]);
      for(const page of pages){
        const result=await db.query<{allowed:boolean}>('select public.portal_page_allowed($1) allowed',[page]);
        assert.equal(result.rows[0].allowed,canAccessPath(`/client-portal/${page}`,permissions,role),
          `${role} ${page}`);
      }
    }
  }finally{await db.close();}
});
