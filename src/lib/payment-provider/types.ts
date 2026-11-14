export interface CreatePaymentOrderOptions {
  tableSessionId: number;
  tableId: number;
  tableNumber: string;
  billSplitId?: number | null;
  tipPaise?: number;
}

export interface RazorpayOrderResult {
  provider: 'razorpay';
  paymentId: number;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  isMock: boolean;
}

export interface UpiQrOrderResult {
  provider: 'upi_qr';
  paymentId: number;
  orderRef: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  upiId: string;
  upiUri: string;
  qrDataUrl: string;
  restaurantName: string;
}

export type PaymentOrderResult = RazorpayOrderResult | UpiQrOrderResult;

export interface PaymentProvider {
  readonly name: 'razorpay' | 'upi_qr';
  createOrder(options: CreatePaymentOrderOptions): Promise<PaymentOrderResult>;
}
