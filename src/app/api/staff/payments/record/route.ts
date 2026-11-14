import { NextResponse } from 'next/server';
import { withStaffAuth } from '@/lib/auth-guard';
import { recordCounterPayment } from '@/lib/counter-payment';
import { parseJsonBody, recordCounterPaymentSchema } from '@/lib/validators';

export const POST = withStaffAuth(['waiter', 'manager', 'owner'], async (req, { actor }) => {
  const body = await parseJsonBody(req, recordCounterPaymentSchema);

  const result = await recordCounterPayment({
    tableSessionId: body.tableSessionId,
    amountPaise: body.amountPaise,
    method: body.method,
    paymentReference: body.paymentReference,
    tipPaise: body.tipPaise,
    actorUserId: actor.id,
    actorRole: actor.role,
  });

  return NextResponse.json(result, { status: 201 });
});
