import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('unified task view preserves both sources, links a unique company and hides duplicate contact tasks',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role authenticated; create role service_role;
      create table companies(id uuid primary key,name text,deleted_at timestamptz);
      create table leads(id uuid primary key,company text);
      create table company_tasks(id uuid primary key,company_id uuid,client_account_id uuid,
        title text,kind text,status text,priority text,due_at timestamptz,assignee text,notes text,
        created_at timestamptz default now(),updated_at timestamptz default now());
      create table contact_tasks(id uuid primary key,lead_id uuid,client_account_id uuid,title text,
        description text,due_date timestamptz,is_completed boolean,priority text,created_at timestamptz default now());
      insert into companies values('10000000-0000-4000-8000-000000000001','Demo Plumbing',null);
      insert into leads values('20000000-0000-4000-8000-000000000001','Demo Plumbing');
      insert into company_tasks(id,company_id,title,kind,status,priority,due_at)
        values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Company task','task','pending','normal',null);
      insert into contact_tasks(id,lead_id,title,description,due_date,is_completed,priority)
        values('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Call homeowner','First copy','2026-11-01',false,'medium'),
              ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Call homeowner','Duplicate','2026-11-01',false,'medium');`);
    const sql=readFileSync(new URL('../supabase/migrations/20261031_03_unified_tasks_view.sql',import.meta.url),'utf8');
    await db.exec(sql);
    const rows=(await db.query<{id:string;source:string;company_id:string;lead_id:string}>(
      'select id,source,company_id,lead_id from unified_tasks order by source')).rows;
    assert.equal(rows.length,2);
    assert.equal(rows[0].source,'company');
    assert.equal(rows[1].source,'contact');
    assert.equal(rows[1].company_id,'10000000-0000-4000-8000-000000000001');
    assert.equal(rows[1].lead_id,'20000000-0000-4000-8000-000000000001');
    await db.query("update contact_tasks set is_completed=true where id=$1",[rows[1].id]);
    assert.equal((await db.query<{status:string}>("select status from unified_tasks where id=$1",[rows[1].id])).rows[0].status,'completed');
    await db.exec(sql);
    assert.equal((await db.query('select id from unified_tasks')).rows.length,2);
  } finally {await db.close();}
});
