// Disposable, Docker-free PostgreSQL fixture. Never connects to Supabase or sends provider events.
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
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
    truncate messages,conversations,reviews,marketing_landing_pages,automation_workflows,company_tasks,contact_tasks,leads,pipeline_stages,pipelines,sub_accounts;
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
  `);
  const result=await db.query('select count(*)::integer as count from leads');
  console.log(`Local QA database ready: ${dataDir}, ${result.rows[0].count} synthetic leads`);
} finally {await db.close();}
