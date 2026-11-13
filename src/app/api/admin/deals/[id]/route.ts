import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { sanitizeUserText } from '@/lib/sanitize';
import { parseJsonBody, updateDealSchema } from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffAuth(['owner', 'manager']);
    const { id } = await context.params;
    const dealId = Number(id);
    if (!Number.isInteger(dealId) || dealId <= 0) {
      throw new AppError(400, 'Invalid deal ID.', 'VALIDATION_ERROR');
    }

    const body = await parseJsonBody(req, updateDealSchema);
    const deal = await prisma.deal.update({
      where: { id: dealId },
      data: {
        ...(body.title !== undefined ? { title: sanitizeUserText(body.title, 120) } : {}),
        ...(body.description !== undefined ? { description: sanitizeUserText(body.description, 255) } : {}),
        ...(body.code !== undefined ? { code: body.code ? body.code.toUpperCase() : null } : {}),
        ...(body.discountType !== undefined ? { discountType: body.discountType } : {}),
        ...(body.discountValue !== undefined ? { discountValue: body.discountValue } : {}),
        ...(body.minOrderPaise !== undefined ? { minOrderPaise: body.minOrderPaise } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    return NextResponse.json({ deal });
  } catch (err) {
    return handleApiError(err);
  }
}

