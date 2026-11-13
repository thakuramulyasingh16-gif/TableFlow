import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { processRazorpayWebhook } from '@/lib/razorpay';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const eventIdHeader = req.headers.get('x-razorpay-event-id') || undefined;

    const result = await processRazorpayWebhook({
      rawBody,
      signature,
      eventIdHeader,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

