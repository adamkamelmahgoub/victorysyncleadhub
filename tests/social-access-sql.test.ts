import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {formsAccessSql,inboxViewAccessSql} from '../lib/social-access-sql.js';

test('social inbox refresh access joins text auth IDs to UUID profile IDs safely',async()=>{
  const db=new PGlite();
  const user='11111111-1111-4111-8111-111111111111';
  const org='22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create table profiles(id uuid primary key,global_role text);
      create table team_members(id uuid primary key,auth_user_id text,org_id uuid,status text,client_account_id uuid,role text,page_permissions jsonb);
      create table social_team_permissions(team_member_id uuid,permissions text[]);
      insert into team_members values('33333333-3333-4333-8333-333333333333','${user}','${org}','active',null,'owner',null);`);
    assert.equal((await db.query(inboxViewAccessSql,[user,org])).rows.length,1);
    assert.equal((await db.query(formsAccessSql,[user,org])).rows.length,1);
    assert.equal((await db.query(inboxViewAccessSql,['44444444-4444-4444-8444-444444444444',org])).rows.length,0);
  } finally {await db.close();}
});
