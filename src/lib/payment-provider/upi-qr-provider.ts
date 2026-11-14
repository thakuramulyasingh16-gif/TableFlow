import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { prisma } from '../prisma';
import { AppError } from '../api-error';
import { computeSessionBillSummary } from '../razorpay';
import { getRestaurantSettings } from '../settings';
import { broadcastRealtime, getRoleRealtimeChannel } from '../realtime';
import { CreatePaymentOrderOptions, PaymentProvider, UpiQrOrderResult } from './types';

export function buildUpiPaymentUri(params: {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  tableNumber: string;
  orderRef: string;
}): string {
  const amountRupees = (params.amountPaise / 100).toFixed(2);
  const note = `Bill Table ${params.tableNumber} Ref ${params.orderRef}`;
  const search = new URLSearchParams({
    pa: params.upiId,
    pn: params.payeeName,
    am: amountRupees,
    cu: 'INR',
    tn: note,
    tr: params.orderRef,
  });
  return `upi://pay?${search.toString()}`;
}

export class UpiQrProvider implements PaymentProvider {
  readonly name = 'upi_qr' as const;

  async createOrder(options: CreatePaymentOrderOptions): Promise<UpiQrOrderResult> {
    const { tableSessionId, billSplitId, tipPaise = 0, tableNumber } = options;
    const splitId = billSplitId ?? null;

    const session = await prisma.tableSession.findUnique({
      where: { id: tableSessionId },
      include: { table: true },
    });
    if (!session || session.status !== 'active') {
      throw new AppError(400, 'Active table session required for payment.', 'INVALID_SESSION');
    }

    const summary = await computeSessionBillSummary(tableSessionId);
    if (summary.remainingPaise <= 0) {
      throw new AppError(400, 'Bill is already fully paid.', 'ALREADY_PAID');
    }

    let partPayable = summary.remainingPaise;
    if (splitId) {
      const split = await prisma.billSplit.findFirst({
        where: { id: splitId, tableSessionId },
      });
      if (!split || split.status !== 'pending') {
        throw new AppError(400, 'Invalid or already paid split share.', 'INVALID_SPLIT');
      }
      partPayable = split.amountPaise;
    }

    const safeTip = Math.max(0, Math.min(500000, Math.round(tipPaise || 0)));
    const totalPayable = partPayable + safeTip;

    // 1. Mark stale created payments (> 15 min) as failed
    await prisma.payment.updateMany({
      where: {
        tableSessionId,
        status: 'created',
        createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      },
      data: { status: 'failed' },
    });

    // 2. Reuse open created payment for same session & split if amount matches
    const existingPayment = await prisma.payment.findFirst({
      where: {
        tableSessionId,
        billSplitId: splitId,
        status: 'created',
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });

    let paymentRecord;
    if (existingPayment) {
      if (existingPayment.amountPaise === totalPayable) {
        paymentRecord = existingPayment;
      } else {
        await prisma.payment.update({
          where: { id: existingPayment.id },
          data: { status: 'failed' },
        });
      }
    }

    if (!paymentRecord) {
      // 3. Reject duplicate order creation if another payment is already pending
      const pendingOther = await prisma.payment.findFirst({
        where: {
          tableSessionId,
          billSplitId: { not: splitId },
          status: 'created',
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
      });
      if (pendingOther) {
        throw new AppError(409, 'Another payment order is currently pending for this session.', 'PAYMENT_PENDING');
      }

      const orderRef = `UPI-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      paymentRecord = await prisma.payment.create({
        data: {
          tableSessionId,
          billSplitId: splitId,
          razorpayOrderId: orderRef,
          amountPaise: totalPayable,
          tipPaise: safeTip,
          currency: 'INR',
          method: 'upi_qr',
          status: 'created',
        },
      });
    }

    const settings = await getRestaurantSettings();
    const upiId = settings.upiId || 'tableflow@okaxis';
    const payeeName = settings.restaurantName || 'TableFlow Bistro';

    const upiUri = buildUpiPaymentUri({
      upiId,
      payeeName,
      amountPaise: totalPayable,
      tableNumber,
      orderRef: paymentRecord.razorpayOrderId,
    });

    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#111827', light: '#FFFFFF' },
    });

    await broadcastRealtime(getRoleRealtimeChannel('staff'), 'payment:created', {
      paymentId: paymentRecord.id,
      tableNumber,
      amountPaise: totalPayable,
      method: 'upi_qr',
    });

    return {
      provider: 'upi_qr',
      paymentId: paymentRecord.id,
      orderRef: paymentRecord.razorpayOrderId,
      razorpayOrderId: paymentRecord.razorpayOrderId,
      amountPaise: totalPayable,
      currency: 'INR',
      upiId,
      upiUri,
      qrDataUrl,
      restaurantName: payeeName,
    };
  }
}
