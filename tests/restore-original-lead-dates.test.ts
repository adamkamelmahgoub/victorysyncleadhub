import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('restores only valid original dates and preserves the workaround date',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create table leads(id integer primary key,created_at timestamptz not null,custom_fields jsonb not null default '{}'::jsonb);
      insert into leads values
      (1,'2026-10-30T12:00:00Z','{"original_created_at":"2024-05-01T08:00:00Z"}'),
      (2,'2026-10-30T12:00:00Z','{"original_created_at":"invalid"}'),
      (3,'2026-10-30T12:00:00Z','{"other":"unchanged"}');`);
    const sql=readFileSync(new URL('../supabase/migrations/20261031_02_restore_original_lead_dates.sql',import.meta.url),'utf8');
    await db.exec(sql);
    const first=(await db.query<{id:number;created_at:Date;custom_fields:Record<string,string>}>(
      'select id,created_at,custom_fields from leads order by id')).rows;
    assert.equal(new Date(first[0].created_at).toISOString(),'2024-05-01T08:00:00.000Z');
    assert.equal(new Date(first[0].custom_fields.board_workaround_created_at).toISOString(),'2026-10-30T12:00:00.000Z');
    assert.equal(new Date(first[1].created_at).toISOString(),'2026-10-30T12:00:00.000Z');
    assert.equal(first[1].custom_fields.board_workaround_created_at,undefined);
    assert.equal(first[2].custom_fields.board_workaround_created_at,undefined);
    await db.exec(sql);
    const second=(await db.query('select id,created_at,custom_fields from leads order by id')).rows;
    assert.deepEqual(second,first);
  } finally {await db.close();}
});
