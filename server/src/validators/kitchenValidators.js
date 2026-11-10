import { z } from 'zod';

export const updateKitchenItemStatusSchema = {
  params: z.object({ itemId: z.coerce.number().int().positive() }).strict(),
  body: z
    .object({
      status: z.enum(['preparing', 'ready']),
    })
    .strict(),
};
