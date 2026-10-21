import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHmac,randomUUID} from 'node:crypto';
import {mcpPool} from '../mcp-auth.js';
import {SOCIAL_WORKSPACE_ORG_ID} from '../social-workspace-auth.js';
import {socialRest} from '../social-service.js';

export const config={api:{bodyParser:false},maxDuration:30};
const org=SOCIAL_WORKSPACE_ORG_ID;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fieldTypes=new Set(['text','email','tel','number','textarea','select','checkbox','date','url']);
const leadFields=new Set(['firstName','lastName','email','phone','company','title']);
type Field={id:string;label:string;fieldType:string;required:boolean;order:number;placeholder:string|null;options:string[];mappedLeadField:string|null};
type FormRow={id:string;name:string;description:string|null;status:string;slug:string;campaign_id:string|null;fields:Field[];success_message:string|null;submit_button_text:string;redirect_url:string|null;created_at:string;updated_at:string;submission_count?:number};
type PageRow={id:string;name:string;slug:string;status:string;sections:Array<Record<string,unknown>>;theme:Record<string,unknown>;seo_title:string|null;seo_description:string|null;form_id:string|null;visits:number;published_at:string|null;created_at:string;updated_at:string};
const json=(res:ServerResponse,status:number,value:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value));};
const html=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
const plain=(value:unknown,max=500)=>String(value??'').trim().slice(0,max);
const safeSlug=(value:unknown)=>{const slug=plain(value,80).toLowerCase();if(slug.length<3||!slugPattern.test(slug))throw new Error('Use a slug of 3–80 lowercase letters, numbers, or hyphens');return slug;};
const origin=(_req:IncomingMessage)=>'https://app.victorysync.com';
async function body(req:IncomingMessage,max=65536){let text='';for await(const chunk of req){text+=chunk;if(text.length>max)throw new Error('Request too large');}
  const type=String(req.headers['content-type']||'');if(type.includes('application/json'))return JSON.parse(text||'{}') as Record<string,unknown>;
  if(type.includes('application/x-www-form-urlencoded'))return Object.fromEntries(new URLSearchParams(text));
  throw new Error('Send JSON or a standard HTML form');}
async function actor(req:IncomingMessage,permission:'forms'|'landing-pages'){
  const authorization=String(req.headers.authorization||'');const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY;
  if(!authorization.startsWith('Bearer ')||!base||!key)throw new Error('Sign in first');
  const response=await fetch(`${base}/auth/v1/user`,{headers:{apikey:key,authorization},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Session expired');
  const user=await response.json() as{id:string;email_confirmed_at?:string};
  if(!user.email_confirmed_at)throw new Error('Confirm your email first');
  const membership=await mcpPool.query<{role:string;page_permissions:string[]|null}>(`select role,page_permissions from public.team_members where auth_user_id=$1 and org_id=$2
    and status='active' and client_account_id is null and role in ('owner','admin','member') limit 1`,[user.id,org]);
  const platform=await mcpPool.query(`select 1 from public.profiles where id=$1 and global_role='platform_admin'`,[user.id]);
  if(!membership.rowCount&&!platform.rowCount)throw new Error('Internal workspace access required');
  const permissions=membership.rows[0]?.page_permissions;
  if(!platform.rowCount&&!['owner','admin'].includes(membership.rows[0]?.role||'')&&Array.isArray(permissions)
    &&!permissions.includes('forms'))
    throw new Error(`${permission} access is disabled for this account`);
  return user;
}
export function validatedFields(value:unknown):Field[]{
  if(!Array.isArray(value)||value.length>50)throw new Error('A form can have up to 50 fields');
  const seen=new Set<string>();return value.map((item,index)=>{if(!item||typeof item!=='object')throw new Error(`Field ${index+1} is invalid`);
    const data=item as Record<string,unknown>,id=plain(data.id,60),label=plain(data.label,120),fieldType=plain(data.fieldType||data.field_type,30);
    if(!/^[a-zA-Z0-9_-]{3,60}$/.test(id)||seen.has(id)||!label||!fieldTypes.has(fieldType))throw new Error(`Field ${index+1} needs a unique ID, label, and supported type`);
    seen.add(id);const options=Array.isArray(data.options)?data.options.map(x=>plain(x,100)).filter(Boolean).slice(0,40):[];
    if(fieldType==='select'&&!options.length)throw new Error(`Select field “${label}” needs options`);
    const mappedLeadField=data.mappedLeadField||data.mapped_lead_field?plain(data.mappedLeadField||data.mapped_lead_field,30):null;
    if(mappedLeadField&&!leadFields.has(mappedLeadField))throw new Error(`Field “${label}” has an invalid lead mapping`);
    return {id,label,fieldType,required:data.required===true,order:index,placeholder:data.placeholder?plain(data.placeholder,160):null,options,mappedLeadField};});
}
function formShape(row:FormRow,req:IncomingMessage){const base=origin(req),url=`${base}/f/${row.slug}`;return {
  id:row.id,name:row.name,description:row.description,status:row.status,slug:row.slug,campaignId:row.campaign_id,
  fields:validatedFields(row.fields||[]),successMessage:row.success_message,submitButtonText:row.submit_button_text,redirectUrl:row.redirect_url,
  submissionCount:Number(row.submission_count||0),publicUrl:url,embedCode:`<iframe src="${url}" title="${html(row.name)}" loading="lazy" style="width:100%;min-height:560px;border:0" referrerpolicy="strict-origin-when-cross-origin"></iframe>`,
  createdAt:row.created_at,updatedAt:row.updated_at};}
function pageShape(row:PageRow,req:IncomingMessage,stats?:Record<string,unknown>){return {...row,publicUrl:`${origin(req)}/p/${row.slug}`,stats:stats||null};}
function securityHeaders(res:ServerResponse,embed=false){res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','strict-origin-when-cross-origin');res.setHeader('content-security-policy',`default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors ${embed?'*':"'self'"}`);}
function fieldHtml(field:Field){const id=`field-${field.id}`,name=`field_${field.id}`,required=field.required?' required':'',placeholder=field.placeholder?` placeholder="${html(field.placeholder)}"`:'';
  const label=`<label for="${id}">${html(field.label)}${field.required?' <span aria-hidden="true">*</span>':''}</label>`;
  if(field.fieldType==='checkbox')return `<div class="field check"><input id="${id}" name="${name}" type="checkbox" value="yes"${required}>${label}</div>`;
  if(field.fieldType==='textarea')return `<div class="field">${label}<textarea id="${id}" name="${name}" rows="4"${required}${placeholder}></textarea></div>`;
  if(field.fieldType==='select')return `<div class="field">${label}<select id="${id}" name="${name}"${required}><option value="">Choose an option</option>${field.options.map(option=>`<option value="${html(option)}">${html(option)}</option>`).join('')}</select></div>`;
  return `<div class="field">${label}<input id="${id}" name="${name}" type="${field.fieldType}"${required}${placeholder}></div>`;}
function formHtml(row:FormRow,req:IncomingMessage,submitted:boolean,pageId:string|null,utm:Record<string,string>){
  const hidden=Object.entries(utm).map(([key,value])=>`<input type="hidden" name="${html(key)}" value="${html(value)}">`).join('');
  const content=submitted?`<div class="success" role="status">${html(row.success_message||'Thank you! We will be in touch.')}</div>`:
    `<form method="post" action="/f/${encodeURIComponent(row.slug)}"><input class="trap" type="text" name="website_confirm" tabindex="-1" autocomplete="off" aria-hidden="true"><input type="hidden" name="submission_key" value="${randomUUID()}">${pageId?`<input type="hidden" name="landing_page_id" value="${html(pageId)}">`:''}${hidden}${(row.fields||[]).map(fieldHtml).join('')}<button type="submit">${html(row.submit_button_text||'Submit')}</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(row.name)}</title><style>:root{font:16px system-ui;color:#17243d}*{box-sizing:border-box}body{margin:0;padding:24px;background:#fff}.wrap{max-width:600px;margin:0 auto}h1{font-size:1.6rem;margin:0 0 8px}p{color:#5f6c80}.field{display:grid;gap:7px;margin:17px 0}label{font-weight:600;font-size:14px}input,textarea,select{width:100%;padding:11px 13px;border:1px solid #cfd8e5;border-radius:10px;font:inherit;background:#fff}.check{display:flex;align-items:center}.check input{width:auto}button{background:#245eea;color:#fff;border:0;border-radius:10px;padding:12px 20px;font:600 15px system-ui;cursor:pointer}.trap{position:absolute;left:-9999px}.success{padding:20px;background:#eef9f1;border-radius:12px;color:#17643c}</style></head><body><main class="wrap"><h1>${html(row.name)}</h1>${row.description?`<p>${html(row.description)}</p>`:''}${content}</main></body></html>`;}
export function validateSubmission(fields:Field[],input:Record<string,unknown>){const data:Record<string,string|boolean>={},mapped:Record<string,string>={};
  for(const field of fields){const raw=input[`field_${field.id}`],value=field.fieldType==='checkbox'?raw==='yes':plain(raw,2000);
    if(field.required&&(value===false||!value))throw new Error(`“${field.label}” is required`);
    if(field.fieldType==='email'&&value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))throw new Error(`“${field.label}” must be a valid email`);
    if(field.fieldType==='url'&&value){try{const url=new URL(String(value));if(!['https:','http:'].includes(url.protocol))throw new Error();}catch{throw new Error(`“${field.label}” must be a valid URL`);}}
    if(field.fieldType==='select'&&value&&!field.options.includes(String(value)))throw new Error(`“${field.label}” has an invalid option`);
    if(field.fieldType==='number'&&value&&!Number.isFinite(Number(value)))throw new Error(`“${field.label}” must be a number`);
    data[field.id]=value;if(field.mappedLeadField&&typeof value==='string')mapped[field.mappedLeadField]=value;
  }
  return {data,mapped};}
const sectionTypes=new Set(['hero','text','features','testimonial','faq','image','cta','form','spacer']);
export function validatedSections(value:unknown){if(!Array.isArray(value)||value.length>60)throw new Error('A page can have up to 60 sections');
  return value.map((entry,index)=>{if(!entry||typeof entry!=='object')throw new Error(`Section ${index+1} is invalid`);
    const item=entry as Record<string,unknown>,type=plain(item.type,30);if(!sectionTypes.has(type))throw new Error(`Section ${index+1} has an unsupported type`);
    const content:Record<string,unknown>={};for(const key of ['eyebrow','heading','body','buttonText','buttonUrl','imageUrl','imageAlt','quote','author'])
      if(item[key]!==undefined)content[key]=plain(item[key],key==='body'?5000:500);
    if(item.items!==undefined){if(!Array.isArray(item.items)||item.items.length>20)throw new Error(`Section ${index+1} has too many items`);
      content.items=item.items.map(value=>plain(value,500));}
    return {id:plain(item.id,60)||randomUUID(),type,...content};});}
function validatedTheme(value:unknown){const data=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const color=(v:unknown,fallback:string)=>/^#[0-9a-fA-F]{6}$/.test(String(v||''))?String(v):fallback;
  return {primary:color(data.primary,'#245eea'),background:color(data.background,'#ffffff'),text:color(data.text,'#17243d'),font:['system','serif'].includes(String(data.font))?String(data.font):'system'};}
export function safeHref(value:unknown){const raw=plain(value,1000);if(/^#[a-zA-Z0-9_-]{1,80}$/.test(raw))return raw;if(raw.startsWith('/')&&!raw.startsWith('//'))return raw;
  try{const url=new URL(raw);return url.protocol==='https:'?url.toString():'#';}catch{return '#';}}
function sectionHtml(section:Record<string,unknown>,formSlug:string|null,formQuery:string){const type=String(section.type),heading=html(section.heading),body=html(section.body),items=Array.isArray(section.items)?section.items:[];
  if(type==='spacer')return '<div class="spacer"></div>';
  if(type==='form')return formSlug?`<section id="contact" class="section form-block"><h2>${heading||'Get in touch'}</h2><p>${body}</p><iframe title="Lead capture form" src="/f/${encodeURIComponent(formSlug)}${html(formQuery)}" loading="lazy"></iframe></section>`:'';
  if(type==='image'){const image=safeHref(section.imageUrl);return `<section class="section image-block">${image!=='#'?`<img src="${html(image)}" alt="${html(section.imageAlt)}" loading="lazy">`:''}<p>${body}</p></section>`;}
  if(type==='faq')return `<section class="section"><h2>${heading}</h2><div class="cards">${items.map(x=>{const [question,...answer]=String(x).split('|');return `<details><summary>${html(question.trim())}</summary><p>${html(answer.join('|').trim())}</p></details>`;}).join('')}</div></section>`;
  if(type==='features')return `<section class="section"><h2>${heading}</h2><p>${body}</p><div class="cards">${items.map(x=>`<article>${html(x)}</article>`).join('')}</div></section>`;
  if(type==='testimonial')return `<section class="section testimonial"><blockquote>“${html(section.quote||section.body)}”</blockquote><p>${html(section.author)}</p></section>`;
  if(type==='hero'||type==='cta')return `<section class="section ${type}"><span class="eyebrow">${html(section.eyebrow)}</span><h1>${heading}</h1><p>${body}</p>${section.buttonText?`<a class="button" href="${html(safeHref(section.buttonUrl))}">${html(section.buttonText)}</a>`:''}</section>`;
  return `<section class="section"><h2>${heading}</h2><p>${body}</p></section>`;}
function pageHtml(row:PageRow,formSlug:string|null,utm:Record<string,string>){const theme=validatedTheme(row.theme),title=html(row.seo_title||row.name),description=html(row.seo_description||'');
  const query=new URLSearchParams({lp:row.id,...utm}).toString();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><style>:root{--primary:${theme.primary};--bg:${theme.background};--text:${theme.text};font-family:${theme.font==='serif'?'Georgia,serif':'system-ui,sans-serif'};color:var(--text)}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}main{max-width:1120px;margin:auto}.section{padding:64px 24px}.section h1{font-size:clamp(2.5rem,6vw,5rem);line-height:1.05;margin:12px 0}.section h2{font-size:clamp(1.8rem,4vw,2.8rem)}.section p{font-size:1.1rem;line-height:1.7;max-width:720px}.hero,.cta{text-align:center;background:color-mix(in srgb,var(--primary) 8%,var(--bg))}.hero p,.cta p{margin:18px auto}.eyebrow{color:var(--primary);font-weight:700;letter-spacing:.08em;text-transform:uppercase}.button{display:inline-block;background:var(--primary);color:#fff;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:700;margin-top:15px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.cards article,.cards details{padding:20px;border:1px solid #dce2eb;border-radius:14px}.image-block img{max-width:100%;height:auto;border-radius:18px}.testimonial{font-size:1.5rem}.spacer{height:32px}.form-block iframe{width:100%;min-height:620px;border:1px solid #dce2eb;border-radius:16px}footer{text-align:center;padding:30px;color:#6b7280;font-size:13px}@media(max-width:600px){.section{padding:48px 20px}}</style></head><body><main>${(row.sections||[]).map(s=>sectionHtml(s,formSlug,`?${query}`)).join('')}</main><footer>© ${new Date().getFullYear()} Victory Sync</footer></body></html>`;}
async function publicForm(req:IncomingMessage,res:ServerResponse,slug:string,submit:boolean){
  const forms=await socialRest<FormRow[]>(`forms?organization_id=eq.${org}&slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=*&limit=1`);
  const form=forms[0];if(!form)return json(res,404,{error:'Form unavailable'});
  form.fields=validatedFields(form.fields||[]);
  if(!Array.isArray(form.fields)||!form.fields.length)return json(res,404,{error:'Form is not ready'});
  const url=new URL(req.url||'/','https://local.invalid'),utm=Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].map(key=>[key,plain(url.searchParams.get(key),120)]).filter(([,value])=>value));
  if(!submit){securityHeaders(res,true);res.setHeader('cache-control','no-store');res.end(formHtml(form,req,url.searchParams.get('submitted')==='1',url.searchParams.get('lp'),utm));return;}
  const input=await body(req),isHtml=String(req.headers['content-type']||'').includes('application/x-www-form-urlencoded');
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'])if(input[key])utm[key]=plain(input[key],120);
  if(input.website_confirm){if(isHtml){res.statusCode=303;res.setHeader('location',`/f/${slug}?submitted=1`);res.end();}else json(res,201,{accepted:true});return;}
  const fields=validatedFields(form.fields),validated=validateSubmission(fields,input),key=plain(input.submission_key,100)||randomUUID();
  const salt=process.env.TOKEN_ENCRYPTION_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.DATABASE_URL;
  if(!salt)throw new Error('Submission rate limit is unavailable');
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
  const hash=createHmac('sha256',salt).update(ip).digest('hex'),bucket=new Date(Math.floor(Date.now()/600000)*600000);
  const pageId=uuid.test(String(input.landing_page_id||''))?String(input.landing_page_id):null;
  const db=await mcpPool.connect();let submissionId:string|undefined;
  try{await db.query('begin');
    const attempts=await db.query<{attempts:number}>(`insert into public.form_rate_limits(form_id,ip_hash,window_started_at,attempts)
      values($1,$2,$3,1) on conflict(form_id,ip_hash,window_started_at) do update set attempts=public.form_rate_limits.attempts+1
      returning attempts`,[form.id,hash,bucket]);
    if(attempts.rows[0].attempts>8)throw new Error('Too many submissions. Please try again later');
    const duplicate=await db.query<{id:string}>(`select id from public.form_submissions where form_id=$1 and submission_key=$2 limit 1`,[form.id,key]);
    if(duplicate.rows[0]){submissionId=duplicate.rows[0].id;await db.query('commit');}
    else{
      const mapped=validated.mapped,email=plain(mapped.email,320).toLowerCase(),phone=plain(mapped.phone,80);
      const existing=email?await db.query<{id:string}>(`select id from public.leads where organization_id=$1 and lower(email)=$2 order by created_at desc limit 1`,[org,email]):{rows:[] as {id:string}[]};
      let leadId=existing.rows[0]?.id;
      if(!leadId){const lead=await db.query<{id:string}>(`insert into public.leads(organization_id,first_name,last_name,email,phone,company,title,source,status,form_id,campaign_id,custom_fields)
        values($1,$2,$3,$4,$5,$6,$7,'form','new',$8,$9,$10) returning id`,[org,plain(mapped.firstName,120)||'Unknown',plain(mapped.lastName,120),email,phone,plain(mapped.company,200)||null,plain(mapped.title,200)||null,form.id,form.campaign_id,JSON.stringify(validated.data)]);
        leadId=lead.rows[0].id;}
      const landing=pageId?await db.query(`select 1 from public.landing_pages where id=$1 and organization_id=$2 and status='published' and form_id=$3`,[pageId,org,form.id]):null;
      const resolvedPage=landing?.rowCount?pageId:null;
      const result=await db.query<{id:string}>(`insert into public.form_submissions(form_id,lead_id,organization_id,data,source_url,submission_key,utm,landing_page_id)
        values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,[form.id,leadId,org,JSON.stringify(validated.data),plain(req.headers.referer,1000)||null,key,JSON.stringify(utm),resolvedPage]);
      submissionId=result.rows[0].id;
      await db.query(`insert into public.activities(lead_id,type,description) values($1,'form_submission',$2)`,[leadId,`Lead submitted form: ${form.name}`]);
      if(resolvedPage)await db.query(`insert into public.landing_page_events(organization_id,landing_page_id,event_type,utm)
        values($1,$2,'form_submit',$3)`,[org,resolvedPage,JSON.stringify(utm)]);
      await db.query('commit');
    }
  }catch(error){await db.query('rollback').catch(()=>{});throw error;}finally{db.release();}
  if(isHtml){if(form.redirect_url){res.statusCode=303;res.setHeader('location',form.redirect_url);res.end();return;}
    res.statusCode=303;res.setHeader('location',`/f/${slug}?submitted=1`);res.end();return;}
  json(res,201,{accepted:true,submissionId,message:form.success_message,redirectUrl:form.redirect_url});
}
async function publicPage(req:IncomingMessage,res:ServerResponse,slug:string){
  const pages=await socialRest<PageRow[]>(`landing_pages?organization_id=eq.${org}&slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*&limit=1`);
  const page=pages[0];if(!page)return json(res,404,{error:'Page unavailable'});
  const linked=page.form_id?await socialRest<Array<{slug:string}>>(`forms?id=eq.${page.form_id}&organization_id=eq.${org}&status=eq.active&select=slug&limit=1`):[];
  const referrer=plain(req.headers.referer,1000);let referrerDomain:string|null=null;
  try{if(referrer)referrerDomain=new URL(referrer).hostname.slice(0,200);}catch{}
  const url=new URL(req.url||'/','https://local.invalid');const utm=Object.fromEntries(['utm_source','utm_medium','utm_campaign'].map(key=>[key,plain(url.searchParams.get(key),120)]).filter(([,value])=>value));
  await mcpPool.query(`update public.landing_pages set visits=visits+1 where id=$1`,[page.id]);
  await mcpPool.query(`insert into public.landing_page_events(organization_id,landing_page_id,event_type,referrer_domain,utm)
    values($1,$2,'view',$3,$4)`,[org,page.id,referrerDomain,JSON.stringify(utm)]);
  securityHeaders(res);res.setHeader('cache-control','no-store');res.end(pageHtml(page,linked[0]?.slug||null,utm));
}
export default async function handler(req:IncomingMessage,res:ServerResponse){try{
  const url=new URL(req.url||'/','https://local.invalid'),path=url.pathname,method=req.method||'GET';
  let match=path.match(/^\/f\/([a-z0-9-]+)$/);if(match&&['GET','POST'].includes(method))return await publicForm(req,res,match[1],method==='POST');
  match=path.match(/^\/p\/([a-z0-9-]+)$/);if(match&&method==='GET')return await publicPage(req,res,match[1]);
  if(!path.startsWith('/api/forms')&&!path.startsWith('/api/landing-pages'))return json(res,404,{error:'Not found'});
  const isForms=path.startsWith('/api/forms'),user=await actor(req,isForms?'forms':'landing-pages');
  const root=isForms?'/api/forms':'/api/landing-pages',parts=path.slice(root.length).split('/').filter(Boolean),id=parts[0];
  if(id&&!uuid.test(id))return json(res,400,{error:'Invalid ID'});
  if(isForms){
    if(method==='GET'&&!id){const forms=await mcpPool.query<FormRow>(`select f.*,(select count(*)::integer from public.form_submissions s where s.form_id=f.id) submission_count
      from public.forms f where f.organization_id=$1 order by f.created_at desc limit 500`,[org]);return json(res,200,forms.rows.map(row=>formShape(row,req)));}
    if(method==='POST'&&!id){const data=await body(req),name=plain(data.name,150),slug=safeSlug(data.slug||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));
      if(!name)throw new Error('Form name is required');const fields=validatedFields(data.fields||[]);
      if(data.status==='active'&&!fields.length)throw new Error('Add at least one field before publishing');
      const result=await mcpPool.query<FormRow>(`insert into public.forms(organization_id,name,description,status,slug,fields,success_message,submit_button_text,campaign_id)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[org,name,plain(data.description,1000)||null,data.status==='inactive'?'inactive':'active',slug,JSON.stringify(fields),
        plain(data.successMessage,1000)||'Thank you! We will be in touch.',plain(data.submitButtonText,80)||'Submit',uuid.test(String(data.campaignId||''))?data.campaignId:null]);
      return json(res,201,formShape(result.rows[0],req));}
    if(!id)return json(res,405,{error:'Method not allowed'});
    if(method==='GET'&&parts[1]==='submissions'){
      const form=await mcpPool.query(`select 1 from public.forms where id=$1 and organization_id=$2`,[id,org]);if(!form.rowCount)return json(res,404,{error:'Form not found'});
      const rows=await mcpPool.query(`select s.id,s.data,s.created_at,s.source_url,s.utm,s.lead_id,s.landing_page_id
        from public.form_submissions s where s.form_id=$1 and s.organization_id=$2 order by s.created_at desc limit 500`,[id,org]);
      if(parts[2]==='export.csv'){const columns=['id','created_at','lead_id','source_url','landing_page_id','data'];
        const escapeCsv=(v:unknown)=>{let text=typeof v==='object'?JSON.stringify(v):String(v??'');if(/^[=+@-]/.test(text))text="'"+text;return `"${text.replace(/"/g,'""')}"`;};
        res.statusCode=200;res.setHeader('content-type','text/csv; charset=utf-8');res.setHeader('content-disposition',`attachment; filename="form-${id}-submissions.csv"`);
        res.end([columns.join(','),...rows.rows.map(row=>columns.map(column=>escapeCsv(row[column])).join(','))].join('\r\n'));return;}
      return json(res,200,{submissions:rows.rows});}
    if(method==='GET'&&!parts[1]){const found=await mcpPool.query<FormRow>(`select f.*,(select count(*)::integer from public.form_submissions s where s.form_id=f.id) submission_count
      from public.forms f where f.id=$1 and f.organization_id=$2`,[id,org]);return found.rows[0]?json(res,200,formShape(found.rows[0],req)):json(res,404,{error:'Form not found'});}
    if(method==='PATCH'&&!parts[1]){const data=await body(req),updates:Record<string,unknown>={updated_at:new Date()};
      if('name'in data){updates.name=plain(data.name,150);if(!updates.name)throw new Error('Form name is required');}
      if('description'in data)updates.description=plain(data.description,1000)||null;
      if('status'in data){if(!['active','inactive'].includes(String(data.status)))throw new Error('Invalid form status');updates.status=data.status;}
      if('slug'in data)updates.slug=safeSlug(data.slug);
      if('fields'in data)updates.fields=JSON.stringify(validatedFields(data.fields));
      if('successMessage'in data)updates.success_message=plain(data.successMessage,1000)||null;
      if('submitButtonText'in data)updates.submit_button_text=plain(data.submitButtonText,80)||'Submit';
      if('redirectUrl'in data){const redirect=plain(data.redirectUrl,1000);if(redirect&&!/^https:\/\//.test(redirect))throw new Error('Redirect must use HTTPS');updates.redirect_url=redirect||null;}
      if('campaignId'in data){if(data.campaignId&&!uuid.test(String(data.campaignId)))throw new Error('Invalid campaign');updates.campaign_id=data.campaignId||null;}
      if(updates.status==='active'){const current=updates.fields?JSON.parse(String(updates.fields)) as Field[]:(await mcpPool.query<FormRow>(`select fields from public.forms where id=$1 and organization_id=$2`,[id,org])).rows[0]?.fields;
        if(!current?.length)throw new Error('Add at least one field before publishing');}
      const keys=Object.keys(updates),values=Object.values(updates);const result=await mcpPool.query<FormRow>(`update public.forms set ${keys.map((key,i)=>`${key}=$${i+3}`).join(',')}
        where id=$1 and organization_id=$2 returning *`,[id,org,...values]);return result.rows[0]?json(res,200,formShape(result.rows[0],req)):json(res,404,{error:'Form not found'});}
    if(method==='DELETE'&&!parts[1]){const result=await mcpPool.query(`update public.forms set status='inactive',updated_at=now() where id=$1 and organization_id=$2 returning id`,[id,org]);
      return result.rowCount?json(res,200,{archived:true}):json(res,404,{error:'Form not found'});}
  }else{
    if(method==='GET'&&!id){const pages=await mcpPool.query<PageRow>(`select * from public.landing_pages where organization_id=$1 order by updated_at desc limit 500`,[org]);return json(res,200,{pages:pages.rows.map(row=>pageShape(row,req))});}
    if(method==='POST'&&!id){const data=await body(req),name=plain(data.name,150),slug=safeSlug(data.slug||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));if(!name)throw new Error('Page name is required');
      const sections=validatedSections(data.sections||[{id:randomUUID(),type:'hero',eyebrow:'Welcome',heading:name,body:'Tell visitors how you help.',buttonText:'Get in touch',buttonUrl:'#contact'}]);
      const result=await mcpPool.query<PageRow>(`insert into public.landing_pages(organization_id,name,slug,sections,theme,created_by,seo_title)
        values($1,$2,$3,$4,$5,$6,$2) returning *`,[org,name,slug,JSON.stringify(sections),JSON.stringify(validatedTheme(data.theme)),user.id]);return json(res,201,pageShape(result.rows[0],req));}
    if(!id)return json(res,405,{error:'Method not allowed'});
    if(method==='GET'&&parts[1]==='stats'){
      const stats=await mcpPool.query(`select count(*) filter(where event_type='view')::integer views,
        count(*) filter(where event_type='form_submit')::integer submissions,
        count(distinct referrer_domain) filter(where referrer_domain is not null)::integer referring_domains
        from public.landing_page_events where landing_page_id=$1 and organization_id=$2`,[id,org]);
      const daily=await mcpPool.query(`select created_at::date day,count(*) filter(where event_type='view')::integer views,
        count(*) filter(where event_type='form_submit')::integer submissions from public.landing_page_events
        where landing_page_id=$1 and organization_id=$2 and created_at>=now()-interval '30 days' group by 1 order by 1`,[id,org]);
      const top=await mcpPool.query(`select referrer_domain,count(*)::integer views from public.landing_page_events
        where landing_page_id=$1 and organization_id=$2 and event_type='view' and referrer_domain is not null
        group by referrer_domain order by views desc limit 10`,[id,org]);return json(res,200,{...stats.rows[0],daily:daily.rows,referrers:top.rows});}
    if(method==='GET'&&!parts[1]){const found=await mcpPool.query<PageRow>(`select * from public.landing_pages where id=$1 and organization_id=$2`,[id,org]);return found.rows[0]?json(res,200,pageShape(found.rows[0],req)):json(res,404,{error:'Page not found'});}
    if(method==='PATCH'&&!parts[1]){const data=await body(req),updates:Record<string,unknown>={updated_at:new Date()};
      if('name'in data){updates.name=plain(data.name,150);if(!updates.name)throw new Error('Page name is required');}
      if('slug'in data)updates.slug=safeSlug(data.slug);
      if('sections'in data)updates.sections=JSON.stringify(validatedSections(data.sections));
      if('theme'in data)updates.theme=JSON.stringify(validatedTheme(data.theme));
      if('seoTitle'in data)updates.seo_title=plain(data.seoTitle,160)||null;
      if('seoDescription'in data)updates.seo_description=plain(data.seoDescription,300)||null;
      if('formId'in data){if(data.formId&&!uuid.test(String(data.formId)))throw new Error('Invalid form');
        if(data.formId){const form=await mcpPool.query(`select 1 from public.forms where id=$1 and organization_id=$2`,[data.formId,org]);if(!form.rowCount)throw new Error('Form not found');}updates.form_id=data.formId||null;}
      const keys=Object.keys(updates),result=await mcpPool.query<PageRow>(`update public.landing_pages set ${keys.map((key,i)=>`${key}=$${i+3}`).join(',')}
        where id=$1 and organization_id=$2 returning *`,[id,org,...Object.values(updates)]);return result.rows[0]?json(res,200,pageShape(result.rows[0],req)):json(res,404,{error:'Page not found'});}
    if(method==='POST'&&parts[1]==='publish'){
      const found=await mcpPool.query<PageRow>(`select * from public.landing_pages where id=$1 and organization_id=$2`,[id,org]);const page=found.rows[0];if(!page)return json(res,404,{error:'Page not found'});
      if(!Array.isArray(page.sections)||!page.sections.length)throw new Error('Add at least one section before publishing');
      if(page.sections.some(section=>section.type==='form')&&!page.form_id)throw new Error('Choose an active form before publishing a form section');
      if(page.form_id){const form=await mcpPool.query(`select 1 from public.forms where id=$1 and organization_id=$2 and status='active'`,[page.form_id,org]);if(!form.rowCount)throw new Error('Linked form is inactive');}
      const updated=await mcpPool.query<PageRow>(`update public.landing_pages set status='published',published_at=now(),updated_at=now()
        where id=$1 and organization_id=$2 returning *`,[id,org]);return json(res,200,pageShape(updated.rows[0],req));}
    if(method==='POST'&&parts[1]==='unpublish'){const updated=await mcpPool.query<PageRow>(`update public.landing_pages set status='draft',updated_at=now()
      where id=$1 and organization_id=$2 returning *`,[id,org]);return updated.rows[0]?json(res,200,pageShape(updated.rows[0],req)):json(res,404,{error:'Page not found'});}
    if(method==='POST'&&parts[1]==='duplicate'){const source=await mcpPool.query<PageRow>(`select * from public.landing_pages where id=$1 and organization_id=$2`,[id,org]);if(!source.rows[0])return json(res,404,{error:'Page not found'});
      const page=source.rows[0],slug=`${page.slug}-copy-${randomUUID().slice(0,6)}`;
      const result=await mcpPool.query<PageRow>(`insert into public.landing_pages(organization_id,name,slug,sections,theme,seo_title,seo_description,form_id,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[org,`${page.name} copy`,slug,JSON.stringify(page.sections),JSON.stringify(page.theme),page.seo_title,page.seo_description,page.form_id,user.id]);return json(res,201,pageShape(result.rows[0],req));}
    if(method==='DELETE'&&!parts[1]){const updated=await mcpPool.query(`update public.landing_pages set status='archived',updated_at=now()
      where id=$1 and organization_id=$2 returning id`,[id,org]);return updated.rowCount?json(res,200,{archived:true}):json(res,404,{error:'Page not found'});}
  }
  json(res,405,{error:'Method not allowed'});
}catch(error){const message=error instanceof Error?error.message:'Request failed';const status=message.includes('access')?403:message.includes('Sign in')||message.includes('Session')?401:
  message.includes('Too many submissions')?429:message.includes('duplicate key')?409:message.includes('required')||message.includes('Invalid')||message.includes('unsupported')||message.includes('Add at least')||message.includes('needs options')||message.includes('must be')?400:500;
  if(status===500)console.error('Marketing route failed',req.method,req.url,error instanceof Error?error.name:'unknown');
  if(req.url?.startsWith('/f/')&&String(req.headers['content-type']||'').includes('application/x-www-form-urlencoded')){
    res.statusCode=status;securityHeaders(res,true);res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Form error</title><body style="font:16px system-ui;padding:24px;max-width:600px;margin:auto"><h1>Could not submit the form</h1><p>${html(status===500?'Please try again shortly.':message)}</p><a href="${html(req.url.split('?')[0])}">Try again</a></body></html>`);return;}
  json(res,status,{error:status===500?'Marketing request failed':message});}}
