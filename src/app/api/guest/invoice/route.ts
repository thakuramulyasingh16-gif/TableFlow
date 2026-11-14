import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireGuestSession } from '@/lib/guest-session';
import { generateGapFreeGstInvoice } from '@/lib/invoice';

export async function GET() {
  try {
    const { session } = await requireGuestSession({ allowPaid: true });
    const invoice = await generateGapFreeGstInvoice(session.id);
    return NextResponse.json({ invoice });
  } catch (err) {
    return handleApiError(err);
  }
}
