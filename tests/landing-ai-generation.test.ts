import test from 'node:test';
import assert from 'node:assert/strict';
import {aiJsonSchema,aiResponseSchema,pageSchema} from '../api/portal.js';
import {assertApprovedAiImages,assertNoUnsupportedProof} from '../lib/landing-ai-policy.js';

const blocks=[{id:'service-1',type:'Service',heading:'Drain cleaning',body:'Ask about an appointment.',
  imageUrl:'',hidden:false,attested:false}];
const generated={title:'Austin drain cleaning',seoDescription:'Schedule drain cleaning in Austin.',
  theme:{background:'#ffffff',foreground:'#172033',accent:'#285ce6',font:'sans'},
  sections:[{id:'services-1',type:'services',heading:'Drain cleaning in Austin',body:'Tell us what you need.',
    buttonText:'Request a visit',buttonUrl:'#contact',imageUrl:'',formId:'',items:[],blocks}]};

test('structured AI generation includes ordered blocks that the portal can save',()=>{
  assert.ok('blocks' in aiJsonSchema.properties.sections.items.properties);
  const page=aiResponseSchema.parse(generated);
  assertNoUnsupportedProof([{heading:page.title,body:page.seoDescription},...page.sections]);
  assertApprovedAiImages(page.sections,[]);
  const saved=pageSchema.parse({action:'save_page',id:null,title:page.title,slug:'austin-drain-cleaning',
    sections:page.sections,theme:page.theme,seoDescription:page.seoDescription,status:'draft'});
  assert.deepEqual(saved.sections[0].blocks,blocks);
});

test('AI generation rejects blocks beyond the section limit and unapproved images',()=>{
  assert.equal(aiResponseSchema.safeParse({...generated,sections:[{...generated.sections[0],blocks:[
    ...blocks,...Array.from({length:12},(_,index)=>({...blocks[0],id:`service-${index+2}`}))]}]}).success,false);
  assert.throws(()=>assertApprovedAiImages([{blocks:[{imageUrl:'https://example.com/invented.jpg'}]}],[]),/unapproved image/);
  const invalid={...generated,sections:[{...generated.sections[0],blocks:[{...blocks[0],type:'Question'}]}]};
  assert.equal(aiResponseSchema.safeParse(invalid).success,false);
  assert.equal(pageSchema.safeParse({action:'save_page',id:null,title:invalid.title,slug:'austin-drain-cleaning',
    sections:invalid.sections,theme:invalid.theme,seoDescription:invalid.seoDescription,status:'draft'}).success,false);
});
