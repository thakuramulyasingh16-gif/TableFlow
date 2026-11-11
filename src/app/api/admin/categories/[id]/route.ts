import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { sanitizeUserText } from '@/lib/sanitize';
import { parseJsonBody, updateCategorySchema } from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffAuth(['owner', 'manager']);
    const { id } = await context.params;
    const catId = Number(id);
    if (!Number.isInteger(catId) || catId <= 0) {
      throw new AppError(400, 'Invalid category ID.', 'VALIDATION_ERROR');
    }

    const body = await parseJsonBody(req, updateCategorySchema);
    const category = await prisma.category.update({
      where: { id: catId },
      data: {
        ...(body.name !== undefined ? { name: sanitizeUserText(body.name, 80) } : {}),
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.description !== undefined ? { description: sanitizeUserText(body.description, 255) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    return NextResponse.json({ category });
  } catch (err) {
    return handleApiError(err);
  }
}
