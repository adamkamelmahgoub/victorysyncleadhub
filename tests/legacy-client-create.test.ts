import test from 'node:test';
import assert from 'node:assert/strict';

test('legacy client creation uses canonical provisioning and returns the owner invite',async()=>{
  process.env.SUPABASE_URL='https://client-create-test.invalid';
  process.env.SUPABASE_ANON_KEY='test-key';
  const {default:handler}=await import('../api/[...path].js');
  const originalFetch=globalThis.fetch;
  const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/auth/v1/user')return Response.json({id:'10000000-0000-4000-8000-000000000001',user_metadata:{role:'owner'}});
    if(url.pathname==='/rest/v1/portal_activity_log')return Response.json([]);
    if(url.pathname==='/rest/v1/rpc/portal_create_client_manual'){
      calls.push('create');
      assert.equal(new Headers(init?.headers).get('authorization')?.startsWith('Bearer '),true);
      assert.equal(JSON.parse(String(init?.body)).p_package,'scale');
      return Response.json({accountId:'20000000-0000-4000-8000-000000000001',inviteCode:'private-code',existing:false});
    }
    if(url.pathname==='/rest/v1/rpc/portal_apply_account_template'){
      calls.push('template');
      assert.equal(JSON.parse(String(init?.body)).p_account,'20000000-0000-4000-8000-000000000001');
      return Response.json({template:'scale'});
    }
    throw new Error(`Unexpected network call: ${url.pathname}`);
  };
  try{
    const token=`header.${Buffer.from(JSON.stringify({sub:'10000000-0000-4000-8000-000000000001',crm_role:'owner'})).toString('base64url')}.signature`;
    let result:Record<string,unknown>|null=null;
    const res={statusCode:0,setHeader(){},end(body?:string){result=JSON.parse(body||'{}')}};
    await handler({method:'POST',url:'/api/sub-accounts',headers:{authorization:`Bearer ${token}`},
      body:{name:'Demo Plumbing',ownerName:'Demo Owner',ownerEmail:'owner@example.test',phone:'+15555550100',website:'https://example.test',plan:'scale'},on(){}},res);
    assert.equal(res.statusCode,201);
    assert.deepEqual(calls,['create','template']);
    assert.equal(result?.accountId,'20000000-0000-4000-8000-000000000001');
    assert.match(String(result?.inviteUrl),/private-code/);
  }finally{globalThis.fetch=originalFetch;}
});
