import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';

test('review summary counts all records, not only the visible 100',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;create role anon;
      create table public.reviews(id uuid primary key,client_account_id uuid,rating integer,created_at timestamptz);
      create table public.review_requests(id uuid primary key,client_account_id uuid,sent_at timestamptz,clicked_at timestamptz);
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      insert into public.reviews(id,client_account_id,rating,created_at)
        select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          case when i<=100 then 5 else 4 end,now() from generate_series(1,125) i;
      insert into public.review_requests(id,client_account_id,sent_at,clicked_at)
        select ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          now(),case when i<=45 then now() else null end from generate_series(1,130) i;
      insert into public.reviews values
        ('50000000-0000-4000-8000-000000000001','${accountB}',1,now());
      insert into public.review_requests values
        ('60000000-0000-4000-8000-000000000001','${accountB}',now(),now());
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261102_17_portal_review_summary.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated;set test.account='${accountA}'`);
    const summary=(await db.query<{summary:{requestsSent:number;requestsClicked:number;
      reviewsReceived:number;averageRating:number;trend:Array<{count:number}>}}>(
      `select public.portal_review_summary('${accountA}') as summary`)).rows[0].summary;
    assert.equal(summary.requestsSent,130);
    assert.equal(summary.requestsClicked,45);
    assert.equal(summary.reviewsReceived,125);
    assert.equal(summary.averageRating,4.8);
    assert.equal(summary.trend.reduce((count,month)=>count+month.count,0),125);
    await assert.rejects(db.query(`select public.portal_review_summary('${accountB}')`),/Review summary unavailable/);
  }finally{await db.close()}
});
