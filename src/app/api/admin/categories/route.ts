import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { sanitizeUserText } from '@/lib/sanitize';
import { createCategorySchema, parseJsonBody } from '@/lib/validators';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireStaffAuth(['owner', 'manager']);
    const body = await parseJsonBody(req, createCategorySchema);

    const category = await prisma.category.create({
      data: {
        name: sanitizeUserText(body.name, 80),
        slug: body.slug || toSlug(body.name),
        description: body.description ? sanitizeUserText(body.description, 255) : null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      },
    });

    await recordAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'CATEGORY_CREATED',
      entityType: 'category',
      entityId: category.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
