import nodemailer from 'nodemailer';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getModels } from '../db/models/index.js';
import { AppError } from '../utils/AppError.js';
import { escapeHtml } from '../utils/sanitize.js';
import { computeSessionBillSummary } from './paymentService.js';

function createTransporter(env = getEnv()) {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return nodemailer.createTransport({ jsonTransport: true });
}

function formatInr(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

export async function sendGstEmailReceipt({ tableSession, table, email }) {
  const env = getEnv();
  const { Payment, TableSession } = getModels();
  const summary = await computeSessionBillSummary(tableSession.id);

  const capturedPayments = summary.payments.filter((p) => p.status === 'captured');
  if (capturedPayments.length === 0) {
    throw new AppError(400, 'Receipt can only be sent after a payment is completed.', 'NO_CAPTURED_PAYMENT');
  }

  const totalTipPaise = capturedPayments.reduce((acc, p) => acc + p.tip_paise, 0);
  const grandTotalPaise = summary.ordersTotalPaise + totalTipPaise;

  const itemRowsHtml = summary.orders
    .flatMap((o) => o.items || [])
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.item_name_snapshot)}${
          it.variant_name_snapshot ? ` (${escapeHtml(it.variant_name_snapshot)})` : ''
        } x ${it.quantity}</td><td style="text-align:right">${formatInr(it.line_total_paise)}</td></tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:8px;">
      <h2 style="margin:0 0 8px;">TableFlow Tax Invoice</h2>
      <p style="color:#6b7280;margin:0 0 16px;">Table: ${escapeHtml(table.label)} (${escapeHtml(table.table_number)}) | Date: ${new Date().toISOString().slice(0, 10)}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${itemRowsHtml}</table>
      <hr style="border:none;border-top:1px solid #e5e7eb;" />
      <table style="width:100%;margin-top:12px;">
        <tr><td>Subtotal</td><td style="text-align:right">${formatInr(summary.subtotalPaise)}</td></tr>
        <tr><td>Discount</td><td style="text-align:right">-${formatInr(summary.discountPaise)}</td></tr>
        <tr><td>CGST (${(env.CGST_BPS / 100).toFixed(2)}%)</td><td style="text-align:right">${formatInr(summary.cgstPaise)}</td></tr>
        <tr><td>SGST (${(env.SGST_BPS / 100).toFixed(2)}%)</td><td style="text-align:right">${formatInr(summary.sgstPaise)}</td></tr>
        <tr><td>Tip</td><td style="text-align:right">${formatInr(totalTipPaise)}</td></tr>
        <tr><td><strong>Grand Total Paid</strong></td><td style="text-align:right"><strong>${formatInr(grandTotalPaise)}</strong></td></tr>
      </table>
      <p style="font-size:12px;color:#6b7280;margin-top:16px;">Thank you for dining with TableFlow.</p>
    </div>
  `;

  const transporter = createTransporter(env);
  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: `Your TableFlow GST Receipt — ${table.label}`,
    html,
  });

  await TableSession.update({ guest_email: email }, { where: { id: tableSession.id } });
  await Payment.update(
    { receipt_email: email, receipt_sent_at: new Date() },
    { where: { table_session_id: tableSession.id, status: 'captured' } }
  );

  logger.info({ messageId: info.messageId, tableSessionId: tableSession.id }, 'GST email receipt dispatched');
  return { sent: true, messageId: info.messageId };
}

export async function deleteGuestEmailPii(tableSessionId) {
  const { TableSession, Payment } = getModels();
  await TableSession.update({ guest_email: null }, { where: { id: tableSessionId } });
  await Payment.update({ receipt_email: null }, { where: { table_session_id: tableSessionId } });
  return { deleted: true };
}
