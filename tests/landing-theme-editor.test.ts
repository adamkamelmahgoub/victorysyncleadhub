import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registry,sectionsSchema} from '../lib/landing-section-registry.js';
import {renderPage} from '../lib/landing-renderer.js';

test('all section types have editor metadata and render without executable user HTML',()=>{
  const sections=Object.values(registry).map((item,index)=>({id:`section-${index}`,type:item.type,body:'Useful details',...item.defaults,heading:`${item.label} <script>alert(1)</script>`,blocks:[]}));
  assert.equal(sectionsSchema.safeParse(sections).success,true);
  const html=renderPage({name:'Sample',sections,theme:{primary:'#245eea',background:'#ffffff',text:'#17243d'}});
  assert.match(html,/section-hero/);
  assert.match(html,/section-footer/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/&lt;script&gt;/);
});

test('draft preview selection is present only in editor HTML',()=>{
  const page={name:'Draft',sections:[{id:'a',type:'hero' as const,heading:'Repair in Austin',buttonText:'Call',buttonUrl:'tel:+15125550100'}],theme:{primary:'#245eea'}};
  const preview=renderPage(page,null,true),published=renderPage(page);
  assert.match(preview,/landing-select/);
  assert.match(preview,/landing-edit/);
  assert.match(preview,/contenteditable="true" data-field="heading"/);
  assert.doesNotMatch(published,/landing-select/);
  assert.doesNotMatch(published,/contenteditable/);
  assert.match(published,/tel:\+15125550100/);
});

test('manual review blocks require a real-review attestation',()=>{
  const section={id:'review',type:'reviews',blocks:[{id:'quote',type:'review',heading:'Customer',body:'Good work'}]};
  assert.equal(sectionsSchema.safeParse([section]).success,false);
  assert.equal(sectionsSchema.safeParse([{...section,blocks:[{...section.blocks[0],attested:true}]}]).success,true);
});
