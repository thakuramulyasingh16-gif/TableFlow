'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  BellRing,
  Check,
  CheckCircle2,
  CreditCard,
  LogOut,
  RefreshCw,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatInr } from '@/lib/format';
import { subscribeRealtime } from '@/lib/realtime-client';
import { Badge, Button, Card, Modal, Skeleton, Toast } from '@/components/ui';

interface FloorTable {
  id: number;
  tableNumber: string;
  label: string;
  capacity: number;
  zone: string;
  status: 'free' | 'ordered' | 'needs_help' | 'bill_requested';
  activeOrderCount: number;
  pin?: string | null;
  activeSessionId?: number | null;
}

interface StaffOrder {
  id: number;
  orderNumber: string;
  status: string;
  totalPaise: number;
  notes?: string | null;
  table: { id: number; tableNumber: string; label: string };
  items: {
    id: number;
    quantity: number;
    itemNameSnapshot: string;
    variantNameSnapshot?: string | null;
    status: string;
  }[];
}

interface WaiterCall {
  id: number;
  reason: string;
  table: { label: string; zone: string };
}

const FLOOR_STATE_META: Record<
  FloorTable['status'],
  { label: string; cardCls: string; tone: 'mint' | 'sun' | 'tomato' | 'ink'; icon: typeof Sparkles }
> = {
  needs_help: {
    label: 'Needs help',
    cardCls: 'border-2 border-tomato bg-surface',
    tone: 'tomato',
    icon: BellRing,
  },
  bill_requested: {
    label: 'Bill requested',
    cardCls: 'border-2 border-leaf bg-mint-bg',
    tone: 'ink',
    icon: CreditCard,
  },
  ordered: {
    label: 'Ordered',
    cardCls: 'border-2 border-sun bg-surface',
    tone: 'sun',
    icon: Utensils,
  },
  free: {
    label: 'Free',
    cardCls: 'border border-mint bg-surface',
    tone: 'mint',
    icon: Sparkles,
  },
};

const FLOOR_PRIORITY: Record<FloorTable['status'], number> = {
  needs_help: 0,
  bill_requested: 1,
  ordered: 2,
  free: 3,
};

export default function StaffPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const [tables, setTables] = useState<FloorTable[]>([]);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [payingTable, setPayingTable] = useState<FloorTable | null>(null);
  const [collectAmountRupees, setCollectAmountRupees] = useState('');
  const [collectMethod, setCollectMethod] = useState<'cash' | 'counter_upi' | 'counter_card'>('cash');
  const [collectReference, setCollectReference] = useState('');
  const [collectSubmitting, setCollectSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [floorRes, ordersRes, callsRes] = await Promise.all([
        apiFetch<{ tables: FloorTable[] }>('/api/staff/floor'),
        apiFetch<{ orders: StaffOrder[] }>('/api/staff/orders'),
        apiFetch<{ calls: WaiterCall[] }>('/api/staff/waiter-calls'),
      ]);
      setTables(floorRes.tables || []);
      setOrders(ordersRes.orders || []);
      setCalls(callsRes.calls || []);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Unable to load floor data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status !== 'authenticated') return;

    const timer = setTimeout(() => {
      void loadAll();
    }, 0);
    const unsub = subscribeRealtime(
      'staff:updates',
      ['order:created', 'order:updated', 'waiter:call_created', 'waiter:call_resolved', 'table:status_changed', 'payment:captured'],
      () => {
        void loadAll();
      }
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [status, router, loadAll]);

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => FLOOR_PRIORITY[a.status] - FLOOR_PRIORITY[b.status]),
    [tables]
  );

  async function confirmOrder(orderId: number) {
    await apiFetch(`/api/staff/orders/${orderId}/confirm`, { method: 'POST', body: {} });
    setToast('Order confirmed & sent to kitchen');
    setTimeout(() => setToast(''), 2500);
    await loadAll();
  }

  async function markServed(orderId: number) {
    await apiFetch(`/api/staff/orders/${orderId}/serve`, { method: 'POST', body: {} });
    setToast('Order marked served');
    setTimeout(() => setToast(''), 2500);
    await loadAll();
  }

  async function resolveCall(callId: number) {
    await apiFetch(`/api/staff/waiter-calls/${callId}/resolve`, { method: 'POST', body: {} });
    setToast('Waiter call resolved');
    setTimeout(() => setToast(''), 2500);
    await loadAll();
  }

  async function resetTableFree(tableId: number) {
    await apiFetch(`/api/staff/tables/${tableId}/status`, { method: 'PATCH', body: { status: 'free' } });
    await loadAll();
  }

  function openCollectModal(t: FloorTable) {
    setPayingTable(t);
    // Find total from table's orders if possible, or prefill empty
    const tableOrders = orders.filter((o) => o.table?.id === t.id);
    const sumPaise = tableOrders.reduce((sum, o) => sum + o.totalPaise, 0);
    setCollectAmountRupees(sumPaise > 0 ? (sumPaise / 100).toFixed(2) : '');
    setCollectMethod('cash');
    setCollectReference('');
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payingTable?.activeSessionId) return;

    const rupees = parseFloat(collectAmountRupees);
    if (isNaN(rupees) || rupees <= 0) {
      setToast('Please enter a valid amount');
      return;
    }

    setCollectSubmitting(true);
    try {
      await apiFetch('/api/staff/payments/record', {
        method: 'POST',
        body: {
          tableSessionId: payingTable.activeSessionId,
          amountPaise: Math.round(rupees * 100),
          method: collectMethod,
          paymentReference: collectReference.trim() || null,
        },
      });
      setToast(`Payment recorded for ${payingTable.label}! Session closed.`);
      setPayingTable(null);
      setCollectAmountRupees('');
      setCollectReference('');
      await loadAll();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setCollectSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-cream p-5 max-w-7xl mx-auto space-y-5">
        <Skeleton className="h-24 w-full rounded-[28px]" />
        <Skeleton className="h-64 w-full rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <Toast message={toast} />

      <header className="bg-signature-gradient rounded-b-[28px] px-5 sm:px-8 py-5 shadow-card">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-leaf text-surface flex items-center justify-center">
              <Utensils className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-[26px] font-extrabold text-ink leading-tight">Staff Floor &amp; Service</h1>
              <p className="text-[12px] font-bold text-leaf">
                {user?.name} ({user?.role})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(user?.role === 'owner' || user?.role === 'manager') && (
              <>
                <Link
                  href="/kitchen"
                  className="min-h-[44px] px-4 rounded-[14px] bg-surface text-ink font-bold text-[13px] inline-flex items-center shadow-sm"
                >
                  Kitchen
                </Link>
                <Link
                  href="/admin"
                  className="min-h-[44px] px-4 rounded-[14px] bg-surface text-ink font-bold text-[13px] inline-flex items-center shadow-sm"
                >
                  Admin
                </Link>
              </>
            )}
            <button
              type="button"
              aria-label="Refresh floor"
              onClick={() => void loadAll()}
              className="min-w-[44px] min-h-[44px] rounded-[14px] bg-surface text-ink inline-flex items-center justify-center shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Button variant="leaf" onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className="w-4 h-4" aria-hidden="true" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {/* Waiter Call Alerts */}
        {calls.length > 0 && (
          <section aria-live="polite" className="bg-surface border-2 border-tomato rounded-[20px] p-4 shadow-card space-y-3">
            <div className="flex items-center gap-2 text-tomato font-extrabold text-[16px]">
              <BellRing className="w-5 h-5" aria-hidden="true" /> Active Waiter Calls ({calls.length})
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {calls.map((c) => (
                <div key={c.id} className="bg-cream rounded-[16px] p-3.5 border border-tomato/30 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-ink text-[15px]">
                      {c.table?.label} ({c.table?.zone})
                    </div>
                    <div className="text-[12px] text-muted">{c.reason}</div>
                  </div>
                  <Button variant="tomato" onClick={() => void resolveCall(c.id)}>
                    Resolve
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live Floor Map */}
        <section className="space-y-3">
          <h2 className="text-[20px] font-extrabold text-ink">Live Floor Map</h2>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <Skeleton className="h-32 rounded-[20px]" />
              <Skeleton className="h-32 rounded-[20px]" />
              <Skeleton className="h-32 rounded-[20px]" />
              <Skeleton className="h-32 rounded-[20px]" />
              <Skeleton className="h-32 rounded-[20px]" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
              {sortedTables.map((t) => {
                const meta = FLOOR_STATE_META[t.status] || FLOOR_STATE_META.free;
                const Icon = meta.icon;
                return (
                  <Card
                    key={t.id}
                    className={`p-4 flex flex-col justify-between gap-2 ${meta.cardCls} ${
                      t.status === 'needs_help' ? 'animate-pulse' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[18px] font-extrabold text-ink">{t.tableNumber}</span>
                      <Badge tone={meta.tone}>
                        <Icon className="w-3 h-3" aria-hidden="true" />
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="text-[12px] text-muted">
                      {t.zone} · {t.capacity} seats
                    </div>
                    <div className="flex items-center justify-between text-[13px] font-bold text-ink">
                      <span>Orders: {t.activeOrderCount}</span>
                      {t.pin && (
                        <span className="font-mono text-[11px] font-extrabold bg-mint-bg text-leaf px-2 py-0.5 rounded-full border border-leaf/20" title="Table PIN for guests">
                          PIN {t.pin}
                        </span>
                      )}
                    </div>
                    {t.status !== 'free' && t.activeSessionId ? (
                      <div className="flex gap-1.5 pt-1">
                        <Button
                          variant="sun"
                          fullWidth
                          onClick={() => openCollectModal(t)}
                          className="flex items-center justify-center gap-1 text-[12px] py-1.5"
                        >
                          <Banknote className="w-3.5 h-3.5" /> Collect Bill
                        </Button>
                        {t.activeOrderCount === 0 && (
                          <Button
                            variant="mint"
                            onClick={() => void resetTableFree(t.id)}
                            className="text-[12px] py-1.5 px-2.5"
                          >
                            Free
                          </Button>
                        )}
                      </div>
                    ) : t.status !== 'free' && t.activeOrderCount === 0 ? (
                      <Button variant="mint" fullWidth onClick={() => void resetTableFree(t.id)}>
                        Mark Free
                      </Button>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Incoming & Active Orders */}
        <section className="space-y-3">
          <h2 className="text-[20px] font-extrabold text-ink">Orders Queue ({orders.length})</h2>
          {orders.length === 0 ? (
            <Card className="p-6 text-center text-muted">No open table orders right now.</Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map((ord) => (
                <Card key={ord.id} className="p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-[16px] text-ink">{ord.table?.label}</span>
                      <Badge tone={ord.status === 'ready' ? 'mint' : 'sun'}>{ord.status}</Badge>
                    </div>
                    <div className="text-[12px] text-muted mt-0.5">
                      {ord.orderNumber} · {formatInr(ord.totalPaise)}
                    </div>
                    <ul className="mt-3 space-y-1.5 text-[14px] border-t border-mint pt-2.5">
                      {ord.items.map((it) => (
                        <li key={it.id} className="flex justify-between gap-2">
                          <span className="font-medium text-ink">
                            {it.quantity}× {it.itemNameSnapshot}
                            {it.variantNameSnapshot ? ` (${it.variantNameSnapshot})` : ''}
                          </span>
                          <span className="text-[12px] font-bold text-muted capitalize">{it.status}</span>
                        </li>
                      ))}
                    </ul>
                    {ord.notes && (
                      <div className="mt-2.5 text-[12px] font-bold bg-due-soon text-due-soon-ink p-2.5 rounded-[12px]">
                        Note: {ord.notes}
                      </div>
                    )}
                  </div>

                  {ord.status === 'received' && (
                    <Button variant="leaf" fullWidth onClick={() => void confirmOrder(ord.id)}>
                      <Check className="w-4 h-4" aria-hidden="true" /> Confirm &amp; Send to Kitchen
                    </Button>
                  )}

                  {ord.status === 'ready' && (
                    <Button variant="sun" fullWidth onClick={() => void markServed(ord.id)}>
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Mark Served
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Counter / Cash Payment Modal */}
      {payingTable && (
        <Modal
          open={true}
          onClose={() => setPayingTable(null)}
          title={`Collect Bill — ${payingTable.label}`}
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div>
              <p className="text-xs text-muted mb-1">
                Record an offline counter payment (Cash, external UPI or Card) to settle this table&apos;s bill.
              </p>
            </div>

            <div>
              <label htmlFor="collect-amount" className="block text-xs font-bold text-ink mb-1">
                Amount to Collect (₹)
              </label>
              <input
                id="collect-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={collectAmountRupees}
                onChange={(e) => setCollectAmountRupees(e.target.value)}
                placeholder="0.00"
                className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[15px] font-bold"
              />
            </div>

            <div>
              <label htmlFor="collect-method" className="block text-xs font-bold text-ink mb-1">
                Payment Method
              </label>
              <select
                id="collect-method"
                value={collectMethod}
                onChange={(e) => setCollectMethod(e.target.value as 'cash' | 'counter_upi' | 'counter_card')}
                className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px] font-semibold"
              >
                <option value="cash">Cash Payment</option>
                <option value="counter_upi">External UPI (GPay / PhonePe / Paytm)</option>
                <option value="counter_card">Card Machine (POS EDC)</option>
              </select>
            </div>

            <div>
              <label htmlFor="collect-ref" className="block text-xs font-bold text-ink mb-1">
                Reference / Notes (optional)
              </label>
              <input
                id="collect-ref"
                type="text"
                value={collectReference}
                onChange={(e) => setCollectReference(e.target.value)}
                placeholder="e.g. UPI UTR number or POS slip reference"
                className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[13px]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPayingTable(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="leaf"
                disabled={collectSubmitting}
                className="flex-1 font-bold"
              >
                {collectSubmitting ? 'Recording...' : 'Collect & Clear Table'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
