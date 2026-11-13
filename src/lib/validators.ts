import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AppError } from './api-error';

export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError(400, 'Malformed JSON request body', 'INVALID_JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .slice(0, 3)
      .join('; ');
    throw new AppError(400, msg || 'Validation failed', 'VALIDATION_ERROR');
  }
  return parsed.data;
}

const httpsImageUrlSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((u) => u.startsWith('https://'), 'Image URL must use https://');

export const initGuestSessionSchema = z
  .object({
    tableToken: z.string().min(20).max(120),
  })
  .strict();

export const createGuestOrderSchema = z
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
  .strict();

export const waiterCallSchema = z
  .object({
    reason: z.string().trim().min(2).max(200).optional(),
  })
  .strict();

export const billSplitSchema = z
  .object({
    splitType: z.enum(['full', 'equal', 'by_item']),
    parts: z.number().int().min(2).max(10).optional(),
    itemIds: z.array(z.number().int().positive()).min(1).max(100).optional(),
  })
  .strict();

export const createPaymentOrderSchema = z
  .object({
    billSplitId: z.number().int().positive().nullable().optional(),
    tipPaise: z.number().int().min(0).max(500000).optional(),
  })
  .strict();

export const verifyPaymentSchema = z
  .object({
    razorpayOrderId: z.string().min(6).max(80),
    razorpayPaymentId: z.string().min(6).max(80),
    razorpaySignature: z.string().min(16).max(128),
    method: z.enum(['upi', 'card', 'netbanking', 'wallet', 'mock']).optional(),
  })
  .strict();

export const sendReceiptSchema = z
  .object({
    email: z.string().trim().email().max(190),
  })
  .strict();

export const createReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
  })
  .strict();

export const tableStatusUpdateSchema = z
  .object({
    status: z.enum(['free', 'ordered', 'needs_help', 'bill_requested']),
  })
  .strict();

export const kitchenItemStatusSchema = z
  .object({
    status: z.enum(['preparing', 'ready']),
  })
  .strict();

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().trim().max(255).optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.partial().strict();

export const createMenuItemSchema = z
  .object({
    categoryId: z.number().int().positive(),
    stationId: z.number().int().positive(),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    imageUrl: httpsImageUrlSchema.optional().nullable(),
    basePricePaise: z.number().int().min(100).max(10000000),
    isVeg: z.boolean(),
    spiceLevel: z.enum(['none', 'mild', 'medium', 'hot', 'extra_hot']).optional(),
    allergens: z.array(z.string().trim().max(40)).max(15).optional(),
    isAvailable: z.boolean().optional(),
    prepTimeMins: z.number().int().min(1).max(180).optional(),
    variants: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(60),
            priceDeltaPaise: z.number().int().min(-500000).max(500000),
            isDefault: z.boolean().optional(),
          })
          .strict()
      )
      .max(10)
      .optional(),
  })
  .strict();

export const updateMenuItemSchema = createMenuItemSchema.omit({ variants: true }).partial().strict();

export const createDealSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(255).optional(),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional()
      .nullable(),
    discountType: z.enum(['percent', 'flat_paise']),
    discountValue: z.number().int().positive(),
    minOrderPaise: z.number().int().min(0).max(10000000).optional(),
    applicableCategoryId: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateDealSchema = createDealSchema.partial().strict();

export const createTableSchema = z
  .object({
    tableNumber: z.string().trim().min(1).max(20),
    label: z.string().trim().min(1).max(80),
    capacity: z.number().int().min(1).max(24).optional(),
    zone: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

export const updateTableSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    capacity: z.number().int().min(1).max(24).optional(),
    zone: z.string().trim().min(1).max(60).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const createStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(190),
    password: z.string().min(10).max(128),
    role: z.enum(['owner', 'manager', 'waiter', 'chef']),
  })
  .strict();

export const updateStaffSchema = z
  .object({
    role: z.enum(['owner', 'manager', 'waiter', 'chef']).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

