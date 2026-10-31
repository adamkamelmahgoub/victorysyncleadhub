import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {fetchPipelinePage,pipelineBoardQuerySchema} from '../lib/pipeline-board.js';

const stage='11111111-1111-4111-8111-111111111111';
const account='22222222-2222-4222-8222-222222222222';

test('pipeline board pages through older leads and reports the exact stage count',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create table leads(id integer primary key, pipeline_stage_id uuid, client_account_id uuid, created_at timestamptz not null)');
    await db.query(`insert into leads(id,pipeline_stage_id,client_account_id,created_at)
      select n,$1,$2,timestamptz '2020-01-01' + n * interval '1 second' from generate_series(1,1205) n`,[stage,account]);
    await db.query(`insert into leads(id,pipeline_stage_id,client_account_id,created_at)
      values(2000,$1,$2,now())`,[stage,'33333333-3333-4333-8333-333333333333']);
    const decode=(path:string)=>new URL(path,'https://local.invalid').searchParams;
    const condition=(params:URLSearchParams)=>({
      sql:`pipeline_stage_id ${params.get('pipeline_stage_id')==='is.null'?'is null':'= $1'} and client_account_id = $2`,
      values:[stage,account],
    });
    const rows=async(path:string)=>{const p=decode(path);const c=condition(p);
      return (await db.query<{id:number}>(`select id from leads where ${c.sql} order by created_at desc,id desc limit $3 offset $4`,
        [...c.values,Number(p.get('limit')),Number(p.get('offset'))])).rows;};
    const count=async(path:string)=>{const c=condition(decode(path));return Number((await db.query<{count:string}>(
      `select count(*)::text as count from leads where ${c.sql}`,c.values)).rows[0].count);};
    const ids:number[]=[];
    for(let offset=0;offset<1205;offset+=100){
      const page=await fetchPipelinePage(stage,account,offset,100,rows,count);
      assert.equal(page.count,1205);
      assert.equal(page.hasMore,offset+page.rows.length<1205);
      ids.push(...page.rows.map(row=>row.id));
    }
    assert.equal(ids.length,1205);
    assert.equal(new Set(ids).size,1205);
    assert.ok(ids.includes(1),'the oldest lead remains reachable');
    assert.ok(!ids.includes(2000),'another account is excluded');
  } finally {await db.close();}
});

test('pipeline board query rejects unbounded pages and invalid stage ids',()=>{
  assert.equal(pipelineBoardQuerySchema.safeParse({limit:'101'}).success,false);
  assert.equal(pipelineBoardQuerySchema.safeParse({stageId:'../../leads'}).success,false);
});
