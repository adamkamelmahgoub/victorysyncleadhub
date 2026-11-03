import assert from 'node:assert/strict';
import test from 'node:test';

test('invite acceptance binds the new auth user to the invited account',async()=>{
  process.env.SUPABASE_URL='https://invite-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
  const {default:handler}=await import('../api/[...path].js');
  const originalFetch=globalThis.fetch;
  const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/rest/v1/invite_codes'){
      if(init?.method==='PATCH'){
        calls.push('mark-used');
        assert.equal(JSON.parse(String(init.body)).used_by_user_id,'30000000-0000-4000-8000-000000000001');
        return Response.json([]);
      }
      calls.push('invite');
      return Response.json([{id:'10000000-0000-4000-8000-000000000001',email:'owner@example.com',
        team_member_id:'20000000-0000-4000-8000-000000000001',client_account_id:'40000000-0000-4000-8000-000000000001',
        role:'client_owner',expires_at:'2099-01-01T00:00:00Z'}]);
    }
    if(url.pathname==='/rest/v1/team_members'){
      if(init?.method==='PATCH'){
        calls.push('activate-member');
        assert.equal(JSON.parse(String(init.body)).auth_user_id,'30000000-0000-4000-8000-000000000001');
        return Response.json([]);
      }
      calls.push('member');
      return Response.json([{id:'20000000-0000-4000-8000-000000000001',role:'client_owner',
        client_account_id:'40000000-0000-4000-8000-000000000001',org_id:'50000000-0000-4000-8000-000000000001',
        page_permissions:['dashboard','leads']}]);
    }
    if(url.pathname==='/auth/v1/admin/users'){
      calls.push('auth-user');
      const body=JSON.parse(String(init?.body));
      assert.equal(body.email,'owner@example.com');
      assert.equal(body.user_metadata.role,'client_owner');
      assert.equal(body.user_metadata.client_account_id,'40000000-0000-4000-8000-000000000001');
      assert.deepEqual(body.user_metadata.page_permissions,['dashboard','leads']);
      return Response.json({id:'30000000-0000-4000-8000-000000000001'});
    }
    throw Error(`Unexpected request: ${url.pathname}`);
  };
  try{
    const run=async(body:Record<string,unknown>)=>{
      let result:Record<string,unknown>|null=null;
      const res={statusCode:0,setHeader(){},end(value?:string){result=JSON.parse(value||'{}')}};
      await handler({method:'POST',url:'/api/auth/signup-with-invite',headers:{},body,on(){}},res);
      return {status:res.statusCode,result};
    };
    assert.equal((await run({name:'Owner',email:'bad',password:'long-enough',inviteCode:'abc'})).status,400);
    assert.deepEqual(calls,[]);
    const accepted=await run({name:'Owner',email:' Owner@Example.com ',password:'long-enough',inviteCode:'abc'});
    assert.equal(accepted.status,201);
    assert.deepEqual(calls,['invite','member','auth-user','mark-used','activate-member']);
  }finally{globalThis.fetch=originalFetch;}
});
