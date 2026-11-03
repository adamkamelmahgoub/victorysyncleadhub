import {z} from 'zod';
import {sectionsSchema} from './landing-section-registry.js';

export const aiPageInputSchema=z.object({
  action:z.literal('ai_page'),
  prompt:z.string().trim().min(5).max(4000),
  currentSections:sectionsSchema.max(40).optional(),
}).strict();
