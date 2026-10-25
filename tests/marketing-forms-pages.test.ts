import assert from 'node:assert/strict';
import test from 'node:test';
import {safeHref,validatedFields,validatedSections,validateSubmission} from '../lib/marketing-routes/marketing.js';

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
