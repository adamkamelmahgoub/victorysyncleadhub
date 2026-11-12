import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {formLandingLookupSql,formSubmissionLockKey,leadDedupeLockKeys,pageDailyStatsSql,safeHref,validatedFields,validatedSections,validateSubmission} from '../lib/marketing-routes/marketing.js';

test('lead dedupe locks use account, normalized phone and email in a stable order',()=>{
  const account='10000000-0000-4000-8000-000000000001';
  const keys=leadDedupeLockKeys(account,'+1 (512) 555-0101','Person@Example.com');
  assert.deepEqual(keys,[`form-lead:${account}:email:person@example.com`,
    `form-lead:${account}:phone:5125550101`]);
  assert.deepEqual(leadDedupeLockKeys(account,'5125550101','person@example.com'),keys);
  assert.notDeepEqual(leadDedupeLockKeys(null,'5125550101','person@example.com'),keys);
});

test('submission retries serialize by form and key before checking the unique row',async()=>{
  const formA='10000000-0000-4000-8000-000000000001';
  const formB='10000000-0000-4000-8000-000000000002';
  const first=formSubmissionLockKey(formA,'browser-retry');
  assert.equal(first,formSubmissionLockKey(formA,'browser-retry'));
  assert.notEqual(first,formSubmissionLockKey(formB,'browser-retry'));
  assert.notEqual(first,formSubmissionLockKey(formA,'new-submit'));
  const db=new PGlite();
  try{
    await db.exec('begin');
    const locked=await db.query<{locked:boolean}>(
      'select pg_try_advisory_xact_lock(hashtextextended($1,0)) locked',[first]);
    assert.equal(locked.rows[0].locked,true);
    await db.exec('rollback');
  }finally{await db.close();}
});

test('form fields validate types, select choices, and lead mappings',()=>{
  const fields=validatedFields([
    {id:'email_field',label:'Email',fieldType:'email',required:true,mappedLeadField:'email'},
    {id:'service_field',label:'Service',fieldType:'select',required:true,options:['Consulting','Software']},
  ]);
  assert.deepEqual(validateSubmission(fields,{field_email_field:'person@example.com',field_service_field:'Software'}).mapped,{email:'person@example.com'});
  assert.throws(()=>validateSubmission(fields,{field_email_field:'bad',field_service_field:'Software'}),/valid email/);
  assert.throws(()=>validateSubmission(fields,{field_email_field:'person@example.com',field_service_field:'Unknown'}),/invalid option/);
  assert.throws(()=>validatedFields([{id:'choice',label:'Choice',fieldType:'select',options:[]}]),/needs options/);
  assert.throws(()=>validatedFields([{id:'same',label:'One',fieldType:'text'},{id:'same',label:'Two',fieldType:'text'}]),/unique ID/);
  const legacy=validatedFields([{id:'legacy_email',label:'Email',field_type:'email',mapped_lead_field:'email',required:true}]);
  assert.equal(legacy[0].fieldType,'email');
  assert.equal(validateSubmission(legacy,{field_legacy_email:'legacy@example.com'}).mapped.email,'legacy@example.com');
  const existing=validatedFields([{id:'fn',label:'First name',field_type:'text',mapped_lead_field:'firstName'},
    {id:'em',label:'Email',field_type:'email',mapped_lead_field:'email'}]);
  assert.deepEqual(existing.map(field=>field.id),['fn','em']);
  assert.equal(validateSubmission(existing,{field_fn:'Ada',field_em:'ada@example.com'}).mapped.email,'ada@example.com');
});

test('landing page sections accept supported blocks and reject unsafe links',()=>{
  const sections=validatedSections([{type:'hero',heading:'Hello',buttonUrl:'#contact'},{type:'form',heading:'Contact'}]);
  assert.equal(sections.length,2);
  assert.equal(safeHref('#contact'),'#contact');
  assert.equal(safeHref('https://example.com/path'),'https://example.com/path');
  assert.equal(safeHref('javascript:alert(1)'),'#');
  assert.equal(safeHref('//evil.example'),'#');
  assert.throws(()=>validatedSections([{type:'script'}]),/unsupported type/);
});

test('landing page daily report query runs on PostgreSQL',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create table landing_page_events(landing_page_id uuid,organization_id uuid,event_type text,created_at timestamptz default now())');
    const page='00000000-0000-0000-0000-000000000001',org='00000000-0000-0000-0000-000000000002';
    await db.query('insert into landing_page_events(landing_page_id,organization_id,event_type) values($1,$2,$3)',[page,org,'view']);
    const result=await db.query(pageDailyStatsSql,[page,org]);
    assert.equal(result.rows.length,1);
    assert.equal(result.rows[0].views,1);
  }finally{await db.close();}
});

test('lead dedupe transaction lock executes in PostgreSQL',async()=>{
  const db=new PGlite();
  try{
    await db.exec('begin');
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',
      [leadDedupeLockKeys(null,'5125550101','')[0]]);
    await db.exec('rollback');
  }finally{await db.close();}
});

test('a form submission cannot attribute another account page or an unpublished page',async()=>{
  const db=new PGlite();
  const org='00000000-0000-4000-8000-000000000001',accountA='00000000-0000-4000-8000-000000000002';
  const accountB='00000000-0000-4000-8000-000000000003',form='00000000-0000-4000-8000-000000000004';
  const base='00000000-0000-4000-8000-000000000005',variant='00000000-0000-4000-8000-000000000006';
  try{
    await db.exec('create table landing_pages(id uuid,organization_id uuid,client_account_id uuid,form_id uuid,status text,variant_of uuid)');
    await db.query(`insert into landing_pages values($1,$2,$3,$4,'published',null),($5,$2,$3,$4,'published',$1),
      ('00000000-0000-4000-8000-000000000007',$2,$6,$4,'published',null),
      ('00000000-0000-4000-8000-000000000008',$2,$3,$4,'draft',null)`,
      [base,org,accountA,form,variant,accountB]);
    const own=await db.query(formLandingLookupSql,[variant,org,form,accountA]);
    assert.equal(own.rows[0].variant_of,base);
    assert.equal((await db.query(formLandingLookupSql,[variant,org,form,accountB])).rows.length,0);
    assert.equal((await db.query(formLandingLookupSql,['00000000-0000-4000-8000-000000000007',org,form,accountA])).rows.length,0);
    assert.equal((await db.query(formLandingLookupSql,['00000000-0000-4000-8000-000000000008',org,form,accountA])).rows.length,0);
  }finally{await db.close();}
});
