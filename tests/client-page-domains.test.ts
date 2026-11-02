import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mcpPool} from '../lib/mcp-auth.js';

test('root host route preserves workspace hosts and serves client domains',()=>{
  const routes=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')) as {
    routes:Array<{src?:string;dest?:string;missing?:Array<{type:string;value:string}>}>};
  const root=routes.routes.find(route=>route.src==='^/$');
  assert.equal(root?.dest,'/api/marketing.ts');
  const excluded=new RegExp(root?.missing?.[0]?.value||'');
  for(const host of ['app.victorysync.com','portal.victorysync.com','www.victorysync.com',
    'preview.vercel.app','localhost:4173','127.0.0.1:4173'])
    assert.match(host,excluded,host);
  assert.doesNotMatch('client.example.com',excluded);
  assert.ok(routes.routes.some(route=>route.src==='^/api/domain-page$'&&route.dest==='/api/marketing.ts'));
});

test('custom page host serves only its published page and never another slug',async()=>{
  const original=mcpPool.query;
  const page={id:'40000000-0000-4000-8000-000000000001',organization_id:'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    client_account_id:'10000000-0000-4000-8000-000000000001',name:'Client plumbing',slug:'plumbing',
    status:'published',sections:[{id:'hero',type:'hero',heading:'Private client page'}],
    published_sections:[{id:'hero',type:'hero',heading:'Published client page'}],
    theme:{primary:'#2563eb',text:'#172033',background:'#ffffff'},
    published_theme:{primary:'#2563eb',text:'#172033',background:'#ffffff'},
    custom_domain:'client.example.com',variant_of:null,form_id:null,tracking:{},visits:0};
  let status=page.status;
  const queries:string[]=[];
  mcpPool.query=(async(sql:string,params?:unknown[])=>{
    queries.push(sql);
    if(sql.includes('lower(custom_domain)'))return {rows:params?.[0]==='client.example.com'?[{...page,status}]:[],rowCount:1};
    if(sql.includes('where organization_id=$1 and slug=$2'))return {rows:[page],rowCount:1};
    if(sql.includes('variant_of=$1'))return {rows:[],rowCount:0};
    return {rows:[],rowCount:0};
  }) as typeof mcpPool.query;
  try{
    const {default:handler}=await import('../api/marketing.js');
    async function invoke(path:string,host:string){
      let content='';const headers:Record<string,string>={};
      const response={statusCode:200,setHeader(key:string,value:string){headers[key]=value},
        end(value?:string){content=value||''}};
      await handler({method:'GET',url:path,headers:{host}} as never,response as never);
      return {status:response.statusCode,content,headers};
    }
    const home=await invoke('/','client.example.com');
    assert.equal(home.status,200);
    assert.match(home.content,/Published client page/);
    assert.doesNotMatch(home.content,/Private client page/);
    assert.equal((await invoke('/p/other','client.example.com')).status,404);
    assert.equal((await invoke('/p/plumbing','client.example.com')).status,200);
    assert.equal((await invoke('/p/plumbing','app.victorysync.com')).status,200);
    status='draft';
    assert.equal((await invoke('/api/domain-page','client.example.com')).status,404);
    assert.ok(queries.some(sql=>sql.includes('lower(custom_domain)')));
  }finally{mcpPool.query=original}
});

test('custom domain keeps an A/B visitor on the same variant and passes UTM into its form',async()=>{
  const original=mcpPool.query;
  const baseId='40000000-0000-4000-8000-000000000011',variantId='40000000-0000-4000-8000-000000000012';
  const base={id:baseId,organization_id:'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    client_account_id:'10000000-0000-4000-8000-000000000001',name:'Plumbing',slug:'plumbing',
    status:'published',sections:[],published_sections:[{id:'hero',type:'hero',heading:'Base headline'},
      {id:'form',type:'form',heading:'Get a quote'}],theme:{primary:'#2563eb'},published_theme:{primary:'#2563eb'},
    custom_domain:'offers.example.com',variant_of:null,form_id:'50000000-0000-4000-8000-000000000001',
    tracking:{ga4_id:'G-ABC123'},traffic_split:100,visits:0};
  const variant={...base,id:variantId,slug:'plumbing-b',custom_domain:null,variant_of:baseId,
    published_sections:[{id:'hero',type:'hero',heading:'Variant headline'},
      {id:'form',type:'form',heading:'Get a quote'}],tracking:{},traffic_split:0};
  const eventParams:unknown[][]=[];
  mcpPool.query=(async(sql:string,params?:unknown[])=>{
    if(sql.includes('lower(custom_domain)'))return {rows:[base],rowCount:1};
    if(sql.includes('variant_of=$1'))return {rows:[variant],rowCount:1};
    if(sql.includes('select slug from public.forms'))return {rows:[{slug:'lead'}],rowCount:1};
    if(sql.includes('insert into public.landing_page_events'))eventParams.push(params||[]);
    return {rows:[],rowCount:0};
  }) as typeof mcpPool.query;
  try{
    const {default:handler}=await import('../api/marketing.js');
    async function invoke(cookie=''){
      let content='';const headers:Record<string,string>={};
      const response={statusCode:200,setHeader(key:string,value:string){headers[key]=value},
        end(value?:string){content=value||''}};
      await handler({method:'GET',url:'/?utm_source=google&utm_campaign=fall+offer',
        headers:{host:'offers.example.com',cookie}} as never,response as never);
      return {content,headers};
    }
    const first=await invoke();
    assert.match(first.content,/Variant headline/);
    assert.match(first.content,/gtag\/js\?id=G-ABC123/);
    assert.match(first.content,new RegExp(`lp=${variantId}&amp;utm_source=google&amp;utm_campaign=fall\\+offer`));
    assert.match(first.headers['set-cookie'],/Path=\//);
    assert.doesNotMatch(first.headers['set-cookie'],/Path=\/p\//);
    base.traffic_split=0;
    const second=await invoke(`lp_variant_${baseId}=${variantId}`);
    assert.match(second.content,/Variant headline/);
    assert.equal(eventParams[0][1],variantId);
    assert.equal(eventParams[0][2],variantId);
  }finally{mcpPool.query=original;}
});
