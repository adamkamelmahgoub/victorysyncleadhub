import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../lib/mcp-auth.js';
import handler from '../api/public-booking.js';

test('public booking endpoint hides private rows and rejects a repeated slot under its event lock',async()=>{
  const originalQuery=mcpPool.query;
  const originalConnect=mcpPool.connect;
  const event={id:'event-id',slug:'consultation',title:'Consultation',description:null,
    duration_minutes:30,timezone:'America/New_York',available_days:['wed'],
    available_start:'09:00',available_end:'10:00',max_bookings_per_day:2};
  let bookings:Array<{start_at:string;end_at:string;status:string}>=[];
  let locked=false;
  let inserts=0;
  const now=new Date('2026-11-04T12:00:00Z');
  const realNow=Date;
  class FrozenDate extends Date {constructor(value?:string|number|Date){super(value===undefined?now:value)}
    static override now(){return now.getTime()}}
  Object.assign(globalThis,{Date:FrozenDate});
  const query=async(sql:string,values?:unknown[])=>{
    if(sql==='begin'||sql==='commit'||sql==='rollback')return {rows:[]};
    if(sql.includes('meeting_event_types')){assert.deepEqual(values,['consultation']);
      if(sql.includes('for update'))locked=true;return {rows:[event]};}
    if(sql.includes('select start_at,end_at,status'))return {rows:bookings};
    if(sql.includes('count(*)::text'))return {rows:[{count:'0'}]};
    if(sql.includes('insert into public.meeting_appointments')){
      assert(locked);inserts++;
      bookings=[...bookings,{start_at:String(values?.[4]),end_at:String(values?.[5]),status:'confirmed'}];
      return {rows:[{id:'appointment-id'}]};
    }
    throw Error(`Unexpected SQL: ${sql}`);
  };
  Object.assign(mcpPool,{query,connect:async()=>({query,release(){}})});
  async function request(method:'GET'|'POST',body?:unknown){
    const req=Readable.from(body?[JSON.stringify(body)]:[]) as IncomingMessage;
    Object.assign(req,{method,url:'/api/public/booking/consultation',headers:{}});
    let value:unknown;
    const res={statusCode:200,setHeader(){},end(data?:string){value=JSON.parse(data??'{}')}} as unknown as ServerResponse;
    await handler(req,res);
    return {status:res.statusCode,body:value as Record<string,unknown>};
  }
  try{
    const initial=await request('GET');
    assert.equal(initial.status,200);
    assert(!JSON.stringify(initial.body).includes('event-id'));
    const slot=(initial.body.slots as string[]).find(value=>value==='2026-11-04T14:00:00.000Z');
    assert(slot);
    const input={slot,guestName:'Taylor Customer',guestEmail:'taylor@example.test'};
    assert.equal((await request('POST',{...input,clientAccountId:'other'})).status,400);
    assert.equal((await request('POST',input)).status,201);
    assert.equal((await request('POST',input)).status,409);
    assert.equal(inserts,1);
  }finally{Object.assign(mcpPool,{query:originalQuery,connect:originalConnect});Object.assign(globalThis,{Date:realNow});}
});
