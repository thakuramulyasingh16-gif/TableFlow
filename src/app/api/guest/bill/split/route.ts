import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { requireGuestSession } from '@/lib/guest-session';
import { createBillSplits } from '@/lib/razorpay';
import { billSplitSchema, parseJsonBody } from '@/lib/validators';

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session } = await requireGuestSession();
    const body = await parseJsonBody(req, billSplitSchema);
    const splits = await createBillSplits({
      tableSessionId: session.id,
      splitType: body.splitType,
      parts: body.parts,
      itemIds: body.itemIds,
    });
    return NextResponse.json({ splits }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
