import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { requireGuestSession } from '@/lib/guest-session';
import { prisma } from '@/lib/prisma';
import { sanitizeUserText } from '@/lib/sanitize';
import { createReviewSchema, parseJsonBody } from '@/lib/validators';

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session, table } = await requireGuestSession({ allowPaid: true });
    const body = await parseJsonBody(req, createReviewSchema);

    const paidCount = await prisma.payment.count({
      where: { tableSessionId: session.id, status: 'captured' },
    });
    if (paidCount === 0) {
      throw new AppError(400, 'Please complete payment before reviewing.', 'PAYMENT_REQUIRED_FOR_REVIEW');
    }

    const existing = await prisma.review.findUnique({ where: { tableSessionId: session.id } });
    if (existing) {
      throw new AppError(409, 'Review already submitted for this visit.', 'REVIEW_EXISTS');
    }

    const review = await prisma.review.create({
      data: {
        tableSessionId: session.id,
        tableId: table.id,
        rating: body.rating,
        comment: body.comment ? sanitizeUserText(body.comment, 500) : null,
      },
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
