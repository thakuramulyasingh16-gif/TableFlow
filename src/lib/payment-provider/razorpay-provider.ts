import { createRazorpayOrderForSession } from '../razorpay';
import { CreatePaymentOrderOptions, PaymentProvider, RazorpayOrderResult } from './types';

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;

  async createOrder(options: CreatePaymentOrderOptions): Promise<RazorpayOrderResult> {
    const result = await createRazorpayOrderForSession({
      tableSessionId: options.tableSessionId,
      tableId: options.tableId,
      tableNumber: options.tableNumber,
      billSplitId: options.billSplitId ?? null,
      tipPaise: options.tipPaise ?? 0,
    });

    return {
      provider: 'razorpay',
      ...result,
    };
  }
}
