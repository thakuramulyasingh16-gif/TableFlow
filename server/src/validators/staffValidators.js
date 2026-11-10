import { z } from 'zod';

export const orderIdParamSchema = {
  params: z.object({ orderId: z.coerce.number().int().positive() }).strict(),
};

export const callIdParamSchema = {
  params: z.object({ callId: z.coerce.number().int().positive() }).strict(),
};

export const tableStatusSchema = {
  params: z.object({ tableId: z.coerce.number().int().positive() }).strict(),
  body: z
    .object({
      status: z.enum(['free', 'ordered', 'needs_help', 'bill_requested']),
    })
    .strict(),
};
