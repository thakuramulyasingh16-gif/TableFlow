import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { sendGstEmailReceipt } from '@/lib/email';
import { requireGuestSession } from '@/lib/guest-session';
import { parseJsonBody, sendReceiptSchema } from '@/lib/validators';

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session, table } = await requireGuestSession({ allowPaid: true });
    const body = await parseJsonBody(req, sendReceiptSchema);

    const result = await sendGstEmailReceipt({
      tableSessionId: session.id,
      tableLabel: table.label,
      tableNumber: table.tableNumber,
      email: body.email,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
