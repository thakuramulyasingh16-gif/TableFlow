import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { requireGuestSession } from '@/lib/guest-session';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { resolvePaymentProvider } from '@/lib/payment-provider';
import { createPaymentOrderSchema, parseJsonBody } from '@/lib/validators';

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session, table } = await requireGuestSession();
    await enforceRateLimit('payment', `${getClientIp(req)}:${session.id}`);
    const body = await parseJsonBody(req, createPaymentOrderSchema);

    const provider = await resolvePaymentProvider();
    const data = await provider.createOrder({
      tableSessionId: session.id,
      tableId: table.id,
      tableNumber: table.tableNumber,
      billSplitId: body.billSplitId ?? null,
      tipPaise: body.tipPaise ?? 0,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
