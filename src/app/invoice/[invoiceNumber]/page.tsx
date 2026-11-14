import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { PrintButton } from './PrintButton';

function formatInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ invoiceNumber: string }>;
}) {
  const { invoiceNumber } = await params;
  const decodedNumber = decodeURIComponent(invoiceNumber);

  const invoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { invoiceNumber: decodedNumber },
        { invoiceNumber: decodedNumber.replace(/-/g, '/') },
      ],
    },
    include: {
      table: { select: { id: true, tableNumber: true, label: true, zone: true } },
      tableSession: {
        include: {
          orders: {
            where: { status: { in: ['confirmed', 'preparing', 'ready', 'served'] } },
            include: { items: true },
          },
        },
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  const orders = invoice.tableSession?.orders || [];
  const items = orders.flatMap((o) => o.items);

  const cgstPercent = (invoice.cgstBps / 100).toFixed(2);
  const sgstPercent = (invoice.sgstBps / 100).toFixed(2);

  return (
    <main className="min-h-screen bg-[var(--tf-cream)] py-8 px-4 print:p-0 print:bg-white text-[#26331F]">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#1F6B3A] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dining
          </Link>
          <PrintButton />
        </div>

        <div className="bg-white rounded-[20px] p-8 shadow-[var(--shadow-card)] border border-[#E4F6D2] print:border-none print:shadow-none print:p-0 print:rounded-none">
          {/* Header */}
          <div className="border-b-2 border-[#1F6B3A] pb-4 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-[#E4F6D2] text-[#1F6B3A] mb-2 uppercase tracking-wide">
                  Tax Invoice
                </span>
                <h1 className="text-2xl font-black text-[#1F6B3A] font-display">
                  {invoice.tradeName}
                </h1>
                <p className="text-sm font-bold text-[#26331F] mt-1">{invoice.legalName}</p>
                <p className="text-xs text-[#5C6B52] max-w-sm mt-0.5">{invoice.address}</p>
                <p className="text-xs text-[#5C6B52] mt-0.5">
                  State: {invoice.stateName} (Code: {invoice.stateCode})
                </p>
              </div>
              <div className="text-right text-xs text-[#5C6B52] space-y-1">
                <div className="bg-[#FFFBE6] border border-[#F4F1A0] p-2.5 rounded-[12px] inline-block text-left">
                  <p>
                    <strong className="text-[#26331F]">GSTIN:</strong> {invoice.gstin}
                  </p>
                  <p>
                    <strong className="text-[#26331F]">FSSAI:</strong> {invoice.fssaiNumber}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs text-[#5C6B52] pb-6 border-b border-dashed border-gray-300 mb-6">
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Invoice Number</p>
              <p className="text-sm font-bold text-[#26331F] font-mono mt-0.5">{invoice.invoiceNumber}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Date & Time</p>
              <p className="text-xs font-medium text-[#26331F] mt-0.5">
                {new Date(invoice.createdAt).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Table & Zone</p>
              <p className="text-xs font-medium text-[#26331F] mt-0.5">
                {invoice.table.label} ({invoice.table.tableNumber})
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">SAC Code</p>
              <p className="text-xs font-medium text-[#26331F] mt-0.5">{invoice.hsnSacCode} (Restaurant Services)</p>
            </div>
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Financial Year</p>
              <p className="text-xs font-medium text-[#26331F] mt-0.5">FY {invoice.financialYear}</p>
            </div>
            {invoice.customerEmail && (
              <div>
                <p className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Customer Email</p>
                <p className="text-xs font-medium text-[#26331F] mt-0.5 truncate">{invoice.customerEmail}</p>
              </div>
            )}
          </div>

          {/* Items Table */}
          <table className="w-full text-left text-sm mb-6 border-collapse">
            <thead>
              <tr className="border-b border-[#E4F6D2] text-[11px] font-bold text-[#5C6B52] uppercase tracking-wider">
                <th className="py-2.5">Item Description</th>
                <th className="py-2.5 text-center">Qty</th>
                <th className="py-2.5 text-right">Unit Rate</th>
                <th className="py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-3">
                    <p className="font-bold text-[#26331F]">{it.itemNameSnapshot}</p>
                    {it.variantNameSnapshot && (
                      <p className="text-xs text-[#5C6B52]">{it.variantNameSnapshot}</p>
                    )}
                  </td>
                  <td className="py-3 text-center font-medium">{it.quantity}</td>
                  <td className="py-3 text-right font-medium text-[#5C6B52]">{formatInr(it.unitPricePaise)}</td>
                  <td className="py-3 text-right font-bold text-[#26331F]">{formatInr(it.lineTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary / Tax Calculation */}
          <div className="border-t border-[#E4F6D2] pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-[#5C6B52]">
              <span>Subtotal (Taxable Value)</span>
              <span className="font-semibold text-[#26331F]">{formatInr(invoice.subtotalPaise)}</span>
            </div>
            {invoice.discountPaise > 0 && (
              <div className="flex justify-between text-[#1F8A3D]">
                <span>Discount</span>
                <span className="font-semibold">-{formatInr(invoice.discountPaise)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#5C6B52]">
              <span>Central GST ({cgstPercent}%)</span>
              <span className="font-semibold text-[#26331F]">{formatInr(invoice.cgstPaise)}</span>
            </div>
            <div className="flex justify-between text-[#5C6B52]">
              <span>State GST ({sgstPercent}%)</span>
              <span className="font-semibold text-[#26331F]">{formatInr(invoice.sgstPaise)}</span>
            </div>
            {invoice.tipPaise > 0 && (
              <div className="flex justify-between text-[#5C6B52]">
                <span>Tip / Staff Gratuity</span>
                <span className="font-semibold text-[#26331F]">{formatInr(invoice.tipPaise)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-lg font-black border-t-2 border-[#1F6B3A] pt-3 text-[#1F6B3A]">
              <span>Total Amount Paid</span>
              <span>{formatInr(invoice.totalPaise)}</span>
            </div>
          </div>

          {/* Statutory Footer */}
          <div className="mt-8 pt-4 border-t border-dashed border-gray-300 text-xs text-[#5C6B52] space-y-1">
            <div className="flex items-center gap-1.5 text-[#1F8A3D] font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Paid in full · Reverse charge is not applicable</span>
            </div>
            <p>
              This is a computer-generated tax invoice issued in accordance with Section 31 of the CGST Act, 2017.
            </p>
            <p className="font-medium text-[#26331F]">
              Thank you for dining with {invoice.tradeName}!
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
