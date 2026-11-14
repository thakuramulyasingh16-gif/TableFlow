'use client';

import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui';

export interface KotItem {
  id: number;
  quantity: number;
  itemNameSnapshot: string;
  variantNameSnapshot?: string | null;
  specialInstructions?: string | null;
  status: string;
}

export interface KotTicket {
  orderId: number;
  orderNumber: string;
  confirmedAt: string;
  notes?: string | null;
  table: { tableNumber: string; label: string };
  items: KotItem[];
  stationName?: string;
}

export function PrintableKotModal({
  ticket,
  onClose,
  restaurantName = 'TableFlow Bistro',
}: {
  ticket: KotTicket | null;
  onClose: () => void;
  restaurantName?: string;
}) {
  if (!ticket) return null;

  function handlePrint() {
    window.print();
  }

  const formattedDate = new Date(ticket.confirmedAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs">
      {/* Print-only CSS injecting 80mm thermal receipt styling */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-kot-ticket,
          #printable-kot-ticket * {
            visibility: visible !important;
          }
          #printable-kot-ticket {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 8mm !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-surface rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-sun flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="no-print flex items-center justify-between p-4 border-b border-sun/30 bg-cream">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-leaf" />
            <span className="font-extrabold text-ink text-[16px]">Print Kitchen Ticket (KOT)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-sun/20 text-muted transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Ticket Content */}
        <div className="overflow-y-auto p-6 space-y-4">
          <div
            id="printable-kot-ticket"
            className="bg-white p-5 rounded-xl border border-ink/20 font-mono text-ink text-xs space-y-3"
          >
            <div className="text-center border-b border-dashed border-ink/40 pb-3 space-y-1">
              <h2 className="text-[16px] font-extrabold uppercase tracking-wider">{restaurantName}</h2>
              <p className="text-[14px] font-black tracking-widest uppercase">*** KOT ***</p>
              {ticket.stationName && (
                <p className="text-[12px] font-bold uppercase">STATION: {ticket.stationName}</p>
              )}
            </div>

            <div className="text-[12px] space-y-1 border-b border-dashed border-ink/40 pb-2">
              <div className="flex justify-between font-bold">
                <span>TABLE: {ticket.table.label} ({ticket.table.tableNumber})</span>
                <span>KOT #{ticket.orderNumber}</span>
              </div>
              <div className="text-[10px] text-gray-600">TIME: {formattedDate}</div>
            </div>

            {/* Overall Order Notes / Allergies */}
            {ticket.notes && (
              <div className="p-2 border-2 border-dashed border-black rounded font-bold text-[11px] bg-yellow-50">
                âš ï¸ ORDER NOTE / ALLERGY:
                <div className="text-[12px] font-black uppercase mt-0.5">{ticket.notes}</div>
              </div>
            )}

            {/* Item List */}
            <div className="space-y-2 pt-1 border-b border-dashed border-ink/40 pb-3">
              <div className="flex justify-between font-extrabold border-b border-ink/20 pb-1 text-[11px]">
                <span className="w-12">QTY</span>
                <span className="flex-1">ITEM DETAILS</span>
              </div>
              {ticket.items.map((it) => (
                <div key={it.id} className="py-1">
                  <div className="flex items-start justify-between text-[13px] font-black">
                    <span className="w-12 text-[14px]">{it.quantity} x</span>
                    <span className="flex-1 uppercase">{it.itemNameSnapshot}</span>
                  </div>
                  {it.variantNameSnapshot && (
                    <div className="ml-12 text-[11px] font-bold text-gray-700 uppercase">
                      Option: {it.variantNameSnapshot}
                    </div>
                  )}
                  {it.specialInstructions && (
                    <div className="ml-12 mt-1 p-1 bg-red-100 border border-red-500 rounded text-[11px] font-black text-red-700 uppercase">
                      * NOTE: {it.specialInstructions}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center pt-2 text-[10px] text-gray-500">
              TableFlow Kitchen Display System Â· End of Ticket
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="no-print p-4 border-t border-sun/30 bg-cream flex gap-3 justify-end">
          <Button variant="mint" onClick={onClose}>
            Close
          </Button>
          <Button variant="leaf" onClick={handlePrint} className="flex items-center gap-1.5 font-extrabold">
            <Printer className="w-4 h-4" /> Print KOT
          </Button>
        </div>
      </div>
    </div>
  );
}
