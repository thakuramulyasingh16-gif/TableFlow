import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireStaffAuth(['owner']);
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const serialized = logs.map((l) => ({ ...l, id: l.id.toString() }));
    return NextResponse.json({ logs: serialized });
  } catch (err) {
    return handleApiError(err);
  }
}

