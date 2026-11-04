import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { assertNoUnsupportedProof,assertApprovedAiImages } from '../lib/landing-ai-policy.js';
import {aiPageInputSchema,aiPageEditInputSchema} from '../lib/landing-ai-input.js';
import {aiPatchJsonSchema,aiPatchResponseSchema,applyAiPatches} from '../lib/landing-ai-patches.js';
import {mcpPool} from '../lib/mcp-auth.js';
import {registry,sectionTypes} from '../lib/landing-section-registry.js';
import {clientInviteUrl} from '../lib/client-invite.js';
import {readPortalSelection,signPortalSelection,type PortalSelection} from '../lib/portal-cookie.js';
import {externalSendsEnabled} from '../lib/external-send-mode.js';
import {portalBillingReturnUrl} from '../lib/portal-billing-url.js';
import {requiresAgencyMfa} from '../lib/portal-roles.js';
import {providerReadiness} from '../lib/provider-readiness.js';
import {approvedAiImageUrls} from '../lib/landing-ai-approved-images.js';
import {aiPageLimitsSql,assertAiPageLimits,aiUsageCostCents} from '../lib/landing-ai-budget.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };
const ORG = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
const uuid = z.string().uuid();
const section = z.enum(['dashboard','leads','calls','pages','forms','reviews','reports','billing','settings']);
const querySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accounts') }),
  z.object({ action: z.literal('agency_overview') }),
  z.object({ action: z.literal('provider_readiness') }),
  z.object({ action: z.literal('failed_automations') }),
  z.object({ action: z.literal('closed_companies') }),
  z.object({ action: z.literal('features') }),
  z.object({ action: z.literal('staff') }),
  z.object({ action: z.literal('ai_model') }),
  z.object({ action: z.literal('launchpad') }),
  z.object({ action: z.literal('metrics'), from: z.string().datetime(), to: z.string().datetime() }),
  z.object({ action: z.literal('lead_timeline'), leadId: uuid }),
  z.object({ action: z.literal('won_leads'), query:z.string().max(100) }).strict(),
  z.object({ action: z.literal('review_summary') }),
  z.object({ action: z.literal('review_page'), kind:z.enum(['reviews','requests']),
    beforeAt:z.string().datetime({offset:true}).optional(),beforeId:uuid.optional() }).strict(),
  z.object({ action: z.literal('lead_page'), beforeAt: z.string().datetime({offset:true}), beforeId: uuid }).strict(),
  z.object({ action: z.literal('ad_spend') }),
  z.object({ action: z.literal('page_stats') }),
  z.object({ action: z.literal('page_edit_allowed') }),
  z.object({ action: z.literal('page_versions'), pageId:uuid }),
  z.object({ action: z.literal('report_file'), reportId:uuid }),
  z.object({ action: z.literal('reports') }),
  z.object({ action: z.literal('report_recipients') }),
  z.object({ action: z.literal('billing_summary') }),
  z.object({ action: z.literal('branding') }),
  z.object({ action: z.literal('client_settings') }),
  z.object({ action: z.literal('usage') }),
  z.object({ action: z.literal('calls'), from:z.string().datetime(),to:z.string().datetime(),
    outcome:z.enum(['booked','message_taken','spam','existing_customer','other']).optional() }),
  z.object({ action: z.literal('call_page'), from:z.string().datetime(),to:z.string().datetime(),
    outcome:z.enum(['booked','message_taken','spam','existing_customer','other']).optional(),
    beforeAt:z.string().datetime({offset:true}),beforeId:uuid }).strict(),
  z.object({ action: z.literal('snapshot'), section }),
  z.object({ action: z.literal('export'), section: z.enum(['leads','calls','reviews','reports']) }),
]);
const sectionSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(sectionTypes),
  eyebrow:z.string().max(500).optional(),imageAlt:z.string().max(500).optional(),
  quote:z.string().max(3000).optional(),author:z.string().max(300).optional(),
  heading: z.string().max(5000).optional(), body: z.string().max(5000).optional(),
  buttonText: z.string().max(200).optional(), buttonUrl: z.string().max(2000).optional(),
  imageUrl: z.string().max(2000).optional(), formId: z.union([z.string().uuid(),z.literal('')]).optional(),
  items: z.array(z.string().max(300)).max(12).optional(),
  blocks:z.array(z.object({id:z.string().min(1).max(80),type:z.string().min(1).max(40),
    heading:z.string().max(500).optional(),body:z.string().max(3000).optional(),
    imageUrl:z.string().max(1000).optional(),hidden:z.boolean().optional(),
    attested:z.boolean().optional()}).strict()).max(20).optional(),
  hidden: z.boolean().optional(),
}).strict().superRefine((value,ctx)=>{
  if((value.blocks?.length||0)>registry[value.type].maxBlocks)
    ctx.addIssue({code:'custom',message:'Too many blocks for this section'});
  const allowed=(registry[value.type].allowedBlockTypes||[]).map(type=>type.toLowerCase());
  if(value.blocks?.some(block=>!allowed.includes(block.type.toLowerCase())))
    ctx.addIssue({code:'custom',message:'Block type is not allowed in this section'});
});
const themeSchema = z.object({
  background: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
  foreground: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
  accent: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
  font: z.enum(['sans','serif']),
}).strict();
export const pageSchema = z.object({ action: z.literal('save_page'), id: uuid.nullable(),
  title: z.string().trim().min(1).max(180), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  sections: z.array(sectionSchema).max(40), theme: themeSchema,
  seoDescription: z.string().max(320), status: z.enum(['draft','published']),
}).strict();
const accountSettingsSchema = z.object({
  phone:z.string().max(30).optional(),website:z.union([z.string().url(),z.literal('')]).optional(),
  timezone:z.string().min(2).max(100).optional(),
  logoUrl:z.union([z.string().url(),z.literal('')]).optional(),
  brand:z.object({primary:z.string().regex(/^#[0-9a-f]{6}$/i),text:z.string().regex(/^#[0-9a-f]{6}$/i),
    background:z.string().regex(/^#[0-9a-f]{6}$/i),font:z.string().max(100)}).strict().optional(),
  primaryDomain:z.string().max(255).optional(),
  mightycallNumber:z.string().regex(/^(\+1\d{10})?$/).optional(),
  googleReviewLink:z.union([z.string().url(),z.literal('')]).optional(),
  gbpUrl:z.union([z.string().url(),z.literal('')]).optional(),
  metaAdAccountId:z.string().max(100).optional(),googleAdsCustomerId:z.string().max(100).optional(),
  stripeCustomerId:z.string().regex(/^(cus_[a-zA-Z0-9]+)?$/).optional(),
  goalMetric:z.string().max(100).optional(),goalValue:z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  launchDate:z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/),z.literal('')]).optional(),
  addOns:z.array(z.string().max(100)).max(30).optional(),
}).strict();
const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('switch'), accountId: uuid.nullable(), viewAsClient: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal('change_lead'), leadId: uuid, stageId: uuid.nullable().optional(), notes: z.string().max(10000).nullable().optional() }).strict(),
  z.object({ action: z.literal('billing_portal') }).strict(),
  z.object({action:z.literal('set_ad_spend'),platform:z.enum(['google_ads','meta_ads','local_services','other']),
    month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),amountCents:z.number().int().min(0).max(1_000_000_000)}).strict(),
  z.object({action:z.literal('request_review'),name:z.string().trim().min(1).max(200),
    phone:z.string().regex(/^\+1\d{10}$/),leadId:uuid.nullable().default(null)}).strict(),
  z.object({action:z.literal('set_job_value'),leadId:uuid,value:z.number().min(0).max(100_000_000)}).strict(),
  z.object({action:z.literal('update_call'),callId:uuid,outcome:z.enum(['booked','message_taken','spam','existing_customer','other']),
    summary:z.string().max(5000),booked:z.boolean()}).strict(),
  z.object({action:z.literal('update_report'),reportId:uuid,workDone:z.string().max(5000),whatsNext:z.string().max(5000),send:z.boolean()}).strict(),
  z.object({action:z.literal('set_report_recipient'),email:z.string().trim().email().max(320),
    name:z.string().trim().max(200),active:z.boolean()}).strict(),
  z.object({action:z.literal('update_client_settings'),phone:z.string().max(30),website:z.union([z.string().url(),z.literal('')]),
    notifications:z.object({email:z.boolean(),text:z.boolean(),phone:z.union([z.string().regex(/^\+1\d{10}$/),z.literal('')])})
      .strict().refine(value=>!value.text||!!value.phone,{message:'Enter a mobile number for text alerts',path:['phone']})}).strict(),
  z.object({action:z.literal('set_usage_limit'),minutes:z.number().int().min(0).max(1_000_000)}).strict(),
  z.object({action:z.literal('set_review_delay'),hours:z.number().int().min(0).max(168)}).strict(),
  z.object({action:z.literal('set_feature'),feature:z.enum(['client_portal','client_accounts','landing_page_builder','landing_page_ai','delivery_automation','client_page_editing']),
    enabled:z.boolean(),userId:uuid.nullable().default(null)}).strict(),
  z.object({action:z.literal('assign_staff'),userId:uuid,
    role:z.enum(['account_manager','marketing','ads','agent_lead','agent']).nullable()}).strict(),
  z.object({action:z.literal('invite_staff'),name:z.string().trim().min(1).max(200),email:z.string().email().max(320)}).strict(),
  z.object({action:z.literal('set_ai_model'),model:z.string().regex(/^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/).max(150)}).strict(),
  z.object({action:z.literal('update_account'),settings:accountSettingsSchema}).strict(),
  z.object({action:z.literal('publish_page'),pageId:uuid}).strict(),
  z.object({action:z.literal('restore_page'),pageId:uuid,version:z.number().int().min(1)}).strict(),
  z.object({action:z.literal('apply_template'),accountId:uuid,template:z.enum(['starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom'])}).strict(),
  z.object({action:z.literal('retry_automation'),runId:uuid}).strict(),
  z.object({action:z.literal('set_account_mrr'),accountId:uuid,mrrCents:z.number().int().min(0).max(100_000_000)}).strict(),
  z.object({ action: z.literal('create_client'), companyId: uuid,
    package: z.enum(['starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom']),
    ownerEmail: z.string().email().max(320),ownerName: z.string().trim().min(1).max(200) }).strict(),
  z.object({action:z.literal('create_client_manual'),name:z.string().trim().min(1).max(200),
    phone:z.string().max(40),website:z.union([z.literal(''),z.string().url().startsWith('https://')]),
    package:z.enum(['starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom']),
    ownerEmail:z.string().email().max(320),ownerName:z.string().trim().min(1).max(200)}).strict(),
  aiPageInputSchema,
  aiPageEditInputSchema,
  pageSchema,
]);
type PortalCookie = PortalSelection;
type PortalUser = { id: string; email?: string; role: string; token: string };
export const requiresPortalMfa=requiresAgencyMfa;

function send(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.end(JSON.stringify(value));
}
function header(req: IncomingMessage, name: string) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
async function read(req: IncomingMessage) {
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 100_000) throw new Error('Request is too large');
  }
  return JSON.parse(value || '{}') as unknown;
}
function verify(req: IncomingMessage, userId: string): PortalCookie | null {
  return readPortalSelection(header(req,'cookie'),userId);
}
function setCookie(req: IncomingMessage,res: ServerResponse,value: PortalCookie) {
  const secure = header(req,'x-forwarded-proto') !== 'http';
  res.setHeader('set-cookie',`vs_portal=${signPortalSelection(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure?'; Secure':''}`);
}
async function rpc<T>(token: string,name: string,args: Record<string,unknown> = {}): Promise<T> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Supabase is not configured');
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method:'POST', headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify(args),signal:AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null) as T | {message?:string};
  if (!response.ok) throw new Error(response.status === 403 ? 'Access denied' :
    (data && typeof data === 'object' && 'message' in data ? String(data.message) : 'Portal request failed'));
  return data as T;
}
async function authenticate(req: IncomingMessage): Promise<PortalUser> {
  const bearer = header(req,'authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !base || !key) throw new Error('Sign in first');
  const response = await fetch(`${base}/auth/v1/user`, {
    headers:{apikey:key,authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Session expired');
  const user = await response.json() as {id:string;email?:string;factors?:unknown[]};
  const role = await rpc<string>(token,'auth_role');
  if (role === 'no_access') throw new Error('Access denied');
  let claims: {aal?:string} = {};
  try { claims = JSON.parse(Buffer.from(token.split('.')[1] || '','base64url').toString()) as typeof claims; }
  catch { throw new Error('Session expired'); }
  if (requiresPortalMfa(role) && claims.aal !== 'aal2')
    throw new Error('Two-step verification is required for agency access');
  return {id:user.id,email:user.email,role,token};
}
async function account(req: IncomingMessage,user: PortalUser): Promise<{id:string;viewAsClient:boolean}> {
  const accounts = await rpc<Array<{id:string}>>(user.token,'portal_accounts');
  const saved = verify(req,user.id);
  const id = saved?.accountId || (accounts.length === 1 ? accounts[0].id : null);
  if (!id) throw new Error('Select a client account');
  if (!accounts.some(a => a.id === id)) throw new Error('Access denied');
  return {id,viewAsClient: Boolean(saved?.viewAsClient && user.role === 'agency_admin')};
}
export const aiResponseSchema = z.object({ sections: z.array(sectionSchema).min(1).max(40), theme: themeSchema,
  title: z.string().min(1).max(180), seoDescription: z.string().max(320) }).strict();
export const aiJsonSchema = {
  type:'object',additionalProperties:false,required:['title','seoDescription','sections','theme'],
  properties:{
    title:{type:'string'},seoDescription:{type:'string'},
    sections:{type:'array',items:{type:'object',additionalProperties:false,
      required:['id','type','heading','body','buttonText','buttonUrl','imageUrl','formId','items','blocks'],
      properties:{id:{type:'string'},type:{type:'string',enum:sectionTypes},
        heading:{type:'string'},body:{type:'string'},buttonText:{type:'string'},buttonUrl:{type:'string'},
        imageUrl:{type:'string'},formId:{type:'string'},items:{type:'array',items:{type:'string'}},
        blocks:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,
          required:['id','type','heading','body','imageUrl','hidden','attested'],
          properties:{id:{type:'string'},type:{type:'string'},heading:{type:'string'},body:{type:'string'},
            imageUrl:{type:'string'},hidden:{type:'boolean'},attested:{type:'boolean'}}}}}}},
    theme:{type:'object',additionalProperties:false,required:['background','foreground','accent','font'],
      properties:{background:{type:'string'},foreground:{type:'string'},accent:{type:'string'},font:{type:'string',enum:['sans','serif']}}},
  },
} as const;
export const aiPageSystemPrompt='Create or edit a mobile-first landing page as structured JSON. Use plain words, short sentences, a service-and-city headline, one clear call to action, and the provided phone number. Use ordered blocks for services, benefits, steps, and FAQ where helpful. Never invent reviews, ratings, awards, licences, years in business, guarantees, prices, results, or business credentials. Use [Add a real customer review] and similar placeholders when facts are missing. Use only the uploaded photos provided. Never use em dashes or raw HTML. Keep forms unlinked unless a form ID was supplied.';
async function pageAiSetup(user:PortalUser,accountId:string){
  const limits=await mcpPool.query<{requests:number;spent:number;budget:number|null}>(aiPageLimitsSql,[user.id,ORG]);
  assertAiPageLimits(limits.rows[0]);
  const context = await rpc<Record<string,unknown>>(user.token,'portal_ai_context',{p_account:accountId});
  const approvedImages=approvedAiImageUrls(context,String(process.env.SUPABASE_URL||''));
  const clientContext={...context,photos:approvedImages.filter(url=>url.includes('/storage/v1/object/public/landing-media/'))};
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OpenRouter is not configured');
  const fallback = 'openai/gpt-4o-mini-2024-07-18';
  const primary = String(context.model || process.env.OPENROUTER_LANDING_MODEL || 'openai/gpt-4o-mini');
  const models = [...new Set([primary,fallback])];
  return {clientContext,approvedImages,key,models};
}
async function generatePage(user: PortalUser, accountId: string, prompt: string, currentSections?: unknown) {
  const {clientContext,approvedImages,key,models}=await pageAiSetup(user,accountId);
  let lastError: Error = new Error('AI page generation failed');
  for (const model of models) {
    try {
      let feedback='';
      for(let attempt=0;attempt<3;attempt++){
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
        body:JSON.stringify({model,temperature:0.4,max_tokens:2200,usage:{include:true},
          response_format:{type:'json_schema',json_schema:{name:'landing_page',strict:true,schema:aiJsonSchema}},
          messages:[{role:'system',content:aiPageSystemPrompt},
            {role:'user',content:JSON.stringify({brief:prompt,client:clientContext,currentSections,sectionRegistry:Object.values(registry).filter(item=>!['reviews','testimonial','trust_bar'].includes(item.type)).map(({type,label,fields,maxBlocks,allowedBlockTypes})=>({type,label,fields,maxBlocks,allowedBlockTypes:allowedBlockTypes||[]})),validationFeedback:feedback})}]}),
        signal:AbortSignal.timeout(45000),
      });
      const data = await response.json() as {choices?:Array<{message?:{content?:string}}> ;error?:{message?:string};usage?:{prompt_tokens?:number;completion_tokens?:number;cost?:number}};
      if (!response.ok) throw new Error(data.error?.message || 'AI provider failed');
      const costCents=aiUsageCostCents(data.usage);
      await mcpPool.query(`insert into public.ai_requests(user_id,client_account_id,prompt_tokens,completion_tokens,cost_cents,action)
        values($1,$2,$3,$4,$5,'landing_page_generate')`,[user.id,accountId,Number(data.usage?.prompt_tokens||0),Number(data.usage?.completion_tokens||0),costCents]);
      const parsedResult=aiResponseSchema.safeParse(JSON.parse(data.choices?.[0]?.message?.content || '{}'));
      if(!parsedResult.success){feedback=parsedResult.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ');if(attempt<2)continue;throw parsedResult.error}
      const parsed=parsedResult.data;
      try {
        assertNoUnsupportedProof([{heading:parsed.title,body:parsed.seoDescription},...parsed.sections]);
        assertApprovedAiImages(parsed.sections,approvedImages);
      } catch(error) {
        feedback=error instanceof Error?error.message:'Use only approved client facts and images';
        if(attempt<2)continue;
        throw error;
      }
      return parsed;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if(lastError.message==='AI provider did not return valid cost information')throw lastError;
    }
  }
  throw lastError;
}
async function generatePageEdits(user:PortalUser,accountId:string,prompt:string,
  currentSections:z.infer<typeof aiPageEditInputSchema>['currentSections'],
  currentTheme:z.infer<typeof aiPageEditInputSchema>['currentTheme']){
  const {clientContext,approvedImages,key,models}=await pageAiSetup(user,accountId);
  let lastError:Error=new Error('AI page edit failed');
  for(const model of models){
    try{
      let feedback='';
      for(let attempt=0;attempt<3;attempt++){
        const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
          method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
          body:JSON.stringify({model,temperature:0.3,max_tokens:2200,usage:{include:true},
            response_format:{type:'json_schema',json_schema:{name:'landing_page_edit',strict:true,schema:aiPatchJsonSchema}},
            messages:[{role:'system',content:'Return only validated patch operations for the requested landing page edit. Preserve all sections and blocks the user did not ask to change. Use existing IDs when editing; give new sections and blocks unique newId values. An afterId of null appends a section. Never invent reviews, ratings, awards, licences, years in business, guarantees, prices, results, or credentials. Never use raw HTML or em dashes. Use only approved client photos. Do not create or edit proof sections.'},
              {role:'user',content:JSON.stringify({brief:prompt,client:clientContext,currentSections,currentTheme,
                sectionRegistry:Object.values(registry).filter(item=>!['reviews','testimonial','trust_bar'].includes(item.type))
                  .map(({type,label,fields,maxBlocks})=>({type,label,fields,maxBlocks})),validationFeedback:feedback})}]}),
          signal:AbortSignal.timeout(45000),
        });
        const data=await response.json() as {choices?:Array<{message?:{content?:string}}>;
          error?:{message?:string};usage?:{prompt_tokens?:number;completion_tokens?:number;cost?:number}};
        if(!response.ok)throw Error(data.error?.message||'AI provider failed');
        const costCents=aiUsageCostCents(data.usage);
        await mcpPool.query(`insert into public.ai_requests(user_id,client_account_id,prompt_tokens,completion_tokens,cost_cents,action)
          values($1,$2,$3,$4,$5,'landing_page_edit')`,[user.id,accountId,Number(data.usage?.prompt_tokens||0),
            Number(data.usage?.completion_tokens||0),costCents]);
        const parsed=aiPatchResponseSchema.safeParse(JSON.parse(data.choices?.[0]?.message?.content||'{}'));
        if(!parsed.success){feedback=parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ');
          if(attempt<2)continue;throw parsed.error;}
        try{applyAiPatches(currentSections,currentTheme,parsed.data.patches,approvedImages)}
        catch(error){feedback=error instanceof Error?error.message:'Invalid page edit';if(attempt<2)continue;throw error;}
        return {...parsed.data,approvedImages};
      }
    }catch(error){
      lastError=error instanceof Error?error:Error(String(error));
      if(lastError.message==='AI provider did not return valid cost information')throw lastError;
    }
  }
  throw lastError;
}
function csv(rows: Array<Record<string,unknown>>) {
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g,'""')}"`;
  return [fields.map(cell).join(','),...rows.map(row => fields.map(key => cell(row[key])).join(','))].join('\r\n');
}

export default async function handler(req: IncomingMessage,res: ServerResponse) {
  try {
    const user = await authenticate(req);
    const url = new URL(req.url || '/api/portal','https://local.invalid');
    if (req.method === 'GET') {
      const parsed = querySchema.parse(Object.fromEntries(url.searchParams));
      const impersonating=user.role==='agency_admin'&&verify(req,user.id)?.viewAsClient===true;
      if (parsed.action === 'accounts') {
        const accounts = await rpc<Array<{id:string}>>(user.token,'portal_accounts');
        const saved=verify(req,user.id);
        const selected=saved?.accountId&&accounts.some(item=>item.id===saved.accountId)?saved:null;
        return send(res,200,{accounts:impersonating
          ?accounts.filter(item=>item.id===selected?.accountId):accounts,selected});
      }
      if (impersonating&&['agency_overview','provider_readiness','failed_automations',
        'closed_companies','features','ai_model'].includes(parsed.action))
        return send(res,403,{error:'Client view is read only'});
      if (parsed.action === 'agency_overview') return send(res,200,await rpc(user.token,'portal_agency_overview'));
      if (parsed.action === 'provider_readiness') return user.role === 'agency_admin'
        ? send(res,200,providerReadiness(process.env)) : send(res,403,{error:'Agency admin access required'});
      if (parsed.action === 'failed_automations') return send(res,200,await rpc(user.token,'portal_failed_automations'));
      if (parsed.action === 'closed_companies') return send(res,200,await rpc(user.token,'portal_closed_companies'));
      if (parsed.action === 'features') return send(res,200,await rpc(user.token,'portal_features'));
      if (parsed.action === 'ai_model') return send(res,200,{model:await rpc(user.token,'portal_ai_model')});
      const selected = await account(req,user);
      if (parsed.action === 'launchpad') return send(res,200,await rpc(user.token,'portal_launchpad',
        {p_account:selected.id}));
      if (parsed.action === 'metrics') return send(res,200,await rpc(user.token,'portal_dashboard_metrics',
        {p_account:selected.id,p_start:parsed.from,p_end:parsed.to}));
      if (parsed.action === 'lead_timeline') return send(res,200,await rpc(user.token,'portal_lead_timeline',
        {p_account:selected.id,p_lead:parsed.leadId}));
      if (parsed.action === 'won_leads') return send(res,200,await rpc(user.token,'portal_won_leads',
        {p_account:selected.id,p_query:parsed.query}));
      if (parsed.action === 'review_summary') return send(res,200,await rpc(user.token,'portal_review_summary',
        {p_account:selected.id}));
      if (parsed.action === 'review_page') return send(res,200,await rpc(user.token,'portal_review_page',
        {p_account:selected.id,p_kind:parsed.kind,p_before_at:parsed.beforeAt||null,
          p_before_id:parsed.beforeId||null,p_limit:100}));
      if (parsed.action === 'lead_page') return send(res,200,await rpc(user.token,'portal_lead_page',
        {p_account:selected.id,p_before_at:parsed.beforeAt,p_before_id:parsed.beforeId,p_limit:200}));
      if (parsed.action === 'ad_spend') return send(res,200,await rpc(user.token,'portal_ad_spend',
        {p_account:selected.id}));
      if (parsed.action === 'page_stats') return send(res,200,await rpc(user.token,'portal_page_stats',
        {p_account:selected.id}));
      if (parsed.action === 'page_edit_allowed') return send(res,200,
        !selected.viewAsClient&&await rpc<boolean>(user.token,'portal_page_edit_allowed',{p_account:selected.id}));
      if (parsed.action === 'page_versions') return send(res,200,await rpc(user.token,'portal_page_versions',
        {p_account:selected.id,p_page:parsed.pageId}));
      if (parsed.action === 'report_file') {
        const path=await rpc<string|null>(user.token,'portal_report_file',{p_account:selected.id,p_report:parsed.reportId});
        if(!path)return send(res,404,{error:'Report file unavailable'});
        const base=process.env.SUPABASE_URL;
        const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;
        if(!base||!key)throw Error('Storage unavailable');
        const signed=await fetch(`${base}/storage/v1/object/sign/client-reports/${path}`,{method:'POST',
          headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},
          body:JSON.stringify({expiresIn:300}),signal:AbortSignal.timeout(10000)});
        const data=await signed.json() as {signedURL?:string};
        if(!signed.ok||!data.signedURL)throw Error('Report link unavailable');
        return send(res,200,{url:`${base}/storage/v1${data.signedURL}`});
      }
      if (parsed.action === 'reports') return send(res,200,await rpc(user.token,'portal_reports',
        {p_account:selected.id}));
      if (parsed.action === 'report_recipients') return send(res,200,await rpc(user.token,'portal_report_recipients',
        {p_account:selected.id}));
      if (parsed.action === 'billing_summary') return send(res,200,await rpc(user.token,'portal_billing_summary',
        {p_account:selected.id}));
      if (parsed.action === 'branding') return send(res,200,await rpc(user.token,'portal_branding',
        {p_account:selected.id}));
      if (parsed.action === 'client_settings') return send(res,200,await rpc(user.token,'portal_client_settings',
        {p_account:selected.id}));
      if (parsed.action === 'usage') return send(res,200,await rpc(user.token,'portal_usage',
        {p_account:selected.id}));
      if (parsed.action === 'calls' || parsed.action === 'call_page') return send(res,200,
        await rpc(user.token,'portal_call_page',{p_account:selected.id,p_start:parsed.from,p_end:parsed.to,
          p_outcome:parsed.outcome||null,p_before_at:parsed.action==='call_page'?parsed.beforeAt:null,
          p_before_id:parsed.action==='call_page'?parsed.beforeId:null,p_limit:200}));
      if (parsed.action === 'staff') return send(res,200,await rpc(user.token,'portal_staff',{p_account:selected.id}));
      if (parsed.action === 'export' && selected.viewAsClient) return send(res,403,{error:'Client view is read only'});
      const data = parsed.section==='leads'
        ? await rpc<unknown>(user.token,'portal_lead_page',{p_account:selected.id,p_limit:200})
        : parsed.section==='pages'
        ? await rpc<unknown>(user.token,'portal_pages',{p_account:selected.id})
        : parsed.section==='forms'
        ? await rpc<unknown>(user.token,'portal_forms',{p_account:selected.id})
        : parsed.section==='billing'
        ? await rpc<unknown>(user.token,'portal_invoices',{p_account:selected.id})
        : await rpc<unknown>(user.token,'portal_snapshot',{p_account:selected.id,p_page:parsed.section});
      if (parsed.action === 'export') {
        let rows = Array.isArray(data) ? data : (data && typeof data === 'object' ?
          Object.values(data).find(Array.isArray) as Array<Record<string,unknown>> || [] : []);
        if(parsed.section==='leads'){
          let cursor=(data as {nextCursor?:{createdAt:string;id:string}|null}).nextCursor;
          while(cursor){
            const page=await rpc<{rows:Array<Record<string,unknown>>;nextCursor:{createdAt:string;id:string}|null}>(
              user.token,'portal_lead_page',{p_account:selected.id,p_before_at:cursor.createdAt,
                p_before_id:cursor.id,p_limit:200});
            rows=[...rows,...page.rows];cursor=page.nextCursor;
          }
        }
        if(parsed.section==='reviews'){
          const first=await rpc<{rows:Array<Record<string,unknown>>;nextCursor:{at:string;id:string}|null}>(
            user.token,'portal_review_page',{p_account:selected.id,p_kind:'reviews',p_limit:100});
          rows=first.rows;
          let cursor=first.nextCursor;
          while(cursor){
            const page=await rpc<typeof first>(user.token,'portal_review_page',{
              p_account:selected.id,p_kind:'reviews',p_before_at:cursor.at,p_before_id:cursor.id,p_limit:100});
            rows=[...rows,...page.rows];cursor=page.nextCursor;
          }
        }
        await rpc(user.token,'portal_log',{p_account:selected.id,p_action:'exported',p_target:parsed.section});
        res.statusCode=200;res.setHeader('content-type','text/csv; charset=utf-8');
        res.setHeader('content-disposition',`attachment; filename="${parsed.section}.csv"`);
        return res.end(csv(rows));
      }
      const pagesReadOnly=parsed.section==='pages'&&
        !await rpc<boolean>(user.token,'portal_page_edit_allowed',{p_account:selected.id});
      return send(res,200,{accountId:selected.id,readOnly:selected.viewAsClient||pagesReadOnly,data});
    }
    if (req.method !== 'POST') return send(res,405,{error:'Method not allowed'});
    const parsed = postSchema.parse(await read(req));
    if (parsed.action!=='switch'&&user.role==='agency_admin'&&verify(req,user.id)?.viewAsClient)
      return send(res,403,{error:'Client view is read only'});
    if (parsed.action === 'switch') {
      const accounts = await rpc<Array<{id:string}>>(user.token,'portal_accounts');
      if (parsed.accountId && !accounts.some(a => a.id === parsed.accountId)) return send(res,403,{error:'Account unavailable'});
      if (!parsed.accountId && !['agency_admin','agency_staff'].includes(user.role)) return send(res,403,{error:'Account unavailable'});
      if (parsed.viewAsClient && (user.role !== 'agency_admin' || !parsed.accountId)) return send(res,403,{error:'Client view is unavailable'});
      const previous = verify(req,user.id);
      if (previous?.viewAsClient) await rpc(user.token,'portal_log',{p_account:previous.accountId,p_action:'impersonation_ended'});
      if (parsed.viewAsClient) await rpc(user.token,'portal_log',{p_account:parsed.accountId,p_action:'impersonation_started'});
      await rpc(user.token,'portal_log',{p_account:parsed.accountId,p_action:'account_switched'});
      setCookie(req,res,{accountId:parsed.accountId,viewAsClient:parsed.viewAsClient,userId:user.id,issuedAt:Date.now()});
      return send(res,200,{accountId:parsed.accountId,viewAsClient:parsed.viewAsClient});
    }
    if (parsed.action === 'create_client' || parsed.action === 'create_client_manual') {
      const created = await rpc<{accountId:string;inviteCode?:string;existing:boolean;ownerEmail?:string}>(user.token,
        parsed.action==='create_client'?'portal_create_client':'portal_create_client_manual',
        parsed.action==='create_client'?{p_company:parsed.companyId,p_package:parsed.package,
          p_owner_email:parsed.ownerEmail,p_owner_name:parsed.ownerName}:
          {p_name:parsed.name,p_phone:parsed.phone,p_website:parsed.website,p_package:parsed.package,
            p_owner_email:parsed.ownerEmail,p_owner_name:parsed.ownerName});
      await rpc(user.token,'portal_apply_account_template',{p_account:created.accountId,p_template:parsed.package});
      let inviteUrl:string|null=null,inviteSent=false;
      if (!created.existing && created.inviteCode) {
        inviteUrl=clientInviteUrl(created.inviteCode,parsed.ownerEmail,parsed.ownerName);
        if(externalSendsEnabled()&&process.env.RESEND_API_KEY&&process.env.INVITE_FROM_EMAIL){
          try{const emailed=await fetch('https://api.resend.com/emails',{method:'POST',
            headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json'},
            body:JSON.stringify({from:process.env.INVITE_FROM_EMAIL,to:[parsed.ownerEmail],
              subject:'Your VictorySync client portal invite',
              text:`${parsed.ownerName}, your client portal is ready. Create your password with this invitation link: ${inviteUrl}\n\nThis invitation expires in seven days.`}),
            signal:AbortSignal.timeout(15000)});
            if(emailed.ok){await rpc(user.token,'portal_mark_invite_sent',{p_account:created.accountId});inviteSent=true;inviteUrl=null}}
          catch(error){console.error('Client invite email failed',error instanceof Error?error.name:'unknown')}
        }
      }
      if (!created.existing&&externalSendsEnabled()&&process.env.SLACK_WEBHOOK_URL) await fetch(process.env.SLACK_WEBHOOK_URL,{method:'POST',
        headers:{'content-type':'application/json'},body:JSON.stringify({text:`New VictorySync client account: ${parsed.ownerName} (${parsed.package})`}),
        signal:AbortSignal.timeout(5000)}).catch(()=>undefined);
      return send(res,201,{accountId:created.accountId,existing:created.existing,inviteSent,inviteUrl});
    }
    if (parsed.action === 'apply_template') return send(res,200,await rpc(user.token,'portal_apply_account_template',
      {p_account:parsed.accountId,p_template:parsed.template}));
    if (parsed.action === 'retry_automation') return send(res,200,{ok:await rpc(user.token,'portal_retry_automation',{p_run:parsed.runId})});
    if (parsed.action === 'set_account_mrr') return send(res,200,{ok:await rpc(user.token,'portal_set_account_mrr',
      {p_account:parsed.accountId,p_mrr_cents:parsed.mrrCents})});
    if (parsed.action === 'set_feature') {
      await rpc(user.token,'portal_set_feature',{p_feature:parsed.feature,p_enabled:parsed.enabled,p_user:parsed.userId});
      return send(res,200,{ok:true});
    }
    if (parsed.action === 'set_ai_model') {
      await rpc(user.token,'portal_set_ai_model',{p_model:parsed.model});
      return send(res,200,{ok:true});
    }
    const selected = await account(req,user);
    if (selected.viewAsClient) return send(res,403,{error:'Client view is read only'});
    if (parsed.action === 'set_ad_spend') {
      await rpc(user.token,'portal_set_ad_spend',{p_account:selected.id,p_platform:parsed.platform,
        p_month:parsed.month,p_amount_cents:parsed.amountCents});return send(res,200,{ok:true});
    }
    if (parsed.action === 'request_review') {
      const id=await rpc(user.token,'portal_request_review',{p_account:selected.id,p_name:parsed.name,
        p_phone:parsed.phone,p_lead:parsed.leadId});return send(res,201,{id});
    }
    if (parsed.action === 'set_job_value') {
      await rpc(user.token,'portal_set_job_value',{p_account:selected.id,p_lead:parsed.leadId,p_value:parsed.value});
      return send(res,200,{ok:true});
    }
    if (parsed.action === 'update_call') {
      await rpc(user.token,'portal_update_call',{p_account:selected.id,p_call:parsed.callId,
        p_outcome:parsed.outcome,p_summary:parsed.summary,p_booked:parsed.booked});return send(res,200,{ok:true});
    }
    if (parsed.action === 'update_report') {
      await rpc(user.token,'portal_update_report',{p_account:selected.id,p_report:parsed.reportId,
        p_work_done:parsed.workDone,p_whats_next:parsed.whatsNext,p_send:parsed.send});
      return send(res,200,{ok:true});
    }
    if (parsed.action === 'set_report_recipient') {
      const id=await rpc<string>(user.token,'portal_set_report_recipient',{p_account:selected.id,
        p_email:parsed.email,p_name:parsed.name,p_active:parsed.active});return send(res,200,{id});
    }
    if (parsed.action === 'update_client_settings') {
      await rpc(user.token,'portal_update_client_settings',{p_account:selected.id,p_phone:parsed.phone,
        p_website:parsed.website,p_notifications:parsed.notifications});return send(res,200,{ok:true});
    }
    if (parsed.action === 'set_usage_limit') {
      await rpc(user.token,'portal_set_usage_limit',{p_account:selected.id,p_minutes:parsed.minutes});
      return send(res,200,{ok:true});
    }
    if (parsed.action === 'set_review_delay') {
      await rpc(user.token,'portal_set_review_delay',{p_account:selected.id,p_hours:parsed.hours});
      return send(res,200,{ok:true});
    }
    if (parsed.action === 'assign_staff') {
      await rpc(user.token,'portal_assign_staff',{p_account:selected.id,p_user:parsed.userId,p_role:parsed.role});
      return send(res,200,{ok:true});
    }
    if (parsed.action === 'update_account') {
      const mapped=Object.fromEntries(Object.entries(parsed.settings).map(([key,value])=>
        [key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`),value]));
      const data=await rpc(user.token,'portal_update_account',{p_account:selected.id,p_data:mapped});
      return send(res,200,data);
    }
    if (parsed.action === 'invite_staff') {
      const code=await rpc<string>(user.token,'portal_invite_client_staff',{p_account:selected.id,
        p_email:parsed.email,p_name:parsed.name});
      const inviteUrl=clientInviteUrl(code,parsed.email,parsed.name);
      if(externalSendsEnabled()&&process.env.RESEND_API_KEY&&process.env.INVITE_FROM_EMAIL){
        try{
          const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{
            authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json'},
            body:JSON.stringify({from:process.env.INVITE_FROM_EMAIL,to:[parsed.email],
              subject:'Your VictorySync client portal invite',
              text:`${parsed.name}, you have been invited to the client portal. Create your password here: ${inviteUrl}\n\nThis invitation expires in seven days.`}),
            signal:AbortSignal.timeout(15000)});
          if(sent.ok)return send(res,201,{invited:true,inviteSent:true,inviteUrl:null});
        }catch(error){console.error('Client staff invite email failed',error instanceof Error?error.name:'unknown')}
      }
      return send(res,201,{invited:true,inviteSent:false,inviteUrl});
    }
    if (parsed.action === 'change_lead') {
      const data = await rpc(user.token,'portal_change_lead',{p_account:selected.id,p_lead:parsed.leadId,
        p_stage:parsed.stageId ?? null,p_notes:parsed.notes ?? null,
        p_clear_stage:parsed.stageId === null});
      return send(res,200,data);
    }
    if (parsed.action === 'save_page') {
      const data = await rpc(user.token,'portal_save_page',{p_account:selected.id,p_page:parsed.id,
        p_title:parsed.title,p_slug:parsed.slug,p_sections:parsed.sections,p_theme:parsed.theme,
        p_seo_description:parsed.seoDescription,p_status:parsed.status});
      return send(res,200,data);
    }
    if (parsed.action === 'publish_page') {
      const data=await rpc(user.token,'portal_publish_page',{p_account:selected.id,p_page:parsed.pageId});
      return send(res,200,data);
    }
    if (parsed.action === 'restore_page') {
      const data=await rpc(user.token,'portal_restore_page',
        {p_account:selected.id,p_page:parsed.pageId,p_version:parsed.version});
      return send(res,200,data);
    }
    if (parsed.action === 'ai_page') {
      if(!await rpc<boolean>(user.token,'portal_page_edit_allowed',{p_account:selected.id}))
        return send(res,403,{error:'Page editing is unavailable for this account'});
      if(!await rpc<boolean>(user.token,'client_feature_enabled',{p_feature:'landing_page_ai'}))
        return send(res,403,{error:'AI page editing is disabled'});
      return send(res,200,await generatePage(user,selected.id,parsed.prompt,parsed.currentSections));
    }
    if(parsed.action==='ai_page_edit'){
      if(!await rpc<boolean>(user.token,'portal_page_edit_allowed',{p_account:selected.id}))
        return send(res,403,{error:'Page editing is unavailable for this account'});
      if(!await rpc<boolean>(user.token,'client_feature_enabled',{p_feature:'landing_page_ai'}))
        return send(res,403,{error:'AI page editing is disabled'});
      return send(res,200,await generatePageEdits(user,selected.id,parsed.prompt,parsed.currentSections,parsed.currentTheme));
    }
    if (parsed.action === 'billing_portal') {
      const customer = await rpc<string|null>(user.token,'portal_billing_customer',{p_account:selected.id});
      const returnUrl=portalBillingReturnUrl(process.env.PORTAL_BASE_URL);
      if (!customer || !process.env.STRIPE_SECRET_KEY || !returnUrl)
        return send(res,503,{error:'Billing portal is not configured'});
      const stripe = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method:'POST',headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({customer,return_url:returnUrl}),signal:AbortSignal.timeout(15000),
      });
      const data = await stripe.json() as {url?:string;error?:{message?:string}};
      if (!stripe.ok || !data.url) throw new Error(data.error?.message || 'Stripe portal failed');
      await rpc(user.token,'portal_log',{p_account:selected.id,p_action:'billing_portal_opened'});
      return send(res,200,{url:data.url});
    }
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return send(res,400,{error:'Invalid request'});
    const message = error instanceof Error ? error.message : 'Portal request failed';
    return send(res,/Sign in|Session expired/.test(message)?401:/Access denied|unavailable|disabled|verification|read only/.test(message)?403:500,{error:message});
  }
}
