import test from 'node:test';
import assert from 'node:assert/strict';
import {aiPatchResponseSchema,applyAiPatches} from '../lib/landing-ai-patches.js';
import type {RenderSection,RenderTheme} from '../lib/landing-renderer.js';

const theme:RenderTheme={primary:'#245eea',background:'#ffffff',text:'#111827',accent:'#245eea',font:'system'};
const sections:RenderSection[]=[
  {id:'hero-1',type:'hero',heading:'Plumber in Austin',blocks:[{id:'badge-1',type:'Trust badge',heading:'Fast scheduling'}]},
  {id:'faq-1',type:'faq',heading:'Questions',blocks:[]},
];

test('AI patch schema accepts the seven edit operations',()=>{
  const patches=[
    {op:'add_section',newId:'cta-1',sectionType:'cta',afterId:'hero-1',heading:'Get help',body:'Call today'},
    {op:'remove_section',sectionId:'cta-1'},
    {op:'move_section',sectionId:'faq-1',afterId:'hero-1'},
    {op:'update_settings',sectionId:'hero-1',field:'heading',value:'Emergency plumber in Austin'},
    {op:'add_block',sectionId:'faq-1',newId:'question-1',heading:'When are you open?',body:'Call us for availability.'},
    {op:'update_block',sectionId:'hero-1',blockId:'badge-1',field:'heading',value:'Easy scheduling'},
    {op:'update_theme',field:'primary',value:'#114488'},
  ];
  assert.equal(aiPatchResponseSchema.safeParse({summary:'Update the page',patches}).success,true);
  const applied=applyAiPatches(sections,theme,aiPatchResponseSchema.parse({summary:'Update the page',patches}).patches,[]);
  assert.equal(applied.sections[0].heading,'Emergency plumber in Austin');
  assert.equal(applied.sections[0].blocks?.[0].heading,'Easy scheduling');
  assert.equal(applied.sections[1].blocks?.[0].heading,'When are you open?');
  assert.equal(applied.sections.length,2);
  assert.equal(applied.theme.primary,'#114488');
  assert.equal(sections[0].heading,'Plumber in Austin');
});

test('AI patches reject unsafe links, invented proof, unsupported images and missing targets',()=>{
  const apply=(patches:unknown)=>applyAiPatches(sections,theme,aiPatchResponseSchema.parse({summary:'Edit',patches}).patches,[]);
  assert.throws(()=>apply([{op:'update_settings',sectionId:'hero-1',field:'buttonUrl',value:'javascript:alert(1)'}]),/Invalid|validation|url/i);
  assert.throws(()=>apply([{op:'update_block',sectionId:'hero-1',blockId:'badge-1',field:'heading',value:'5-star reviews'}]),/unsupported claims/);
  assert.throws(()=>apply([{op:'update_settings',sectionId:'hero-1',field:'imageUrl',value:'https://example.com/invented.jpg'}]),/unapproved image/);
  assert.throws(()=>apply([{op:'remove_section',sectionId:'missing'}]),/missing section/);
  assert.equal(aiPatchResponseSchema.safeParse({summary:'Edit',patches:[{op:'update_settings',sectionId:'hero-1',field:'heading',value:'<h1>Raw HTML</h1>'}]}).success,false);
});

test('AI patches preserve verified review sections that were not edited',()=>{
  const current:RenderSection[]=[...sections,{id:'reviews-1',type:'reviews',heading:'Customer reviews',blocks:[
    {id:'real-1',type:'Real review',heading:'Real customer',body:'Excellent service',attested:true},
  ]}];
  const patches=aiPatchResponseSchema.parse({summary:'Shorten hero',patches:[
    {op:'update_settings',sectionId:'hero-1',field:'body',value:'Call us for plumbing help.'},
  ]}).patches;
  const applied=applyAiPatches(current,theme,patches,[]);
  assert.deepEqual(applied.sections[2],current[2]);
});
