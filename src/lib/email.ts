import { Resend } from 'resend';
import { AppError } from './api-error';
import { getEnv } from './env';
import { prisma } from './prisma';
import { computeSessionBillSummary } from './razorpay';
import { escapeHtml } from './sanitize';

function formatInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export async function sendGstEmailReceipt({
  tableSessionId,
  tableLabel,
  tableNumber,
  email,
}: {
  tableSessionId: number;
  tableLabel: string;
  tableNumber: string;
  email: string;
}): Promise<{ sent: boolean; id?: string; mode: 'resend' | 'dev_log' }> {
  const env = getEnv();
  const summary = await computeSessionBillSummary(tableSessionId);

  const captured = summary.payments.filter((p) => p.status === 'captured');
  if (captured.length === 0) {
    throw new AppError(400, 'Receipt can only be sent after payment is completed.', 'NO_CAPTURED_PAYMENT');
  }

  const totalTip = captured.reduce((acc, p) => acc + p.tipPaise, 0);
  const grandTotal = summary.ordersTotalPaise + totalTip;

  const itemRowsHtml = summary.orders
    .flatMap((o) => o.items)
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.itemNameSnapshot)}${
          it.variantNameSnapshot ? ` (${escapeHtml(it.variantNameSnapshot)})` : ''
        } x ${it.quantity}</td><td style="text-align:right">${formatInr(it.lineTotalPaise)}</td></tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:8px;">
      <h2 style="margin:0 0 8px;">TableFlow Tax Invoice</h2>
      <p style="color:#6b7280;margin:0 0 16px;">Table: ${escapeHtml(tableLabel)} (${escapeHtml(tableNumber)}) | Date: ${new Date().toISOString().slice(0, 10)}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${itemRowsHtml}</table>
      <hr style="border:none;border-top:1px solid #e5e7eb;" />
      <table style="width:100%;margin-top:12px;">
        <tr><td>Subtotal</td><td style="text-align:right">${formatInr(summary.subtotalPaise)}</td></tr>
        <tr><td>Discount</td><td style="text-align:right">-${formatInr(summary.discountPaise)}</td></tr>
        <tr><td>CGST (${(env.CGST_BPS / 100).toFixed(2)}%)</td><td style="text-align:right">${formatInr(summary.cgstPaise)}</td></tr>
        <tr><td>SGST (${(env.SGST_BPS / 100).toFixed(2)}%)</td><td style="text-align:right">${formatInr(summary.sgstPaise)}</td></tr>
        <tr><td>Tip</td><td style="text-align:right">${formatInr(totalTip)}</td></tr>
        <tr><td><strong>Grand Total Paid</strong></td><td style="text-align:right"><strong>${formatInr(grandTotal)}</strong></td></tr>
      </table>
      <p style="font-size:12px;color:#6b7280;margin-top:16px;">Thank you for dining with TableFlow.</p>
    </div>
  `;

  let emailId: string | undefined;
  let mode: 'resend' | 'dev_log' = 'dev_log';

  if (env.RESEND_API_KEY) {
    const resend = new Resend(env.RESEND_API_KEY);
    const resp = await resend.emails.send({
      from: env.RESEND_FROM,
      to: email,
      subject: `Your TableFlow GST Receipt — ${tableLabel}`,
      html,
    });
    if (resp.error) {
      throw new AppError(502, 'Failed to dispatch receipt email.', 'EMAIL_SEND_FAILED');
    }
    emailId = resp.data?.id;
    mode = 'resend';
  } else {
    console.info('[TableFlow Dev Receipt]', { to: email, tableLabel, grandTotalPaise: grandTotal });
  }

  await prisma.$transaction([
    prisma.tableSession.update({
      where: { id: tableSessionId },
      data: { guestEmail: email },
    }),
    prisma.payment.updateMany({
      where: { tableSessionId, status: 'captured' },
      data: { receiptEmail: email, receiptSentAt: new Date() },
    }),
  ]);

  return { sent: true, id: emailId, mode };
}

export async function deleteGuestEmailPii(tableSessionId: number): Promise<{ deleted: true }> {
  await prisma.$transaction([
    prisma.tableSession.update({
      where: { id: tableSessionId },
      data: { guestEmail: null },
    }),
    prisma.payment.updateMany({
      where: { tableSessionId },
      data: { receiptEmail: null },
    }),
  ]);
  return { deleted: true };
}
