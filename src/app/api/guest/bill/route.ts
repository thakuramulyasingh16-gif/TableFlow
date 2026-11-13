import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireGuestSession } from '@/lib/guest-session';
import { computeSessionBillSummary } from '@/lib/razorpay';

export async function GET() {
  try {
    const { session, table } = await requireGuestSession({ allowPaid: true });
    const summary = await computeSessionBillSummary(session.id);
    return NextResponse.json({
      table: { id: table.id, tableNumber: table.tableNumber, label: table.label },
      sessionStatus: session.status,
      ...summary,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

