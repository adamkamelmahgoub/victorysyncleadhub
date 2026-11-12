import assert from 'node:assert/strict';
import test from 'node:test';
import {meetingAppointmentInput,meetingAppointmentUpdate} from '../lib/meeting-appointment-input.js';

test('appointment inputs require an event type and a forward time range',()=>{
  const valid={eventTypeId:'10000000-0000-4000-8000-000000000001',guestName:'Alex Customer',
    guestEmail:'alex@example.test',startAt:'2026-11-04T12:00:00.000Z',
    endAt:'2026-11-04T12:30:00.000Z',timezone:'America/New_York'};
  assert.equal(meetingAppointmentInput.safeParse(valid).success,true);
  assert.equal(meetingAppointmentInput.safeParse({...valid,endAt:valid.startAt}).success,false);
  assert.equal(meetingAppointmentInput.safeParse({...valid,eventTypeId:'1'}).success,false);
  assert.equal(meetingAppointmentInput.safeParse({...valid,status:'confirmed'}).success,false);
  assert.equal(meetingAppointmentUpdate.safeParse({status:'completed'}).success,true);
  assert.equal(meetingAppointmentUpdate.safeParse({status:'made_up'}).success,false);
  assert.equal(meetingAppointmentUpdate.safeParse({guestEmail:'other@example.test'}).success,false);
});
