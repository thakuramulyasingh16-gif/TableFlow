'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { BellRing, Check, CheckCircle2, LogOut, RefreshCw, Utensils } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatInr } from '@/lib/format';
import { subscribeRealtime } from '@/lib/realtime-client';

interface FloorTable {
  id: number;
  tableNumber: string;
  label: string;
  capacity: number;
  zone: string;
  status: string;
  activeOrderCount: number;
}

interface StaffOrder {
  id: number;
  orderNumber: string;
  status: string;
  totalPaise: number;
  notes?: string | null;
  table: { id: number; tableNumber: string; label: string };
  items: { id: number; quantity: number; itemNameSnapshot: string; variantNameSnapshot?: string | null; status: string }[];
}

interface WaiterCall {
  id: number;
  reason: string;
  table: { label: string; zone: string };
}

const TABLE_COLORS: Record<string, string> = {
  free: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  ordered: 'bg-amber-50 border-amber-400 text-amber-950',
  needs_help: 'bg-rose-100 border-rose-500 text-rose-950 animate-pulse',
  bill_requested: 'bg-indigo-50 border-indigo-400 text-indigo-950',
};

export default function StaffPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const [tables, setTables] = useState<FloorTable[]>([]);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load floor data');
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
        loadAll().catch(() => {});
      }
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [status, router, loadAll]);

  async function confirmOrder(orderId: number) {
    await apiFetch(`/api/staff/orders/${orderId}/confirm`, { method: 'POST', body: {} });
    await loadAll();
  }

  async function markServed(orderId: number) {
    await apiFetch(`/api/staff/orders/${orderId}/serve`, { method: 'POST', body: {} });
    await loadAll();
  }

  async function resolveCall(callId: number) {
    await apiFetch(`/api/staff/waiter-calls/${callId}/resolve`, { method: 'POST', body: {} });
    await loadAll();
  }

  async function resetTableFree(tableId: number) {
    await apiFetch(`/api/staff/tables/${tableId}/status`, { method: 'PATCH', body: { status: 'free' } });
    await loadAll();
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-stone-600">Checking session...</div>;
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-white border-b border-stone-200 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Utensils className="w-5 h-5 text-amber-600" />
          <div>
            <h1 className="font-bold text-stone-900">Staff Floor &amp; Service</h1>
            <p className="text-xs text-stone-500">
              {user?.name} ({user?.role})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(user?.role === 'owner' || user?.role === 'manager') && (
            <>
              <Link href="/kitchen" className="px-3 py-1.5 rounded-lg bg-stone-100 text-xs font-semibold">
                Kitchen
              </Link>
              <Link href="/admin" className="px-3 py-1.5 rounded-lg bg-stone-100 text-xs font-semibold">
                Admin
              </Link>
            </>
          )}
          <button onClick={() => loadAll()} className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        {calls.length > 0 && (
          <section className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
              <BellRing className="w-4 h-4" /> Active Waiter Calls ({calls.length})
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {calls.map((c) => (
                <div key={c.id} className="bg-white rounded-xl p-3 border border-rose-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-stone-900 text-sm">
                      {c.table?.label} ({c.table?.zone})
                    </div>
                    <div className="text-xs text-stone-600">{c.reason}</div>
                  </div>
                  <button
                    onClick={() => resolveCall(c.id)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
                  >
                    Resolve
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-bold text-stone-900">Live Floor Map</h2>
          {loading ? (
            <div className="text-sm text-stone-500">Loading floor...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {tables.map((t) => (
                <div key={t.id} className={`rounded-2xl border-2 p-4 shadow-sm ${TABLE_COLORS[t.status] || TABLE_COLORS.free}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base">{t.tableNumber}</span>
                    <span className="text-[11px] uppercase font-bold tracking-wide">{t.status.replace('_', ' ')}</span>
                  </div>
                  <div className="text-xs opacity-80 mt-0.5">
                    {t.zone} • {t.capacity} seats
                  </div>
                  <div className="text-xs font-medium mt-2">Active orders: {t.activeOrderCount}</div>
                  {t.status !== 'free' && t.activeOrderCount === 0 && (
                    <button
                      onClick={() => resetTableFree(t.id)}
                      className="mt-2 w-full py-1 rounded-lg bg-white/80 text-[11px] font-semibold border border-stone-300"
                    >
                      Mark Free
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-stone-900">Orders Queue ({orders.length})</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map((ord) => (
              <div key={ord.id} className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">{ord.table?.label}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold capitalize">
                      {ord.status}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {ord.orderNumber} • {formatInr(ord.totalPaise)}
                  </div>
                  <ul className="mt-3 space-y-1 text-sm border-t border-stone-100 pt-2">
                    {ord.items.map((it) => (
                      <li key={it.id} className="flex justify-between">
                        <span>
                          {it.quantity}× {it.itemNameSnapshot}
                          {it.variantNameSnapshot ? ` (${it.variantNameSnapshot})` : ''}
                        </span>
                        <span className="text-xs text-stone-500 capitalize">{it.status}</span>
                      </li>
                    ))}
                  </ul>
                  {ord.notes && (
                    <div className="mt-2 text-xs bg-amber-50 text-amber-900 p-2 rounded-lg">Note: {ord.notes}</div>
                  )}
                </div>

                {ord.status === 'received' && (
                  <button
                    onClick={() => confirmOrder(ord.id)}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 inline-flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" /> Confirm &amp; Send to Kitchen
                  </button>
                )}

                {ord.status === 'ready' && (
                  <button
                    onClick={() => markServed(ord.id)}
                    className="w-full py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 inline-flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark Served
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
