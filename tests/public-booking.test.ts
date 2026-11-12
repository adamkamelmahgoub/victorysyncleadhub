import assert from 'node:assert/strict';
import test from 'node:test';
import {availableBookingSlots,publicBookingInput,type PublicEventType} from '../lib/public-booking.js';

const event:PublicEventType={id:'event',slug:'consultation',title:'Consultation',description:null,
  duration_minutes:30,timezone:'America/New_York',available_days:['wed','thu'],
  available_start:'09:00',available_end:'10:00',max_bookings_per_day:2};

test('public booking exposes only valid open slots and validates guest data',()=>{
  const now=new Date('2026-11-04T12:00:00Z');
  const slots=availableBookingSlots(event,[],now);
  assert(slots.includes('2026-11-04T14:00:00.000Z'));
  assert(slots.includes('2026-11-04T14:30:00.000Z'));
  assert(!slots.includes('2026-11-04T15:00:00.000Z'));
  const blocked=availableBookingSlots(event,[{start_at:'2026-11-04T14:00:00Z',
    end_at:'2026-11-04T14:30:00Z',status:'confirmed'}],now);
  assert(!blocked.includes('2026-11-04T14:00:00.000Z'));
  assert(blocked.includes('2026-11-04T14:30:00.000Z'));
  const full=availableBookingSlots(event,[{start_at:'2026-11-04T14:00:00Z',end_at:'2026-11-04T14:30:00Z',status:'confirmed'},
    {start_at:'2026-11-04T14:30:00Z',end_at:'2026-11-04T15:00:00Z',status:'confirmed'}],now);
  assert(!full.includes('2026-11-04T14:30:00.000Z'));
  assert.equal(publicBookingInput.safeParse({slot:slots[0],guestName:'Pat',guestEmail:'pat@example.test'}).success,true);
  assert.equal(publicBookingInput.safeParse({slot:slots[0],guestName:'Pat',guestEmail:'invalid'}).success,false);
  assert.equal(publicBookingInput.safeParse({slot:slots[0],guestName:'Pat',guestEmail:'pat@example.test',accountId:'other'}).success,false);
});
