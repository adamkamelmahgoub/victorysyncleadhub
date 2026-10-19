import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderDmTemplate} from '../lib/dm-template.ts';
test('renders only known fields and keeps stable spintax draft',()=>{
  const body='{Hi|Hello} {{first_name}}, {{company}} in {{city}}. {{unsupported}}';
  const a=renderDmTemplate(body,{first_name:'Ada',company:'Acme',city:'Cairo'},true,'lead-1');
  assert.equal(a,renderDmTemplate(body,{first_name:'Ada',company:'Acme',city:'Cairo'},true,'lead-1'));
  assert.match(a,/(Hi|Hello) Ada, Acme in Cairo\./);
  assert.ok(!a.includes('unsupported'));
});
