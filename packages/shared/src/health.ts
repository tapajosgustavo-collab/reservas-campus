import { z } from 'zod';

export const esquemaHealth = z.object({
  status: z.literal('ok'),
  sha: z.string().describe('SHA do commit em execução'),
});

export type Health = z.infer<typeof esquemaHealth>;
