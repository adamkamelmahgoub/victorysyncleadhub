import assert from 'node:assert/strict';
import test from 'node:test';

test('meeting API validates booking inputs and checks an active event type before inserting',async()=>{
  const envKeys=['SUPABASE_URL','SUPABASE_ANON_KEY'] as const;
  const oldEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{SUPABASE_URL:'https://meeting-api.test',SUPABASE_ANON_KEY:'test-key'});
  const {default:handler}=await import('../api/[...path].js');
  const oldFetch=globalThis.fetch;
  const eventId='10000000-0000-4000-8000-000000000001';
  const appointmentId='20000000-0000-4000-8000-000000000001';
  const token=`header.${Buffer.from(JSON.stringify({sub:'admin-user',crm_role:'owner'})).toString('base64url')}.signature`;
  let active=false;
  let inserts=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/auth/v1/user')return Response.json({id:'admin-user',user_metadata:{role:'owner'}});
    if(url.pathname==='/rest/v1/portal_activity_log')return Response.json([]);
    if(url.pathname==='/rest/v1/meeting_event_types'){
      assert.equal(url.searchParams.get('id'),`eq.${eventId}`);
      assert.equal(url.searchParams.get('is_active'),'eq.true');
      return Response.json(active?[{id:eventId}]:[]);
    }
    if(url.pathname==='/rest/v1/meeting_appointments'&&init?.method==='POST'){
      inserts++;
      const body=JSON.parse(String(init.body));
      assert.deepEqual(Object.keys(body).sort(),['end_at','event_type_id','guest_email','guest_name','start_at','timezone']);
      assert.equal(body.event_type_id,eventId);
      return Response.json([{id:appointmentId,...body,status:'confirmed'}]);
    }
    throw Error(`Unexpected request: ${url.pathname} ${init?.method}`);
  };
  async function post(body:Record<string,unknown>){
    let data:Record<string,unknown>|null=null;
    const res={statusCode:0,setHeader(){},end(value?:string){data=JSON.parse(value||'{}')}};
    await handler({method:'POST',url:'/api/meeting/appointments',headers:{authorization:`Bearer ${token}`},body,on(){}},res);
    return {status:res.statusCode,data};
  }
  const valid={eventTypeId:eventId,guestName:'Taylor Client',guestEmail:'taylor@example.test',
    startAt:'2026-11-10T14:00:00.000Z',endAt:'2026-11-10T14:30:00.000Z',timezone:'America/New_York'};
  try{
    assert.equal((await post({...valid,endAt:valid.startAt})).status,400);
    assert.equal((await post({...valid,clientAccountId:eventId})).status,400);
    assert.equal((await post(valid)).status,400);
    active=true;
    const created=await post(valid);
    assert.equal(created.status,201);
    assert.equal(created.data?.id,appointmentId);
    assert.equal(inserts,1);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of envKeys){const value=oldEnv[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
