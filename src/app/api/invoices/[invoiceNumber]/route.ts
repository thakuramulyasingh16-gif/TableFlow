import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  try {
    const { invoiceNumber } = await params;
    const decodedNumber = decodeURIComponent(invoiceNumber);

    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { invoiceNumber: decodedNumber },
          { invoiceNumber: decodedNumber.replace(/-/g, '/') },
        ],
      },
      include: {
        table: { select: { id: true, tableNumber: true, label: true, zone: true } },
        tableSession: {
          include: {
            orders: {
              where: { status: { in: ['confirmed', 'preparing', 'ready', 'served'] } },
              include: { items: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new AppError(404, 'Tax invoice not found.', 'INVOICE_NOT_FOUND');
    }

    return NextResponse.json({ invoice });
  } catch (err) {
    return handleApiError(err);
  }
}
