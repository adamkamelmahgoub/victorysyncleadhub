import {z} from 'zod';
import {newSection,registry,sectionTypes,sectionsSchema,themeSchema} from './landing-section-registry.js';
import {assertApprovedAiImages,assertNoUnsupportedProof} from './landing-ai-policy.js';
import type {RenderSection,RenderTheme} from './landing-renderer.js';

const id=z.string().min(1).max(80);
const copy=z.string().max(3000).refine(value=>!/<\/?[a-z][^>]*>/i.test(value)&&!value.includes('—'),
  'Use plain text without HTML or em dashes');
const safeType=z.enum(sectionTypes).exclude(['reviews','testimonial','trust_bar']);
const sectionField=z.enum(['eyebrow','heading','body','buttonText','buttonUrl','imageUrl','imageAlt']);
const blockField=z.enum(['heading','body']);
const themeField=z.enum(['primary','background','text','accent','font']);

export const aiPatchSchema=z.discriminatedUnion('op',[
  z.object({op:z.literal('add_section'),newId:id,sectionType:safeType,afterId:id.nullable(),heading:copy,body:copy}).strict(),
  z.object({op:z.literal('remove_section'),sectionId:id}).strict(),
  z.object({op:z.literal('move_section'),sectionId:id,afterId:id.nullable()}).strict(),
  z.object({op:z.literal('update_settings'),sectionId:id,field:sectionField,value:copy}).strict(),
  z.object({op:z.literal('add_block'),sectionId:id,newId:id,heading:copy,body:copy}).strict(),
  z.object({op:z.literal('update_block'),sectionId:id,blockId:id,field:blockField,value:copy}).strict(),
  z.object({op:z.literal('update_theme'),field:themeField,value:copy}).strict(),
]);
export const aiPatchResponseSchema=z.object({summary:z.string().max(500),patches:z.array(aiPatchSchema).min(1).max(20)}).strict();
export type AiPatch=z.infer<typeof aiPatchSchema>;

export const aiPatchJsonSchema={
  type:'object',additionalProperties:false,required:['summary','patches'],
  properties:{summary:{type:'string'},patches:{type:'array',minItems:1,maxItems:20,items:{anyOf:[
    {type:'object',additionalProperties:false,required:['op','newId','sectionType','afterId','heading','body'],properties:{op:{type:'string',enum:['add_section']},newId:{type:'string'},sectionType:{type:'string',enum:sectionTypes.filter(type=>!['reviews','testimonial','trust_bar'].includes(type))},afterId:{type:['string','null']},heading:{type:'string'},body:{type:'string'}}},
    {type:'object',additionalProperties:false,required:['op','sectionId'],properties:{op:{type:'string',enum:['remove_section']},sectionId:{type:'string'}}},
    {type:'object',additionalProperties:false,required:['op','sectionId','afterId'],properties:{op:{type:'string',enum:['move_section']},sectionId:{type:'string'},afterId:{type:['string','null']}}},
    {type:'object',additionalProperties:false,required:['op','sectionId','field','value'],properties:{op:{type:'string',enum:['update_settings']},sectionId:{type:'string'},field:{type:'string',enum:sectionField.options},value:{type:'string'}}},
    {type:'object',additionalProperties:false,required:['op','sectionId','newId','heading','body'],properties:{op:{type:'string',enum:['add_block']},sectionId:{type:'string'},newId:{type:'string'},heading:{type:'string'},body:{type:'string'}}},
    {type:'object',additionalProperties:false,required:['op','sectionId','blockId','field','value'],properties:{op:{type:'string',enum:['update_block']},sectionId:{type:'string'},blockId:{type:'string'},field:{type:'string',enum:blockField.options},value:{type:'string'}}},
    {type:'object',additionalProperties:false,required:['op','field','value'],properties:{op:{type:'string',enum:['update_theme']},field:{type:'string',enum:themeField.options},value:{type:'string'}}},
  ]}}},
} as const;

export function applyAiPatches(sections:RenderSection[],theme:RenderTheme,patches:AiPatch[],approvedImages:Iterable<string>){
  const next=structuredClone(sections),nextTheme={...theme};
  const changed=new Set<string>();
  const find=(sectionId:string)=>{const index=next.findIndex(section=>section.id===sectionId);if(index<0)throw Error('AI edit references a missing section');return index};
  for(const patch of patches){
    if(patch.op==='add_section'){
      if(next.some(section=>section.id===patch.newId))throw Error('AI edit repeats a section ID');
      const section={...newSection(patch.sectionType),id:patch.newId,heading:patch.heading,body:patch.body} as RenderSection;
      const at=patch.afterId===null?next.length:find(patch.afterId)+1;
      next.splice(at,0,section);changed.add(section.id);
    }else if(patch.op==='remove_section'){
      next.splice(find(patch.sectionId),1);
    }else if(patch.op==='move_section'){
      const from=find(patch.sectionId),[section]=next.splice(from,1);
      const at=patch.afterId===null?next.length:find(patch.afterId)+1;
      next.splice(at,0,section);
    }else if(patch.op==='update_settings'){
      const section=next[find(patch.sectionId)] as RenderSection;
      (section as unknown as Record<string,unknown>)[patch.field]=patch.value;
      changed.add(section.id);
    }else if(patch.op==='add_block'){
      const section=next[find(patch.sectionId)] as RenderSection;
      if((section.blocks?.length||0)>=registry[section.type].maxBlocks)throw Error('AI edit exceeds the block limit');
      if(next.some(item=>item.blocks?.some(block=>block.id===patch.newId)))throw Error('AI edit repeats a block ID');
      section.blocks=[...(section.blocks||[]),{id:patch.newId,type:registry[section.type].blockLabel||'item',heading:patch.heading,body:patch.body}];
      changed.add(section.id);
    }else if(patch.op==='update_block'){
      const section=next[find(patch.sectionId)] as RenderSection;
      const block=section.blocks?.find(item=>item.id===patch.blockId);
      if(!block)throw Error('AI edit references a missing block');
      block[patch.field]=patch.value;changed.add(section.id);
    }else{
      (nextTheme as Record<string,unknown>)[patch.field]=patch.value;
    }
  }
  if(next.length===0)throw Error('AI edit cannot remove every section');
  const validSections=sectionsSchema.max(40).parse(next) as RenderSection[];
  const validTheme=themeSchema.parse(nextTheme) as RenderTheme;
  const edited=validSections.filter(section=>changed.has(section.id));
  assertNoUnsupportedProof(edited);
  assertApprovedAiImages(edited,approvedImages);
  return {sections:validSections,theme:validTheme};
}
