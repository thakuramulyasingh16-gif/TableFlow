'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui';

interface KotData {
  order: {
    id: number;
    orderNumber: string;
    confirmedAt: string;
    notes?: string | null;
    table: { tableNumber: string; label: string; zone?: string };
    items: {
      id: number;
      quantity: number;
      itemNameSnapshot: string;
      variantNameSnapshot?: string | null;
      specialInstructions?: string | null;
      status: string;
    }[];
  };
  restaurantName: string;
}

export default function KotPrintPage({ params }: { params: Promise<{ orderId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [data, setData] = useState<KotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch<KotData>(`/api/kitchen/kot/${resolvedParams.orderId}`);
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order KOT');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [resolvedParams.orderId]);

  if (loading) {
    return <div className="p-8 text-center text-muted">Loading KOT ticket...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-tomato font-bold">{error || 'Order not found'}</p>
        <Button variant="mint" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const { order, restaurantName } = data;
  const formattedDate = new Date(order.confirmedAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="min-h-screen bg-cream p-4 sm:p-8 flex flex-col items-center">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #standalone-kot-ticket,
          #standalone-kot-ticket * {
            visibility: visible !important;
          }
          #standalone-kot-ticket {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 6mm !important;
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Action Bar */}
      <div className="no-print w-full max-w-sm mb-4 flex items-center justify-between">
        <Button variant="mint" onClick={() => router.back()} className="flex items-center gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Button>
        <Button variant="leaf" onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-extrabold">
          <Printer className="w-3.5 h-3.5" /> Print Thermal Ticket
        </Button>
      </div>

      {/* Thermal 80mm KOT Ticket Card */}
      <div
        id="standalone-kot-ticket"
        className="w-full max-w-sm bg-white p-6 rounded-2xl shadow-card border border-ink/10 font-mono text-ink text-xs space-y-3"
      >
        <div className="text-center border-b border-dashed border-ink/40 pb-3 space-y-1">
          <h1 className="text-[16px] font-extrabold uppercase tracking-wider">{restaurantName}</h1>
          <p className="text-[14px] font-black tracking-widest uppercase">*** KITCHEN ORDER TICKET ***</p>
        </div>

        <div className="text-[12px] space-y-1 border-b border-dashed border-ink/40 pb-2">
          <div className="flex justify-between font-bold">
            <span>TABLE: {order.table.label} ({order.table.tableNumber})</span>
            <span>KOT #{order.orderNumber}</span>
          </div>
          <div className="text-[10px] text-gray-600">TIME: {formattedDate}</div>
        </div>

        {/* Overall Order Notes / Allergies */}
        {order.notes && (
          <div className="p-2 border-2 border-dashed border-black rounded font-bold text-[11px] bg-yellow-50">
            âš ï¸  ORDER NOTE / ALLERGY:
            <div className="text-[12px] font-black uppercase mt-0.5">{order.notes}</div>
          </div>
        )}

        {/* Items List */}
        <div className="space-y-2 pt-1 border-b border-dashed border-ink/40 pb-3">
          <div className="flex justify-between font-extrabold border-b border-ink/20 pb-1 text-[11px]">
            <span className="w-12">QTY</span>
            <span className="flex-1">ITEM DETAILS</span>
          </div>
          {order.items.map((it) => (
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
  );
}
