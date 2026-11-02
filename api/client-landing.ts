import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../lib/mcp-auth.js';
import {renderLandingPage,type LandingSection,type LandingTheme} from '../lib/marketing-pages.js';

export const config={api:{bodyParser:false},maxDuration:30};
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const org='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
function reply(res:ServerResponse,status:number,message:string){res.statusCode=status;res.setHeader('content-type','text/plain; charset=utf-8');res.end(message)}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  if(req.method!=='GET')return reply(res,405,'Method not allowed');
  const url=new URL(req.url||'/','https://local.invalid');
  try{
    const page=url.pathname.match(/^\/api\/public\/landing\/([^/]+)$/);
    if(page){
      if(!slugPattern.test(page[1]))return reply(res,404,'Page not found');
      const rows=await mcpPool.query<{id:string;title:string;seo_description:string;sections:LandingSection[];theme:LandingTheme;client_account_id:string|null;canonical_page_id:string|null;status:string}>(
        `select m.id,m.title,m.seo_description,m.sections,m.theme,m.client_account_id,
          m.canonical_page_id,m.status
         from public.marketing_landing_pages m
         left join public.landing_pages p on p.id=m.canonical_page_id
         where m.organization_id=$2 and (m.slug=$1 or (p.slug=$1 and p.status='published'))
         order by (p.slug=$1 and p.status='published') desc limit 1`,[page[1],org]);
      const found=rows.rows[0];if(!found)return reply(res,404,'Page not found');
      if(found.canonical_page_id){
        const canonical=await mcpPool.query<{slug:string}>(`select slug from public.landing_pages
          where id=$1 and organization_id=$2 and client_account_id is not distinct from $3::uuid
            and status='published' limit 1`,[found.canonical_page_id,org,found.client_account_id]);
        if(!canonical.rows[0])return reply(res,404,'Page not found');
        const query=new URLSearchParams();
        for(const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']){
          const value=url.searchParams.get(key);
          if(value)query.set(key,value.slice(0,200));
        }
        res.statusCode=307;res.setHeader('cache-control','no-store');
        res.setHeader('location',`/p/${encodeURIComponent(canonical.rows[0].slug)}${query.size?`?${query}`:''}`);
        return res.end();
      }
      if(found.client_account_id||found.status!=='published')return reply(res,404,'Page not found');
      await mcpPool.query(`insert into public.marketing_landing_page_events(page_id,event_type,client_account_id)
        values($1,'view',$2)`,[found.id,found.client_account_id]).catch(()=>undefined);
      const host=String(req.headers.host||'');
      const origin=/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)?`https://${host}`:'';
      res.statusCode=200;res.setHeader('content-type','text/html; charset=utf-8');
      res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
      res.setHeader('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-src 'self'; base-uri 'none'");
      return res.end(renderLandingPage(found,origin));
    }
    const form=url.pathname.match(/^\/api\/public\/forms\/([^/]+)$/);
    if(form){
      if(!uuidPattern.test(form[1]))return reply(res,404,'Form not found');
      const rows=await mcpPool.query<{slug:string}>(`select slug from public.forms
        where id=$1 and status='active' and organization_id=$2 limit 1`,[form[1],org]);
      if(!rows.rows[0])return reply(res,404,'Form not found');
      const target=new URL(`/f/${encodeURIComponent(rows.rows[0].slug)}`,'https://local.invalid');
      const pageId=url.searchParams.get('page');if(pageId&&uuidPattern.test(pageId))target.searchParams.set('lp',pageId);
      res.statusCode=307;res.setHeader('location',`${target.pathname}${target.search}`);return res.end();
    }
    return reply(res,404,'Not found');
  }catch(error){return reply(res,500,error instanceof Error?error.message:'Page unavailable')}
}
