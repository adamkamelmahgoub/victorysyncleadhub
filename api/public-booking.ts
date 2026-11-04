import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../lib/mcp-auth.js';
import {availableBookingSlots,bookingSlug,publicBookingInput,
  type ExistingBooking,type PublicEventType} from '../lib/public-booking.js';

export const config={api:{bodyParser:false},maxDuration:20};
function send(res:ServerResponse,status:number,data:unknown){res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  res.end(JSON.stringify(data));}
async function readBody(req:IncomingMessage){
  let value='';for await(const chunk of req){value+=String(chunk);if(value.length>12_000)throw Error('too_large');}
  return JSON.parse(value);
}
const eventQuery=`select id,slug,title,description,duration_minutes,timezone,available_days,
  available_start,available_end,max_bookings_per_day from public.meeting_event_types
  where slug=$1 and is_active=true limit 1`;
const bookingQuery=`select start_at,end_at,status from public.meeting_appointments
  where event_type_id=$1 and start_at>=now()-interval '1 day'
    and start_at<now()+interval '16 days' and status<>'cancelled'`;

export default async function handler(req:IncomingMessage,res:ServerResponse){
  const url=new URL(req.url??'/','https://local.invalid');
  const rawSlug=url.pathname.match(/^\/api\/public\/booking\/([^/]+)$/)?.[1];
  const slug=bookingSlug.safeParse(rawSlug);
  if(!slug.success)return send(res,404,{error:'Booking page not found'});
  if(req.method!=='GET'&&req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  try{
    if(req.method==='GET'){
      const events=await mcpPool.query<PublicEventType>(eventQuery,[slug.data]);
      const event=events.rows[0];if(!event)return send(res,404,{error:'Booking page not found'});
      const bookings=await mcpPool.query<ExistingBooking>(bookingQuery,[event.id]);
      return send(res,200,{event:{title:event.title,description:event.description,
        durationMinutes:event.duration_minutes,timezone:event.timezone},
        slots:availableBookingSlots(event,bookings.rows)});
    }
    const input=publicBookingInput.safeParse(await readBody(req));
    if(!input.success)return send(res,400,{error:'Enter a valid time, name and email.'});
    const client=await mcpPool.connect();
    try{
      await client.query('begin');
      const events=await client.query<PublicEventType>(`${eventQuery} for update`,[slug.data]);
      const event=events.rows[0];
      if(!event){await client.query('rollback');return send(res,404,{error:'Booking page not found'});}
      const bookings=await client.query<ExistingBooking>(bookingQuery,[event.id]);
      if(!availableBookingSlots(event,bookings.rows).includes(input.data.slot)){
        await client.query('rollback');return send(res,409,{error:'That time is no longer available. Choose another time.'});
      }
      const repeated=await client.query<{count:string}>(`select count(*)::text as count from public.meeting_appointments
        where event_type_id=$1 and lower(guest_email)=lower($2)
          and created_at>now()-interval '24 hours'`,[event.id,input.data.guestEmail]);
      if(Number(repeated.rows[0]?.count??0)>=3){await client.query('rollback');
        return send(res,429,{error:'Too many recent bookings. Please contact the business directly.'});}
      const end=new Date(new Date(input.data.slot).getTime()+event.duration_minutes*60_000).toISOString();
      const created=await client.query<{id:string}>(`insert into public.meeting_appointments
        (event_type_id,guest_name,guest_email,guest_phone,start_at,end_at,timezone,notes,status)
        values($1,$2,$3,$4,$5,$6,$7,$8,'confirmed') returning id`,
        [event.id,input.data.guestName,input.data.guestEmail,input.data.guestPhone??null,
          input.data.slot,end,event.timezone,input.data.notes??null]);
      await client.query('commit');
      return send(res,201,{id:created.rows[0]?.id,startAt:input.data.slot,endAt:end,
        timezone:event.timezone,title:event.title});
    }catch(error){await client.query('rollback').catch(()=>undefined);throw error;}
    finally{client.release();}
  }catch(error){
    if(error instanceof SyntaxError||error instanceof Error&&error.message==='too_large')
      return send(res,400,{error:'Enter a valid booking request.'});
    console.error('Public booking failed',error instanceof Error?error.message:'unknown');
    return send(res,503,{error:'Booking is temporarily unavailable. Please try again.'});
  }
}
