'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChefHat, LogOut, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { elapsedMinutes } from '@/lib/format';
import { subscribeRealtime } from '@/lib/realtime-client';
import { Badge, Button, Card, Chip, Skeleton, TimerChip, Toast } from '@/components/ui';

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
  table: { tableNumber: string; label: string };
  items: KitchenItem[];
}

interface StationGroup {
  station: { id: number; name: string; code: string };
  tickets: KitchenTicket[];
}

function playNewOrderChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  } catch {
    // Ignore autoplay blocks
  }
}

export default function KitchenPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const [stations, setStations] = useState<StationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [toast, setToast] = useState('');
  const [, setTick] = useState(0);
  const prevCountRef = useRef<number>(0);

  const loadQueue = useCallback(async () => {
    try {
      const res = await apiFetch<{ stations: StationGroup[] }>('/api/kitchen/queue');
      const nextStations = res.stations || [];
      const totalActive = nextStations.reduce((acc, g) => acc + g.tickets.length, 0);
      if (soundEnabled && prevCountRef.current > 0 && totalActive > prevCountRef.current) {
        playNewOrderChime();
      }
      prevCountRef.current = totalActive;
      setStations(nextStations);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Unable to load kitchen queue');
    } finally {
      setLoading(false);
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status !== 'authenticated') return;

    const timer = setTimeout(() => {
      void loadQueue();
    }, 0);
    const unsub = subscribeRealtime(
      'kitchen:updates',
      ['order:confirmed', 'order:updated', 'kitchen:item_updated'],
      () => {
        void loadQueue();
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
    setToast(nextStatus === 'ready' ? 'Dish marked ready!' : 'Dish preparation started');
    setTimeout(() => setToast(''), 2500);
    await loadQueue();
  }

  async function markTicketAllReady(ticket: KitchenTicket) {
    const pending = ticket.items.filter((it) => it.status !== 'ready');
    await Promise.all(
      pending.map((it) =>
        apiFetch(`/api/kitchen/order-items/${it.id}/status`, {
          method: 'PATCH',
          body: { status: 'ready' },
        })
      )
    );
    setToast(`${ticket.table.label} · ${ticket.orderNumber} marked ready!`);
    setTimeout(() => setToast(''), 2500);
    await loadQueue();
  }

  const totalActiveCount = useMemo(
    () => stations.reduce((acc, s) => acc + s.tickets.length, 0),
    [stations]
  );

  // Sort Late tickets (>= 15m) to the top, then oldest confirmedAt first
  const visibleStations = useMemo(() => {
    return stations
      .filter((g) => selectedCode === 'all' || g.station.code === selectedCode)
      .map((g) => ({
        ...g,
        tickets: [...g.tickets].sort((a, b) => {
          const aLate = elapsedMinutes(a.confirmedAt) >= 15 ? 1 : 0;
          const bLate = elapsedMinutes(b.confirmedAt) >= 15 ? 1 : 0;
          if (aLate !== bLate) return bLate - aLate;
          return new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime();
        }),
      }));
  }, [stations, selectedCode]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-cream p-5 max-w-[1280px] mx-auto space-y-5">
        <Skeleton className="h-24 w-full rounded-[28px]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Skeleton className="h-72 rounded-[20px]" />
          <Skeleton className="h-72 rounded-[20px]" />
          <Skeleton className="h-72 rounded-[20px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <Toast message={toast} />

      <header className="bg-kitchen-gradient text-surface rounded-b-[28px] px-5 sm:px-8 py-5 shadow-card">
        <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-sun text-ink flex items-center justify-center">
              <ChefHat className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-[26px] font-extrabold leading-tight">Kitchen · Live orders</h1>
              <p className="text-[12px] text-mint">Operator: {user?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Chip active={selectedCode === 'all'} onClick={() => setSelectedCode('all')}>
              All stations
            </Chip>
            <Badge tone="sun">{totalActiveCount} active</Badge>
            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              aria-pressed={soundEnabled}
              className="min-h-[44px] px-3.5 rounded-full bg-surface/15 text-surface text-[13px] font-bold inline-flex items-center gap-1.5 hover:bg-surface/25 cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled ? 'Sound on' : 'Sound off'}
            </button>
            {(user?.role === 'owner' || user?.role === 'manager') && (
              <Link
                href="/admin"
                className="min-h-[44px] px-3.5 rounded-full bg-surface/15 text-surface text-[13px] font-bold inline-flex items-center"
              >
                Admin
              </Link>
            )}
            <button
              type="button"
              aria-label="Refresh kitchen queue"
              onClick={() => void loadQueue()}
              className="min-w-[44px] min-h-[44px] rounded-full bg-surface/15 text-surface inline-flex items-center justify-center hover:bg-surface/25 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Button variant="tomato" onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className="w-4 h-4" aria-hidden="true" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-5 sm:px-8 py-6 space-y-6">
        {/* Dynamic Station Filter Chips from DB */}
        <nav aria-label="Kitchen station filter" className="flex gap-2.5 overflow-x-auto pb-1">
          <Chip active={selectedCode === 'all'} onClick={() => setSelectedCode('all')}>
            All stations ({totalActiveCount})
          </Chip>
          {stations.map(({ station, tickets }) => (
            <Chip
              key={station.id}
              active={selectedCode === station.code}
              onClick={() => setSelectedCode(station.code)}
            >
              {station.name} ({tickets.length})
            </Chip>
          ))}
        </nav>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Skeleton className="h-64 rounded-[20px]" />
            <Skeleton className="h-64 rounded-[20px]" />
            <Skeleton className="h-64 rounded-[20px]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {visibleStations.map(({ station, tickets }) => (
              <section
                key={station.id}
                aria-label={station.name}
                className="bg-mint-bg/75 rounded-[24px] p-4 border border-mint space-y-4"
              >
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[18px] font-extrabold text-ink">{station.name}</h2>
                  <Badge tone={tickets.length > 0 ? 'leaf' : 'mint'}>{tickets.length} orders</Badge>
                </div>

                {tickets.length === 0 ? (
                  <Card className="p-6 text-center text-muted text-[14px]">
                    No active tickets for {station.name}.
                  </Card>
                ) : (
                  <div className="space-y-4" aria-live="polite">
                    {tickets.map((t) => {
                      const hasPending = t.items.some((it) => it.status !== 'ready');
                      return (
                        <Card key={t.orderId} className="p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[16px] font-extrabold text-ink">
                              {t.table?.label} · {t.orderNumber}
                            </span>
                            <TimerChip since={t.confirmedAt} />
                          </div>

                          {t.notes && (
                            <div className="bg-due-soon text-due-soon-ink rounded-[12px] p-2.5 text-[12px] font-bold flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                              <span>Note / Allergy: {t.notes}</span>
                            </div>
                          )}

                          <ul className="space-y-2.5">
                            {t.items.map((it) => (
                              <li key={it.id} className="bg-cream rounded-[14px] p-3 border border-mint space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-[15px] font-extrabold text-ink">
                                      {it.quantity}× {it.itemNameSnapshot}
                                    </div>
                                    {it.variantNameSnapshot && (
                                      <div className="text-[12px] text-muted">{it.variantNameSnapshot}</div>
                                    )}
                                    {it.specialInstructions && (
                                      <div className="text-[12px] font-bold text-tomato mt-1">
                                        Flag: {it.specialInstructions}
                                      </div>
                                    )}
                                  </div>
                                  <Badge tone={it.status === 'ready' ? 'mint' : 'sun'}>{it.status}</Badge>
                                </div>

                                {it.status === 'queued' && (
                                  <Button
                                    variant="mint"
                                    fullWidth
                                    onClick={() => void setItemStatus(it.id, 'preparing')}
                                  >
                                    Start preparing
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>

                          {hasPending && (
                            <Button
                              variant="sun"
                              fullWidth
                              onClick={() => void markTicketAllReady(t)}
                              className="min-h-[46px] text-[15px]"
                            >
                              Mark ready
                            </Button>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
