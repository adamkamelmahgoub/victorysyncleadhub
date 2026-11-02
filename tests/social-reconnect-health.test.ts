import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {markStaleUnipileAccountsSql} from '../lib/social-health-sql.js';
import {renderSocialAlert} from '../lib/social-notification-outbox.js';

test('only an account with 48 hours of silence and recent outbound messages needs reconnection',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create table connected_accounts(id integer primary key,organization_id integer,label text,owner_user_id integer,
      provider text,status text,health text,last_error text,updated_at timestamptz,created_at timestamptz,
      last_webhook_at timestamptz,timezone text);
      create table conversations(id integer primary key,connected_account_id integer,last_inbound_at timestamptz);
      create table messages(id integer primary key,conversation_id integer,direction text,created_at timestamptz);
      insert into connected_accounts values
        (1,1,'Silent Instagram',null,'unipile','active','healthy',null,null,'2026-10-01',null,'UTC'),
        (2,1,'Idle Instagram',null,'unipile','active','healthy',null,null,'2026-10-01',null,'UTC'),
        (3,1,'Current Instagram',null,'unipile','active','healthy',null,null,'2026-10-01',null,'UTC');
      insert into conversations values(1,1,null),(2,2,null),(3,3,'2026-11-02T08:00:00Z');
      insert into messages values(1,1,'outbound','2026-11-02T09:00:00Z'),
        (2,3,'outbound','2026-11-02T09:00:00Z');`);
    const fixed=markStaleUnipileAccountsSql.replaceAll('now()','timestamptz \'2026-11-02T12:00:00Z\'');
    const updated=(await db.query<{id:number}>(fixed)).rows;
    assert.deepEqual(updated.map(row=>row.id),[1]);
    const status=(await db.query<{id:number;status:string}>(`select id,status from connected_accounts order by id`)).rows;
    assert.deepEqual(status.map(row=>row.status),['error','active','active']);
    assert.match(renderSocialAlert({event:'reconnect_needed',account_label:'Silent Instagram'}),/Reconnect it in Settings/);
  }finally{await db.close();}
});
