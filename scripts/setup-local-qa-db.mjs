// Disposable, Docker-free PostgreSQL fixture. Never connects to Supabase or sends provider events.
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {strict as assert} from 'node:assert';
import {PGlite} from '@electric-sql/pglite';

mkdirSync('.local',{recursive:true});
const dataDir=resolve('.local/victorysync-qa').replaceAll('\\','/');
const db=new PGlite({dataDir:`file://${dataDir}`});
try {
  await db.exec(`
    create table if not exists sub_accounts(id uuid primary key,name text not null,slug text not null);
    create table if not exists pipelines(id uuid primary key,client_account_id uuid references sub_accounts(id),name text not null);
    create table if not exists pipeline_stages(id uuid primary key,pipeline_id uuid references pipelines(id),name text not null,position integer not null);
    create table if not exists leads(id uuid primary key,client_account_id uuid references sub_accounts(id),pipeline_stage_id uuid references pipeline_stages(id),first_name text,last_name text,email text,company text,created_at timestamptz not null,custom_fields jsonb not null default '{}'::jsonb);
    create index if not exists qa_leads_stage_created on leads(pipeline_stage_id,created_at desc,id desc);
    create table if not exists company_tasks(id uuid primary key,company_id uuid,lead_id uuid,client_account_id uuid references sub_accounts(id),title text,status text,priority text,due_at timestamptz,notes text);
    create table if not exists contact_tasks(id uuid primary key,lead_id uuid references leads(id),client_account_id uuid references sub_accounts(id),title text,is_completed boolean,due_date timestamptz,description text);
    create table if not exists conversations(id uuid primary key,client_account_id uuid references sub_accounts(id),lead_id uuid references leads(id),channel text,match_status text);
    create table if not exists messages(id uuid primary key,conversation_id uuid references conversations(id),client_account_id uuid references sub_accounts(id),direction text,body text);
    create table if not exists reviews(id uuid primary key,client_account_id uuid references sub_accounts(id),reviewer text,rating integer,text text);
    create table if not exists marketing_landing_pages(id uuid primary key,client_account_id uuid references sub_accounts(id),title text,slug text,status text,sections jsonb);
    create table if not exists automation_workflows(id uuid primary key,client_account_id uuid references sub_accounts(id),name text,trigger_type text,actions jsonb);
    create table if not exists forms(id uuid primary key,client_account_id uuid references sub_accounts(id),name text,slug text,fields jsonb,status text);
    create table if not exists form_submissions(id uuid primary key,client_account_id uuid references sub_accounts(id),form_id uuid references forms(id),lead_id uuid references leads(id),data jsonb,utm jsonb,submitted_at timestamptz);
    create table if not exists call_reports(id uuid primary key,client_account_id uuid references sub_accounts(id),lead_id uuid references leads(id),direction text,status text,duration_seconds integer,created_at timestamptz);
    create table if not exists review_requests(id uuid primary key,client_account_id uuid references sub_accounts(id),lead_id uuid references leads(id),contact_name text,status text,sent_at timestamptz,clicked_at timestamptz);
    create table if not exists report_sends(id uuid primary key,client_account_id uuid references sub_accounts(id),status text,period_start date,period_end date,pdf_path text);
    create table if not exists invoices(id uuid primary key,client_account_id uuid references sub_accounts(id),status text,total_cents integer,due_at timestamptz);
    create table if not exists ad_spend_entries(id uuid primary key,client_account_id uuid references sub_accounts(id),platform text,month date,amount_cents integer);
    create table if not exists automation_runs(id uuid primary key,client_account_id uuid references sub_accounts(id),workflow_id uuid references automation_workflows(id),lead_id uuid references leads(id),status text,started_at timestamptz);
    create table if not exists booking_appointments(id uuid primary key,client_account_id uuid references sub_accounts(id),lead_id uuid references leads(id),starts_at timestamptz,status text);
    truncate booking_appointments,automation_runs,ad_spend_entries,invoices,report_sends,review_requests,call_reports,form_submissions,forms,messages,conversations,reviews,marketing_landing_pages,automation_workflows,company_tasks,contact_tasks,leads,pipeline_stages,pipelines,sub_accounts;
    insert into sub_accounts values
      ('10000000-0000-4000-8000-000000000001','Demo Plumbing','demo-plumbing'),
      ('10000000-0000-4000-8000-000000000002','Demo HVAC','demo-hvac'),
      ('10000000-0000-4000-8000-000000000003','Demo Roofing','demo-roofing');
    insert into pipelines select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Sales pipeline'
      from generate_series(1,3) n;
    insert into pipeline_stages select ('30000000-0000-4000-8000-'||lpad((p*10+s)::text,12,'0'))::uuid,
      ('20000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      (array['New','Contacted','Quoted','Booked','Won','Lost'])[s],s
      from generate_series(1,3) p cross join generate_series(1,6) s;
    insert into leads(id,client_account_id,pipeline_stage_id,first_name,last_name,email,company,created_at,custom_fields)
      select ('40000000-0000-4000-8000-'||lpad((p*10000+n)::text,12,'0'))::uuid,
        ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
        ('30000000-0000-4000-8000-'||lpad((p*10+(n%6)+1)::text,12,'0'))::uuid,
        'Demo','Contact '||n,'demo-'||p||'-'||n||'@example.invalid',
        (array['Demo Plumbing','Demo HVAC','Demo Roofing'])[p],
        timestamptz '2024-01-01' + n*interval '1 hour','{}'::jsonb
      from generate_series(1,3) p cross join generate_series(1,300) n;
    insert into leads(id,client_account_id,pipeline_stage_id,first_name,last_name,email,company,created_at,custom_fields)
      select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000011','Older','Lead '||n,
        'older-'||n||'@example.invalid','Demo Plumbing',
        timestamptz '2020-01-01'+n*interval '1 minute',
        case when n=1 then '{"original_created_at":"2019-12-01T00:00:00Z"}'::jsonb else '{}'::jsonb end
      from generate_series(1,1205) n;
    insert into contact_tasks select ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      ('40000000-0000-4000-8000-'||lpad((10000+n)::text,12,'0'))::uuid,
      '10000000-0000-4000-8000-000000000001','Follow up with demo contact '||n,false,
      now()+n*interval '1 day','Demo follow-up' from generate_series(1,30) n;
    insert into reviews values('70000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001','Demo reviewer',5,'Fixture review, not real social proof');
    insert into marketing_landing_pages values('80000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001','Demo landing page','demo-page','draft','[]'::jsonb);
    insert into forms select ('81000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      'Demo contact form '||p,'demo-form-'||p,'[{"name":"name","type":"text","required":true}]'::jsonb,'active'
      from generate_series(1,3) p;
    insert into form_submissions select ('82000000-0000-4000-8000-'||lpad((p*100+n)::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('81000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('40000000-0000-4000-8000-'||lpad((p*10000+n)::text,12,'0'))::uuid,
      jsonb_build_object('name','Demo Contact '||n),jsonb_build_object('utm_source','fixture'),
      timestamptz '2024-01-01'+n*interval '1 day'
      from generate_series(1,3) p cross join generate_series(1,10) n;
    insert into call_reports select ('83000000-0000-4000-8000-'||lpad((p*100+n)::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('40000000-0000-4000-8000-'||lpad((p*10000+n)::text,12,'0'))::uuid,
      'inbound',case when n%3=0 then 'missed' else 'answered' end,60+n,
      timestamptz '2024-01-01'+n*interval '1 day'
      from generate_series(1,3) p cross join generate_series(1,12) n;
    insert into review_requests select ('84000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('40000000-0000-4000-8000-'||lpad((p*10000+1)::text,12,'0'))::uuid,
      'Demo Contact 1','sent',timestamptz '2024-02-01',null
      from generate_series(1,3) p;
    insert into report_sends select ('85000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      'draft',date '2024-01-01',date '2024-01-31',null
      from generate_series(1,3) p;
    insert into invoices select ('86000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      'open',10000*p,timestamptz '2024-03-01'
      from generate_series(1,3) p;
    insert into ad_spend_entries select ('87000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      'google_ads',date '2024-01-01',50000*p
      from generate_series(1,3) p;
    insert into automation_workflows select ('88000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      'Demo follow-up '||p,'form_submitted','[{"type":"wait","minutes":1}]'::jsonb
      from generate_series(1,3) p;
    insert into automation_runs select ('89000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('88000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('40000000-0000-4000-8000-'||lpad((p*10000+1)::text,12,'0'))::uuid,
      'completed',timestamptz '2024-02-01'
      from generate_series(1,3) p;
    insert into booking_appointments select ('90000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(p::text,12,'0'))::uuid,
      ('40000000-0000-4000-8000-'||lpad((p*10000+2)::text,12,'0'))::uuid,
      timestamptz '2024-02-05','confirmed'
      from generate_series(1,3) p;
  `);
  const result=await db.query(`select
    (select count(*) from sub_accounts)::integer as accounts,
    (select count(*) from leads)::integer as leads,
    (select count(*) from forms)::integer as forms,
    (select count(*) from form_submissions)::integer as submissions,
    (select count(*) from call_reports)::integer as calls,
    (select count(*) from report_sends)::integer as reports,
    (select count(*) from invoices)::integer as invoices,
    (select count(*) from automation_runs)::integer as runs,
    (select count(*) from form_submissions s join leads l on l.id=s.lead_id where s.client_account_id<>l.client_account_id)::integer as cross_account_submissions,
    (select count(*) from call_reports c join leads l on l.id=c.lead_id where c.client_account_id<>l.client_account_id)::integer as cross_account_calls`);
  const counts=result.rows[0];
  assert.deepEqual(counts,{accounts:3,leads:2105,forms:3,submissions:30,calls:36,reports:3,invoices:3,runs:3,cross_account_submissions:0,cross_account_calls:0});
  console.log(`Local QA database ready: ${dataDir}, ${counts.leads} synthetic leads, ${counts.calls} calls, ${counts.submissions} form submissions`);
} finally {await db.close();}
