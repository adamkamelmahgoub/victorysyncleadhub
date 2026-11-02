import {z} from 'zod';

export const sectionTypes = ['announcement','header','hero','trust_bar','services','features','gallery','image_text','reviews','testimonial','offer','steps','service_area','faq','form','cta','video','footer','text','image','spacer'] as const;
export type SectionType = typeof sectionTypes[number];
export type FieldType = 'text'|'richtext'|'image'|'url'|'color'|'select'|'toggle'|'number'|'list';
export type Field = {key:string;label:string;type:FieldType;options?:string[]};
export type SectionDefinition = {type:SectionType;label:string;icon:string;fields:Field[];maxBlocks:number;blockLabel?:string;defaults:Record<string,unknown>};
const text=(key:string,label:string):Field=>({key,label,type:'text'});
const rich=(key:string,label:string):Field=>({key,label,type:'richtext'});
const list=(key:string,label:string):Field=>({key,label,type:'list'});
const image=(key:string,label:string):Field=>({key,label,type:'image'});
const url=(key:string,label:string):Field=>({key,label,type:'url'});
const button=[text('buttonText','Button text'),url('buttonUrl','Button link')];
export const registry:Record<SectionType,SectionDefinition>={
  announcement:{type:'announcement',label:'Announcement bar',icon:'Megaphone',fields:[text('heading','Message'),url('buttonUrl','Link')],maxBlocks:0,defaults:{heading:'Add an announcement'}},
  header:{type:'header',label:'Header',icon:'PanelTop',fields:[image('imageUrl','Logo'),text('heading','Business name'),text('body','Phone'),...button],maxBlocks:0,defaults:{heading:'[Business name]',body:'[Business phone]'}},
  hero:{type:'hero',label:'Hero',icon:'LayoutTemplate',fields:[text('eyebrow','Eyebrow'),text('heading','Headline'),rich('body','Supporting text'),image('imageUrl','Hero image'),...button],maxBlocks:6,blockLabel:'Trust badge',defaults:{heading:'[Service] in [City]',body:'Describe how you help customers.',buttonText:'Get a quote',buttonUrl:'#contact'}},
  trust_bar:{type:'trust_bar',label:'Trust bar',icon:'BadgeCheck',fields:[text('heading','Heading'),list('items','Verified facts')],maxBlocks:6,blockLabel:'Fact',defaults:{heading:'Why customers choose us',items:[]}},
  services:{type:'services',label:'Services grid',icon:'Grid2X2',fields:[text('heading','Heading'),rich('body','Introduction')],maxBlocks:12,blockLabel:'Service',defaults:{heading:'Our services'}},
  features:{type:'features',label:'Benefits',icon:'ListChecks',fields:[text('heading','Heading'),rich('body','Introduction'),list('items','Benefits')],maxBlocks:12,blockLabel:'Benefit',defaults:{heading:'How we help'}},
  gallery:{type:'gallery',label:'Before and after',icon:'Images',fields:[text('heading','Heading')],maxBlocks:12,blockLabel:'Image pair',defaults:{heading:'Our work'}},
  image_text:{type:'image_text',label:'Image with text',icon:'Image',fields:[text('heading','Heading'),rich('body','Text'),image('imageUrl','Image'),...button],maxBlocks:0,defaults:{heading:'About our work'}},
  reviews:{type:'reviews',label:'Reviews',icon:'Star',fields:[text('heading','Heading'),rich('body','Introduction')],maxBlocks:12,blockLabel:'Real review',defaults:{heading:'Customer feedback'}},
  testimonial:{type:'testimonial',label:'Legacy quote',icon:'Quote',fields:[text('quote','Verified quote'),text('author','Customer name')],maxBlocks:0,defaults:{quote:'[Add a real customer review]',author:'[Customer name]'}},
  offer:{type:'offer',label:'Offer',icon:'Ticket',fields:[text('heading','Offer headline'),rich('body','Offer details'),...button],maxBlocks:0,defaults:{heading:'[Add your real offer]',buttonText:'Ask about this offer',buttonUrl:'#contact'}},
  steps:{type:'steps',label:'How it works',icon:'ListOrdered',fields:[text('heading','Heading')],maxBlocks:8,blockLabel:'Step',defaults:{heading:'How it works'}},
  service_area:{type:'service_area',label:'Service area',icon:'MapPin',fields:[text('heading','Heading'),rich('body','Description'),list('items','Cities')],maxBlocks:0,defaults:{heading:'Where we work'}},
  faq:{type:'faq',label:'FAQ',icon:'CircleHelp',fields:[text('heading','Heading'),list('items','Questions and answers')],maxBlocks:20,blockLabel:'Question',defaults:{heading:'Common questions'}},
  form:{type:'form',label:'Lead form',icon:'ClipboardList',fields:[text('heading','Heading'),rich('body','Introduction')],maxBlocks:0,defaults:{heading:'Get in touch'}},
  cta:{type:'cta',label:'Call to action',icon:'MousePointerClick',fields:[text('heading','Heading'),rich('body','Text'),...button],maxBlocks:0,defaults:{heading:'Ready to get started?',buttonText:'Contact us',buttonUrl:'#contact'}},
  video:{type:'video',label:'Video',icon:'Play',fields:[text('heading','Heading'),url('buttonUrl','Video URL')],maxBlocks:0,defaults:{heading:'See how we work'}},
  footer:{type:'footer',label:'Footer',icon:'PanelBottom',fields:[text('heading','Business name'),rich('body','Contact details')],maxBlocks:0,defaults:{heading:'[Business name]'}},
  text:{type:'text',label:'Text',icon:'AlignLeft',fields:[text('heading','Heading'),rich('body','Text')],maxBlocks:0,defaults:{heading:'About us'}},
  image:{type:'image',label:'Image',icon:'Image',fields:[text('heading','Heading'),image('imageUrl','Image'),text('imageAlt','Image description')],maxBlocks:0,defaults:{heading:'Our work'}},
  spacer:{type:'spacer',label:'Spacer',icon:'Space',fields:[],maxBlocks:0,defaults:{}},
};

const safeUrl=z.string().max(1000).refine(value=>!value || /^(https:\/\/|tel:|mailto:|\/(?!\/)|#[a-z\d_-]+)/i.test(value),'Use an HTTPS, phone, email, internal, or anchor link');
export const blockSchema=z.object({id:z.string().max(80),type:z.string().max(40),hidden:z.boolean().optional(),heading:z.string().max(500).optional(),body:z.string().max(3000).optional(),imageUrl:z.string().max(1000).optional(),attested:z.boolean().optional()}).passthrough();
export const sectionSchema=z.object({id:z.string().max(80),type:z.enum(sectionTypes),hidden:z.boolean().optional(),eyebrow:z.string().max(500).optional(),heading:z.string().max(500).optional(),body:z.string().max(5000).optional(),buttonText:z.string().max(500).optional(),buttonUrl:safeUrl.optional(),imageUrl:safeUrl.optional(),imageAlt:z.string().max(500).optional(),quote:z.string().max(3000).optional(),author:z.string().max(300).optional(),items:z.array(z.string().max(500)).max(30).optional(),blocks:z.array(blockSchema).max(20).optional()}).passthrough().superRefine((section,ctx)=>{
  if((section.blocks?.length||0)>registry[section.type].maxBlocks)ctx.addIssue({code:'custom',message:'Too many blocks'});
  if(section.type==='reviews'&&section.blocks?.some(block=>!block.attested))ctx.addIssue({code:'custom',message:'Manual reviews require attestation'});
});
export const sectionsSchema=z.array(sectionSchema).max(60);
export const themeSchema=z.object({primary:z.string().regex(/^#[0-9a-f]{6}$/i),background:z.string().regex(/^#[0-9a-f]{6}$/i),text:z.string().regex(/^#[0-9a-f]{6}$/i),accent:z.string().regex(/^#[0-9a-f]{6}$/i).optional(),font:z.enum(['system','serif','inter','poppins','lato','montserrat']).default('system'),buttonRadius:z.number().min(0).max(32).optional(),spacing:z.number().min(0.75).max(1.5).optional(),logoUrl:z.string().max(1000).optional()}).passthrough();
export function newSection(type:SectionType){return {id:crypto.randomUUID(),type,...registry[type].defaults,blocks:[]};}
