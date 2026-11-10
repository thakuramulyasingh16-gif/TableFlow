import { z } from 'zod';

export const idParamSchema = {
  params: z.object({ id: z.coerce.number().int().positive() }).strict(),
};

export const createCategorySchema = {
  body: z
    .object({
      name: z.string().trim().min(2).max(80),
      slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
      description: z.string().trim().max(255).optional(),
      sortOrder: z.number().int().min(0).max(999).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
};

export const updateCategorySchema = {
  params: idParamSchema.params,
  body: createCategorySchema.body.partial().strict(),
};

export const createMenuItemSchema = {
  body: z
    .object({
      categoryId: z.number().int().positive(),
      stationId: z.number().int().positive(),
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().max(1000).optional(),
      imageUrl: z.string().trim().max(500).optional().nullable(),
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
    .strict(),
};

export const updateMenuItemSchema = {
  params: idParamSchema.params,
  body: createMenuItemSchema.body.omit({ variants: true }).partial().strict(),
};

export const createDealSchema = {
  body: z
    .object({
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().max(255).optional(),
      code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).optional().nullable(),
      discountType: z.enum(['percent', 'flat_paise']),
      discountValue: z.number().int().positive(),
      minOrderPaise: z.number().int().min(0).max(10000000).optional(),
      applicableCategoryId: z.number().int().positive().nullable().optional(),
      startsAt: z.string().datetime().nullable().optional(),
      endsAt: z.string().datetime().nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
};

export const updateDealSchema = {
  params: idParamSchema.params,
  body: createDealSchema.body.partial().strict(),
};

export const createTableSchema = {
  body: z
    .object({
      tableNumber: z.string().trim().min(1).max(20),
      label: z.string().trim().min(1).max(80),
      capacity: z.number().int().min(1).max(24).optional(),
      zone: z.string().trim().min(1).max(60).optional(),
    })
    .strict(),
};

export const updateTableSchema = {
  params: idParamSchema.params,
  body: z
    .object({
      label: z.string().trim().min(1).max(80).optional(),
      capacity: z.number().int().min(1).max(24).optional(),
      zone: z.string().trim().min(1).max(60).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
};

export const createStaffSchema = {
  body: z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(190),
      password: z.string().min(10).max(128),
      role: z.enum(['owner', 'manager', 'waiter', 'chef']),
    })
    .strict(),
};

export const updateStaffSchema = {
  params: idParamSchema.params,
  body: z
    .object({
      role: z.enum(['owner', 'manager', 'waiter', 'chef']).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
};
