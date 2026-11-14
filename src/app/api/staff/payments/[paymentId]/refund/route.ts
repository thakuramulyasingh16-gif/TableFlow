import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { withStaffAuth } from '@/lib/auth-guard';
import { refundCapturedPayment } from '@/lib/razorpay';
import { parseJsonBody } from '@/lib/validators';
import { z } from 'zod';

const refundPaymentSchema = z
  .object({
    amountPaise: z.number().int().positive().optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

export const POST = withStaffAuth<{ paymentId: string }>(
  ['manager', 'owner'],
  async (req, { params, actor }) => {
    const { paymentId } = await params;
    const id = Number(paymentId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'Invalid payment ID.', 'VALIDATION_ERROR');
    }

    let amountPaise: number | undefined;
    let reason: string | undefined;

    try {
      const body = await parseJsonBody(req, refundPaymentSchema);
      amountPaise = body.amountPaise;
      reason = body.reason;
    } catch {
      // Body is optional
    }

    const payment = await refundCapturedPayment({
      paymentId: id,
      amountPaise,
      reason,
      actorUserId: actor.id,
      actorRole: actor.role,
    });

    return NextResponse.json({ success: true, payment });
  }
);
