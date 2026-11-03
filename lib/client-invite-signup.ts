import {z} from 'zod';

export const clientInviteSignupSchema=z.object({
  name:z.string().trim().min(1).max(200),
  email:z.string().trim().email().max(320).transform(value=>value.toLowerCase()),
  password:z.string().min(8).max(128),
  inviteCode:z.string().trim().min(1).max(256),
}).strict();
