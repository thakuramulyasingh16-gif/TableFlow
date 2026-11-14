import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { sanitizeUserText } from '@/lib/sanitize';
import { parseJsonBody, updateTableSchema } from '@/lib/validators';

export const PATCH = withStaffAuth<{ id: string }>(['owner', 'manager'], async (req, { params }) => {
  const { id } = await params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId) || tableId <= 0) {
    throw new AppError(400, 'Invalid table ID.', 'VALIDATION_ERROR');
  }

  const body = await parseJsonBody(req, updateTableSchema);
  const table = await prisma.table.update({
    where: { id: tableId },
    data: {
      ...(body.label !== undefined ? { label: sanitizeUserText(body.label, 80) } : {}),
      ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      ...(body.zone !== undefined ? { zone: sanitizeUserText(body.zone, 60) } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  return NextResponse.json({ table });
});

