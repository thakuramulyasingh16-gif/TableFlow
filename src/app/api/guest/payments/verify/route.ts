import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { requireGuestSession } from '@/lib/guest-session';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyAndCapturePayment } from '@/lib/razorpay';
import { parseJsonBody, verifyPaymentSchema } from '@/lib/validators';

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session } = await requireGuestSession();
    await enforceRateLimit('payment', `${getClientIp(req)}:${session.id}`);
    const body = await parseJsonBody(req, verifyPaymentSchema);

    const result = await verifyAndCapturePayment({
      tableSessionId: session.id,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
      method: body.method,
    });

    return NextResponse.json({
      verified: true,
      payment: result.payment,
      sessionClosed: result.sessionClosed,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

