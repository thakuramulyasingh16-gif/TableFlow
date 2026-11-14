import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth, withStaffAuth } from '@/lib/auth-guard';
import { generateOpaqueToken } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { generateTableQrAssets } from '@/lib/qr';
import { sanitizeUserText } from '@/lib/sanitize';
import { createTableSchema, parseJsonBody } from '@/lib/validators';

export async function GET() {
  try {
    await requireStaffAuth(['owner', 'manager']);
    const tables = await prisma.table.findMany({ orderBy: { id: 'asc' } });
    const withQr = await Promise.all(
      tables.map(async (t) => {
        const qr = await generateTableQrAssets(t.qrToken);
        return {
          ...t,
          qrUrl: qr.url,
          qrDataUrl: qr.dataUrl,
          qrSvg: qr.svg,
        };
      })
    );
    return NextResponse.json({ tables: withQr });
  } catch (err) {
    return handleApiError(err);
  }
}

export const POST = withStaffAuth(['owner', 'manager'], async (req) => {
  const body = await parseJsonBody(req, createTableSchema);

  const table = await prisma.table.create({
    data: {
      tableNumber: sanitizeUserText(body.tableNumber, 20),
      label: sanitizeUserText(body.label, 80),
      capacity: body.capacity ?? 4,
      zone: body.zone ? sanitizeUserText(body.zone, 60) : 'Main Hall',
      qrToken: generateOpaqueToken(32),
      status: 'free',
      isActive: true,
    },
  });
  const qr = await generateTableQrAssets(table.qrToken);
  return NextResponse.json({ table, qr }, { status: 201 });
});

