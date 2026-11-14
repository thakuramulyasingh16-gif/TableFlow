import { getRestaurantSettings } from '../settings';
import { PaymentProvider } from './types';
import { RazorpayProvider } from './razorpay-provider';
import { UpiQrProvider } from './upi-qr-provider';

export function getPaymentProvider(providerName?: string): PaymentProvider {
  if (providerName === 'upi_qr') {
    return new UpiQrProvider();
  }
  return new RazorpayProvider();
}

export async function resolvePaymentProvider(): Promise<PaymentProvider> {
  const settings = await getRestaurantSettings();
  return getPaymentProvider(settings.paymentProvider);
}

export * from './types';
export { RazorpayProvider } from './razorpay-provider';
export { UpiQrProvider, buildUpiPaymentUri } from './upi-qr-provider';
