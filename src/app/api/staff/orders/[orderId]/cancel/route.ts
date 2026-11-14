import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { withStaffAuth } from '@/lib/auth-guard';
import { cancelStaffOrder } from '@/lib/orders';
import { parseJsonBody } from '@/lib/validators';
import { z } from 'zod';

const cancelOrderSchema = z
  .object({
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

export const POST = withStaffAuth<{ orderId: string }>(
  ['waiter', 'manager', 'owner'],
  async (req, { params, actor }) => {
    const { orderId } = await params;
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'Invalid order ID.', 'VALIDATION_ERROR');
    }

    let reason: string | undefined;
    try {
      const body = await parseJsonBody(req, cancelOrderSchema);
      reason = body.reason;
    } catch {
      // Body is optional
    }

    const order = await cancelStaffOrder({
      orderId: id,
      actorUserId: actor.id,
      actorRole: actor.role,
      reason,
    });

    return NextResponse.json({ success: true, order });
  }
);
