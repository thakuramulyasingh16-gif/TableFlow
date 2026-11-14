import { Resend } from 'resend';
import { AppError } from './api-error';
import { getEnv } from './env';
import { prisma } from './prisma';
import { escapeHtml } from './sanitize';
import { generateGapFreeGstInvoice } from './invoice';

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
}): Promise<{ sent: boolean; id?: string; mode: 'resend' | 'dev_log'; invoiceNumber?: string }> {
  const env = getEnv();

  // Ensure gap-free GST tax invoice is generated atomically
  const invoice = await generateGapFreeGstInvoice(tableSessionId, {
    customerEmail: email,
  });

  const orders = invoice.tableSession?.orders || [];
  const itemRowsHtml = orders
    .flatMap((o) => o.items)
    .map(
      (it) =>
        `<tr>
          <td style="padding:6px 0;">${escapeHtml(it.itemNameSnapshot)}${
          it.variantNameSnapshot ? ` (${escapeHtml(it.variantNameSnapshot)})` : ''
        } x ${it.quantity}<br><small style="color:#6b7280;">SAC: ${escapeHtml(invoice.hsnSacCode)}</small></td>
          <td style="text-align:right;padding:6px 0;">${formatInr(it.lineTotalPaise)}</td>
        </tr>`
    )
    .join('');

  const cgstPercent = (invoice.cgstBps / 100).toFixed(2);
  const sgstPercent = (invoice.sgstBps / 100).toFixed(2);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;color:#26331f;">
      <div style="border-bottom:2px solid #1f6b3a;padding-bottom:12px;margin-bottom:16px;">
        <span style="float:right;font-size:12px;font-weight:bold;background:#e4f6d2;color:#1f6b3a;padding:4px 8px;border-radius:6px;">TAX INVOICE</span>
        <h2 style="margin:0 0 4px;color:#1f6b3a;font-size:20px;">${escapeHtml(invoice.tradeName)}</h2>
        <div style="font-size:12px;color:#4b5563;line-height:1.4;">
          <strong>${escapeHtml(invoice.legalName)}</strong><br>
          ${escapeHtml(invoice.address)}<br>
          State: ${escapeHtml(invoice.stateName)} (Code: ${escapeHtml(invoice.stateCode)})<br>
          <strong>GSTIN:</strong> ${escapeHtml(invoice.gstin)} | <strong>FSSAI Lic No:</strong> ${escapeHtml(invoice.fssaiNumber)}
        </div>
      </div>

      <table style="width:100%;font-size:12px;color:#4b5563;margin-bottom:16px;border-bottom:1px dashed #d1d5db;padding-bottom:10px;">
        <tr>
          <td><strong>Invoice No:</strong> ${escapeHtml(invoice.invoiceNumber)}</td>
          <td style="text-align:right;"><strong>Date:</strong> ${invoice.createdAt.toISOString().slice(0, 10)}</td>
        </tr>
        <tr>
          <td><strong>Table:</strong> ${escapeHtml(tableLabel)} (${escapeHtml(tableNumber)})</td>
          <td style="text-align:right;"><strong>SAC Code:</strong> ${escapeHtml(invoice.hsnSacCode)}</td>
        </tr>
        <tr>
          <td colspan="2"><strong>Customer Email:</strong> ${escapeHtml(email)}</td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;text-transform:uppercase;">
            <th style="text-align:left;padding-bottom:6px;">Item & Service Description</th>
            <th style="text-align:right;padding-bottom:6px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml}
        </tbody>
      </table>

      <table style="width:100%;font-size:13px;border-top:1px solid #e5e7eb;padding-top:10px;">
        <tr>
          <td>Subtotal (Taxable Value)</td>
          <td style="text-align:right;">${formatInr(invoice.subtotalPaise)}</td>
        </tr>
        ${
          invoice.discountPaise > 0
            ? `<tr>
                <td style="color:#1f8a3d;">Discount</td>
                <td style="text-align:right;color:#1f8a3d;">-${formatInr(invoice.discountPaise)}</td>
              </tr>`
            : ''
        }
        <tr>
          <td>CGST (${cgstPercent}%)</td>
          <td style="text-align:right;">${formatInr(invoice.cgstPaise)}</td>
        </tr>
        <tr>
          <td>SGST (${sgstPercent}%)</td>
          <td style="text-align:right;">${formatInr(invoice.sgstPaise)}</td>
        </tr>
        ${
          invoice.tipPaise > 0
            ? `<tr>
                <td>Tip / Staff Gratuity</td>
                <td style="text-align:right;">${formatInr(invoice.tipPaise)}</td>
              </tr>`
            : ''
        }
        <tr style="font-size:15px;font-weight:bold;border-top:2px solid #1f6b3a;">
          <td style="padding-top:8px;">Total Amount Paid (INR)</td>
          <td style="text-align:right;padding-top:8px;color:#1f6b3a;">${formatInr(invoice.totalPaise)}</td>
        </tr>
      </table>

      <div style="margin-top:20px;padding:10px;background:#f9fafb;border-radius:8px;font-size:11px;color:#6b7280;line-height:1.4;">
        <p style="margin:0 0 4px;"><strong>Statutory GST Declaration:</strong> Supply of Restaurant Services (SAC 996331). Reverse charge mechanism not applicable.</p>
        <p style="margin:0;">Thank you for dining with ${escapeHtml(invoice.tradeName)}!</p>
      </div>
    </div>
  `;

  let emailId: string | undefined;
  let mode: 'resend' | 'dev_log' = 'dev_log';

  if (env.RESEND_API_KEY) {
    const resend = new Resend(env.RESEND_API_KEY);
    const resp = await resend.emails.send({
      from: env.RESEND_FROM,
      to: email,
      subject: `Your ${invoice.tradeName} Tax Invoice — ${invoice.invoiceNumber}`,
      html,
    });
    if (resp.error) {
      throw new AppError(502, 'Failed to dispatch receipt email.', 'EMAIL_SEND_FAILED');
    }
    emailId = resp.data?.id;
    mode = 'resend';
  } else {
    console.info('[TableFlow Dev GST Invoice Receipt]', {
      to: email,
      invoiceNumber: invoice.invoiceNumber,
      totalPaise: invoice.totalPaise,
    });
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

  return { sent: true, id: emailId, mode, invoiceNumber: invoice.invoiceNumber };
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
