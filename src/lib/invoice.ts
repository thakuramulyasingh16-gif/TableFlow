import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AppError } from './api-error';
import { computeSessionBillSummary } from './razorpay';
import { getRestaurantSettings } from './settings';

/**
 * Calculates Indian Financial Year string (e.g. "2026-27") for any given date.
 * Financial Year in India runs from April 1st to March 31st.
 */
export function getIndianFinancialYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 2 = Mar, 3 = Apr

  let fyStartYear: number;
  let fyEndYear: number;

  if (month >= 3) {
    // April to December
    fyStartYear = year;
    fyEndYear = year + 1;
  } else {
    // January to March
    fyStartYear = year - 1;
    fyEndYear = year;
  }

  const shortEndYear = String(fyEndYear % 100).padStart(2, '0');
  return `${fyStartYear}-${shortEndYear}`;
}

export interface GenerateInvoiceOptions {
  customerEmail?: string;
  customerPhone?: string;
  customerGstin?: string;
}

export const invoiceInclude = Prisma.validator<Prisma.InvoiceInclude>()({
  table: { select: { id: true, tableNumber: true, label: true } },
  tableSession: {
    include: {
      orders: {
        where: {
          status: {
            in: [OrderStatus.confirmed, OrderStatus.preparing, OrderStatus.ready, OrderStatus.served],
          },
        },
        include: { items: true },
      },
    },
  },
});

export type GstInvoiceWithDetails = Prisma.InvoiceGetPayload<{
  include: typeof invoiceInclude;
}>;

/**
 * Generates an India GST compliant, gap-free sequential invoice for a paid table session.
 * Uses atomic DB sequence within a transaction to guarantee uniqueness and sequentiality per financial year.
 */
export async function generateGapFreeGstInvoice(
  tableSessionId: number,
  options?: GenerateInvoiceOptions
): Promise<GstInvoiceWithDetails> {
  // Check if invoice already exists for this table session
  const existing = await prisma.invoice.findUnique({
    where: { tableSessionId },
    include: invoiceInclude,
  });

  if (existing) {
    return existing;
  }

  const summary = await computeSessionBillSummary(tableSessionId);
  const capturedPayments = summary.payments.filter((p) => p.status === 'captured');

  if (capturedPayments.length === 0) {
    throw new AppError(400, 'Tax invoice can only be generated for paid table sessions.', 'PAYMENT_REQUIRED');
  }

  const settings = await getRestaurantSettings();
  const fy = getIndianFinancialYear(new Date());
  const totalTip = capturedPayments.reduce((acc, p) => acc + p.tipPaise, 0);
  const grandTotal = summary.ordersTotalPaise + totalTip;

  // Atomically increment the sequence and create invoice inside transaction
  const created = await prisma.$transaction(async (tx) => {
    // Check concurrency inside transaction
    const concurrent = await tx.invoice.findUnique({
      where: { tableSessionId },
      include: invoiceInclude,
    });
    if (concurrent) {
      return concurrent;
    }

    // Atomic gap-free sequence increment for this financial year
    const seq = await tx.invoiceSequence.upsert({
      where: { financialYear: fy },
      update: { lastNumber: { increment: 1 } },
      create: { financialYear: fy, lastNumber: 1 },
    });

    const sequenceNumber = seq.lastNumber;
    const invoiceNumber = `INV/${fy}/${String(sequenceNumber).padStart(5, '0')}`;

    const session = await tx.tableSession.findUniqueOrThrow({
      where: { id: tableSessionId },
    });

    return tx.invoice.create({
      data: {
        invoiceNumber,
        financialYear: fy,
        sequenceNumber,
        tableSessionId,
        tableId: session.tableId,
        subtotalPaise: summary.subtotalPaise,
        discountPaise: summary.discountPaise,
        cgstPaise: summary.cgstPaise,
        sgstPaise: summary.sgstPaise,
        cgstBps: settings.cgstBps,
        sgstBps: settings.sgstBps,
        tipPaise: totalTip,
        totalPaise: grandTotal,
        legalName: settings.legalName,
        tradeName: settings.restaurantName,
        gstin: settings.gstin,
        fssaiNumber: settings.fssaiNumber,
        address: settings.address,
        stateCode: settings.stateCode,
        stateName: settings.stateName,
        hsnSacCode: settings.hsnSacCode,
        customerEmail: options?.customerEmail || session.guestEmail || null,
        customerPhone: options?.customerPhone || null,
        customerGstin: options?.customerGstin || null,
      },
      include: invoiceInclude,
    });
  });

  return created;
}
