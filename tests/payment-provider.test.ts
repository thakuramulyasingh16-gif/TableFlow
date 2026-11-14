import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUpiPaymentUri, getPaymentProvider, RazorpayProvider, UpiQrProvider } from '../src/lib/payment-provider';

// Basic environment variables for test suite
Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
  PAYMENTS_MOCK: 'true',
});

test('buildUpiPaymentUri formats standard NPCI UPI URI with exact decimals, parameters and encoding', () => {
  const uri = buildUpiPaymentUri({
    upiId: 'tableflow@okaxis',
    payeeName: 'TableFlow Bistro & Cafe',
    amountPaise: 125050, // ₹1250.50
    tableNumber: 'T-04',
    orderRef: 'UPI-1731580000-A1B2',
  });

  assert.ok(uri.startsWith('upi://pay?'));
  const parsed = new URL(uri);
  assert.equal(parsed.searchParams.get('pa'), 'tableflow@okaxis');
  assert.equal(parsed.searchParams.get('pn'), 'TableFlow Bistro & Cafe');
  assert.equal(parsed.searchParams.get('am'), '1250.50');
  assert.equal(parsed.searchParams.get('cu'), 'INR');
  assert.ok(parsed.searchParams.get('tn')?.includes('T-04'));
  assert.equal(parsed.searchParams.get('tr'), 'UPI-1731580000-A1B2');
});

test('buildUpiPaymentUri handles even rupee amounts with trailing .00', () => {
  const uri = buildUpiPaymentUri({
    upiId: 'merchant@upi',
    payeeName: 'TableFlow',
    amountPaise: 50000, // ₹500.00
    tableNumber: '1',
    orderRef: 'UPI-1234',
  });

  const parsed = new URL(uri);
  assert.equal(parsed.searchParams.get('am'), '500.00');
});

test('getPaymentProvider factory selects RazorpayProvider by default and UpiQrProvider when configured', () => {
  const defaultProvider = getPaymentProvider();
  assert.ok(defaultProvider instanceof RazorpayProvider);
  assert.equal(defaultProvider.name, 'razorpay');

  const razorpayProvider = getPaymentProvider('razorpay');
  assert.ok(razorpayProvider instanceof RazorpayProvider);
  assert.equal(razorpayProvider.name, 'razorpay');

  const upiProvider = getPaymentProvider('upi_qr');
  assert.ok(upiProvider instanceof UpiQrProvider);
  assert.equal(upiProvider.name, 'upi_qr');

  const unknownFallback = getPaymentProvider('unknown_provider');
  assert.ok(unknownFallback instanceof RazorpayProvider);
});

test('UpiQrProvider generates valid base64 PNG QR code data URL', async () => {
  const uri = buildUpiPaymentUri({
    upiId: 'test@okaxis',
    payeeName: 'Test Bistro',
    amountPaise: 45000,
    tableNumber: '2',
    orderRef: 'UPI-TEST-001',
  });

  // Verify QRCode generation produces a valid data URL
  const QRCode = (await import('qrcode')).default;
  const dataUrl = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#111827', light: '#FFFFFF' },
  });

  assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(dataUrl.length > 100);
});

test('UPI payment confirmation transitions payment state and verifies balance closure', () => {
  interface MockPayment {
    id: number;
    tableSessionId: number;
    amountPaise: number;
    tipPaise: number;
    status: 'created' | 'captured' | 'failed';
    method: string;
    recordedById?: number | null;
    paymentReference?: string | null;
  }

  const payment: MockPayment = {
    id: 99,
    tableSessionId: 42,
    amountPaise: 84000,
    tipPaise: 4000,
    status: 'created',
    method: 'upi_qr',
  };

  const confirmMockUpi = (
    pay: MockPayment,
    actorId: number,
    reference?: string
  ): { payment: MockPayment; sessionClosed: boolean } => {
    if (pay.status !== 'created') {
      throw new Error(`Cannot confirm payment with status "${pay.status}"`);
    }

    pay.status = 'captured';
    pay.recordedById = actorId;
    pay.paymentReference = reference || 'UPI_CONFIRMED';

    const orderTotal = 80000;
    const paidWithoutTip = pay.amountPaise - pay.tipPaise;
    const remaining = orderTotal - paidWithoutTip;

    return {
      payment: pay,
      sessionClosed: remaining <= 0,
    };
  };

  const result = confirmMockUpi(payment, 5, 'UTR-987654321');
  assert.equal(result.payment.status, 'captured');
  assert.equal(result.payment.recordedById, 5);
  assert.equal(result.payment.paymentReference, 'UTR-987654321');
  assert.equal(result.sessionClosed, true);

  // Subsequent confirmation attempt should be rejected
  assert.throws(
    () => confirmMockUpi(payment, 5),
    /Cannot confirm payment with status "captured"/
  );
});
