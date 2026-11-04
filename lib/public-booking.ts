import {z} from 'zod';

export const bookingSlug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
export const publicBookingInput=z.object({
  slot:z.string().datetime({offset:true}),
  guestName:z.string().trim().min(1).max(200),
  guestEmail:z.string().trim().email().max(320),
  guestPhone:z.string().trim().max(40).optional(),
  notes:z.string().trim().max(5000).optional(),
}).strict();

export interface PublicEventType {
  id:string;slug:string;title:string;description:string|null;duration_minutes:number;
  timezone:string;available_days:string[];available_start:string;available_end:string;
  max_bookings_per_day:number|null;
}
export interface ExistingBooking {start_at:string;end_at:string;status:string}

function localParts(date:Date,timezone:string){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
    weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const value=(type:string)=>parts.find(part=>part.type===type)?.value??'';
  return {date:`${value('year')}-${value('month')}-${value('day')}`,
    day:value('weekday').toLowerCase(),time:`${value('hour')}:${value('minute')}`};
}

export function availableBookingSlots(event:PublicEventType,bookings:ExistingBooking[],now=new Date()):string[]{
  if(!Number.isInteger(event.duration_minutes)||event.duration_minutes<5||event.duration_minutes>240)return [];
  const step=Math.min(event.duration_minutes,30)*60_000;
  const duration=event.duration_minutes*60_000;
  const start=Math.ceil((now.getTime()+15*60_000)/step)*step;
  const end=now.getTime()+14*24*60*60_000;
  const daily=new Map<string,number>();
  for(const booking of bookings){if(booking.status==='cancelled')continue;
    const date=localParts(new Date(booking.start_at),event.timezone).date;
    daily.set(date,(daily.get(date)??0)+1);
  }
  const slots:string[]=[];
  for(let time=start;time<end;time+=step){
    const local=localParts(new Date(time),event.timezone);
    const localEnd=localParts(new Date(time+duration),event.timezone);
    if(!event.available_days.includes(local.day)||local.time<event.available_start||
      localEnd.date!==local.date||localEnd.time>event.available_end)continue;
    if(event.max_bookings_per_day!==null&&(daily.get(local.date)??0)>=event.max_bookings_per_day)continue;
    if(bookings.some(booking=>booking.status!=='cancelled'&&
      time<new Date(booking.end_at).getTime()&&time+duration>new Date(booking.start_at).getTime()))continue;
    slots.push(new Date(time).toISOString());
    if(slots.length>=100)break;
  }
  return slots;
}
