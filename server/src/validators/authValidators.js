import { z } from 'zod';

export const loginSchema = {
  body: z
    .object({
      email: z.string().email().max(190),
      password: z.string().min(8).max(128),
    })
    .strict(),
};
