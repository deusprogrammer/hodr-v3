import { z } from 'zod';

export const TaskRequestSchema = z.object({
  url: z.url(),
  task: z.string().min(1),
});
