import { NextResponse } from 'next/server';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { sanitizeUserText } from '@/lib/sanitize';
import { createDealSchema, parseJsonBody } from '@/lib/validators';

export const POST = withStaffAuth(['owner', 'manager'], async (req) => {
  const body = await parseJsonBody(req, createDealSchema);

  const deal = await prisma.deal.create({
    data: {
      title: sanitizeUserText(body.title, 120),
      description: body.description ? sanitizeUserText(body.description, 255) : null,
      code: body.code ? body.code.toUpperCase() : null,
      discountType: body.discountType,
      discountValue: body.discountValue,
      minOrderPaise: body.minOrderPaise ?? 0,
      applicableCategoryId: body.applicableCategoryId ?? null,
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json({ deal }, { status: 201 });
});

