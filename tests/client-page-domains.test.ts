import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mcpPool} from '../lib/mcp-auth.js';
import proxy,{isClientPageHost} from '../proxy.js';

test('domain proxy keeps workspace hosts and routes client-owned hosts',()=>{
  for(const host of ['app.victorysync.com','portal.victorysync.com','www.victorysync.com',
    'preview.vercel.app','localhost:4173','127.0.0.1:4173'])
    assert.equal(isClientPageHost(host),false,host);
  assert.equal(isClientPageHost('client.example.com'),true);
  const routes=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')) as {
    proxy?:{entrypoint:string;matcher:string[]};routes:Array<{src?:string;dest?:string}>};
  assert.equal(routes.proxy?.entrypoint,'proxy.ts');
  assert.ok(routes.proxy?.matcher.includes('/'));
  assert.ok(routes.routes.some(route=>route.src==='^/api/domain-page$'&&route.dest==='/api/marketing.ts'));
  const client=proxy(new Request('https://client.example.com/',{headers:{host:'client.example.com'}}));
  assert.equal(client.headers.get('x-middleware-rewrite'),'https://client.example.com/api/domain-page');
  const workspace=proxy(new Request('https://app.victorysync.com/',{headers:{host:'app.victorysync.com'}}));
  assert.equal(workspace.headers.get('x-middleware-rewrite'),null);
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
    const home=await invoke('/api/domain-page','client.example.com');
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
