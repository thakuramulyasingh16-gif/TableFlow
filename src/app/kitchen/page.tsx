'use client';

import { useCallback, useEffect, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ChefHat, Clock, LogOut, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { elapsedMinutes, formatElapsed } from '@/lib/format';
import { subscribeRealtime } from '@/lib/realtime-client';

interface KitchenItem {
  id: number;
  quantity: number;
  itemNameSnapshot: string;
  variantNameSnapshot?: string | null;
  specialInstructions?: string | null;
  status: string;
}

interface KitchenTicket {
  orderId: number;
  orderNumber: string;
  confirmedAt: string;
  notes?: string | null;
  table: { label: string };
  items: KitchenItem[];
}

interface StationGroup {
  station: { id: number; name: string; code: string };
  tickets: KitchenTicket[];
}

export default function KitchenPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { name?: string } | undefined;

  const [stations, setStations] = useState<StationGroup[]>([]);
  const [selectedCode, setSelectedCode] = useState('all');
  const [, setTick] = useState(0);

  const loadQueue = useCallback(async () => {
    const res = await apiFetch<{ stations: StationGroup[] }>('/api/kitchen/queue');
    setStations(res.stations || []);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status !== 'authenticated') return;

    const timer = setTimeout(() => {
      loadQueue().catch(() => {});
    }, 0);
    const unsub = subscribeRealtime(
      'kitchen:updates',
      ['order:confirmed', 'order:updated', 'kitchen:item_updated'],
      () => {
        loadQueue().catch(() => {});
      }
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [status, router, loadQueue]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function setItemStatus(itemId: number, nextStatus: 'preparing' | 'ready') {
    await apiFetch(`/api/kitchen/order-items/${itemId}/status`, {
      method: 'PATCH',
      body: { status: nextStatus },
    });
    await loadQueue();
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-stone-950 text-stone-300">Loading KDS...</div>;
  }

  const visibleStations = stations.filter(
    (g) => selectedCode === 'all' || g.station.code === selectedCode
  );

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="font-bold text-lg">TableFlow Kitchen Display (KDS)</h1>
            <p className="text-xs text-stone-400">Operator: {user?.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'grill', 'fry', 'drinks', 'dessert'].map((code) => (
            <button
              key={code}
              onClick={() => setSelectedCode(code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase ${
                selectedCode === code ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300'
              }`}
            >
              {code}
            </button>
          ))}
          <button onClick={() => loadQueue()} className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>

      <main className="p-6 grid lg:grid-cols-2 xl:grid-cols-4 gap-5">
        {visibleStations.map(({ station, tickets }) => (
          <section key={station.id} className="bg-stone-900 rounded-2xl border border-stone-800 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
              <h2 className="font-bold text-amber-400">{station.name}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-800 text-stone-300">
                {tickets.length} active
              </span>
            </div>

            {tickets.length === 0 ? (
              <div className="text-xs text-stone-500 py-6 text-center">Station clear</div>
            ) : (
              tickets.map((t) => {
                const mins = elapsedMinutes(t.confirmedAt);
                const timerBadge =
                  mins >= 18
                    ? 'bg-rose-600 text-white'
                    : mins >= 10
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-800 text-stone-200';

                return (
                  <div key={t.orderId} className="bg-stone-950 rounded-xl border border-stone-800 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm">{t.table?.label}</div>
                        <div className="text-[11px] text-stone-400">{t.orderNumber}</div>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-xs font-mono font-bold inline-flex items-center gap-1 ${timerBadge}`}>
                        <Clock className="w-3 h-3" /> {formatElapsed(t.confirmedAt)}
                      </span>
                    </div>

                    {t.notes && (
                      <div className="text-xs bg-amber-950/60 border border-amber-800 text-amber-200 px-2.5 py-1.5 rounded-lg">
                        Note: {t.notes}
                      </div>
                    )}

                    <div className="space-y-2">
                      {t.items.map((it) => (
                        <div key={it.id} className="bg-stone-900 rounded-lg p-2.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold">
                                {it.quantity}× {it.itemNameSnapshot}
                              </div>
                              {it.variantNameSnapshot && (
                                <div className="text-xs text-stone-400">{it.variantNameSnapshot}</div>
                              )}
                              {it.specialInstructions && (
                                <div className="text-xs text-amber-300 mt-0.5">{it.specialInstructions}</div>
                              )}
                            </div>
                            <span className="text-[11px] uppercase font-bold text-stone-400">{it.status}</span>
                          </div>

                          <div className="flex gap-2">
                            {it.status === 'queued' && (
                              <button
                                onClick={() => setItemStatus(it.id, 'preparing')}
                                className="flex-1 py-1.5 rounded-lg bg-amber-500 text-stone-950 text-xs font-bold hover:bg-amber-400"
                              >
                                Start Preparing
                              </button>
                            )}
                            {it.status !== 'ready' && (
                              <button
                                onClick={() => setItemStatus(it.id, 'ready')}
                                className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500"
                              >
                                Mark Ready
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
