import {z} from 'zod';

export const meetingAppointmentInput=z.object({
  eventTypeId:z.string().uuid(),
  guestName:z.string().trim().min(1).max(200),
  guestEmail:z.string().trim().email().max(320),
  guestPhone:z.string().max(40).optional(),
  startAt:z.string().datetime({offset:true}),
  endAt:z.string().datetime({offset:true}),
  timezone:z.string().min(1).max(100),
  notes:z.string().max(5000).optional(),
}).strict().refine(value=>new Date(value.endAt)>new Date(value.startAt),
  {path:['endAt'],message:'End time must be after start time'});

export const meetingAppointmentUpdate=z.object({
  status:z.enum(['confirmed','completed','cancelled']).optional(),
  notes:z.string().max(5000).optional(),
}).strict().refine(value=>value.status!==undefined||value.notes!==undefined);
