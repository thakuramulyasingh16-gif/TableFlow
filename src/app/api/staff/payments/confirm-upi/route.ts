import { NextResponse } from 'next/server';
import { withStaffAuth } from '@/lib/auth-guard';
import { confirmUpiPayment } from '@/lib/counter-payment';
import { confirmUpiPaymentSchema, parseJsonBody } from '@/lib/validators';

export const POST = withStaffAuth(['waiter', 'manager', 'owner'], async (req, { actor }) => {
  const body = await parseJsonBody(req, confirmUpiPaymentSchema);

  const result = await confirmUpiPayment({
    paymentId: body.paymentId,
    transactionReference: body.transactionReference,
    actorUserId: actor.id,
    actorRole: actor.role,
  });

  return NextResponse.json(result, { status: 200 });
});
