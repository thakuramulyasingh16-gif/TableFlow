import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { deleteGuestEmailPii } from '@/lib/email';
import { requireGuestSession } from '@/lib/guest-session';

export async function DELETE(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session } = await requireGuestSession({ allowPaid: true });
    const result = await deleteGuestEmailPii(session.id);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

