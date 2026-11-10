import { z } from 'zod';

export const initSessionSchema = {
  body: z
    .object({
      tableToken: z.string().min(20).max(120),
    })
    .strict(),
};

export const createOrderSchema = {
  body: z
    .object({
      items: z
        .array(
          z
            .object({
              menuItemId: z.number().int().positive(),
              variantId: z.number().int().positive().nullable().optional(),
              quantity: z.number().int().min(1).max(20),
              specialInstructions: z.string().max(250).optional(),
            })
            .strict()
        )
        .min(1)
        .max(40),
      dealCode: z.string().trim().min(2).max(40).optional(),
      notes: z.string().max(500).optional(),
    })
    .strict(),
};

export const waiterCallSchema = {
  body: z
    .object({
      reason: z.string().trim().min(2).max(200).optional(),
    })
    .strict(),
};

export const billSplitSchema = {
  body: z
    .object({
      splitType: z.enum(['full', 'equal', 'by_item']),
      parts: z.number().int().min(2).max(10).optional(),
      itemIds: z.array(z.number().int().positive()).min(1).max(100).optional(),
    })
    .strict(),
};

export const createPaymentOrderSchema = {
  body: z
    .object({
      billSplitId: z.number().int().positive().nullable().optional(),
      tipPaise: z.number().int().min(0).max(500000).optional(),
    })
    .strict(),
};

export const verifyPaymentSchema = {
  body: z
    .object({
      razorpayOrderId: z.string().min(6).max(80),
      razorpayPaymentId: z.string().min(6).max(80),
      razorpaySignature: z.string().min(16).max(128),
      method: z.enum(['upi', 'card', 'netbanking', 'wallet', 'mock']).optional(),
    })
    .strict(),
};

export const sendReceiptSchema = {
  body: z
    .object({
      email: z.string().trim().email().max(190),
    })
    .strict(),
};

export const createReviewSchema = {
  body: z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(500).optional(),
    })
    .strict(),
};
