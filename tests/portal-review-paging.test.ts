import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';

test('review and request pages traverse all rows without leaking accounts',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;create role anon;
      create table public.reviews(id uuid primary key,client_account_id uuid,platform text,
        reviewer text,rating integer,text text,reply text,replied_at timestamptz,
        review_url text,created_at timestamptz);
      create table public.review_requests(id uuid primary key,client_account_id uuid,
        contact_name text,channel text,platform text,status text,sent_at timestamptz,clicked_at timestamptz);
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      insert into public.reviews(id,client_account_id,created_at)
        select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          '2026-10-01T00:00:00Z' from generate_series(1,125) i;
      insert into public.review_requests(id,client_account_id,sent_at)
        select ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          '2026-10-01T00:00:00Z' from generate_series(1,125) i;
      insert into public.reviews values
        ('50000000-0000-4000-8000-000000000001','${accountB}',null,null,null,null,null,null,null,'2026-10-01T00:00:00Z');
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261102_18_portal_review_paging.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated;set test.account='${accountA}'`);
    for(const kind of ['reviews','requests']){
      const ids:string[]=[];
      let cursor:{at:string;id:string}|null=null;
      do{
        const result=await db.query<{page:{rows:Array<{id:string}>;nextCursor:{at:string;id:string}|null}}>(
          `select public.portal_review_page('${accountA}','${kind}',${cursor?`'${cursor.at}'`:'null'},${cursor?`'${cursor.id}'`:'null'},100) as page`);
        ids.push(...result.rows[0].page.rows.map(row=>row.id));
        cursor=result.rows[0].page.nextCursor;
      }while(cursor);
      assert.equal(ids.length,125);
      assert.equal(new Set(ids).size,125);
    }
    await assert.rejects(db.query(`select public.portal_review_page('${accountB}','reviews')`),/Review page unavailable/);
    await assert.rejects(db.query(`select public.portal_review_page('${accountA}',null)`),/Review page unavailable/);
  }finally{await db.close()}
});
