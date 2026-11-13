'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  PackageCheck,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { subscribeRealtime } from '@/lib/realtime-client';
import { Button, Card, Modal } from '@/components/ui';

export interface StockAlertItem {
  id: number;
  ingredientId: number;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  affectedDishes: string[] | unknown;
  createdAt: string;
  acknowledgedAt?: string | null;
  ingredient: {
    id: number;
    name: string;
    unit: string;
    stockStatus: string;
  };
  raisedBy: { id: number; name: string };
  acknowledgedBy?: { id: number; name: string } | null;
}

function playAlertChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Autoplay restrictions
  }
}

export function AlertsBanner({
  onRefreshData,
  showToast,
}: {
  onRefreshData: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const [alerts, setAlerts] = useState<StockAlertItem[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [dismissedBannerAlertIds, setDismissedBannerAlertIds] = useState<number[]>([]);
  const prevCountRef = useRef(0);

  // Acknowledge ("Yes, I ordered it") Modal State
  const [activeAlertForOrder, setActiveAlertForOrder] = useState<StockAlertItem | null>(null);
  const [orderForm, setOrderForm] = useState({
    quantity: '',
    unit: 'kg',
    totalCostRupees: '',
    supplier: '',
    notes: '',
    purchasedAt: '',
  });

  const loadAlerts = useCallback(async () => {
    try {
      const res = await apiFetch<{
        alerts: StockAlertItem[];
        openCount: number;
      }>('/api/inventory/alerts');

      const loaded = res.alerts || [];
      const currentOpen = res.openCount || 0;

      if (soundEnabled && currentOpen > prevCountRef.current) {
        playAlertChime();
      }
      prevCountRef.current = currentOpen;

      setAlerts(loaded);
      setOpenCount(currentOpen);
    } catch {
      // Background poll silently fails
    }
  }, [soundEnabled]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAlerts();
    }, 0);
    const unsub = subscribeRealtime(
      'staff',
      ['INVENTORY_STOCK_CHANGED', 'INVENTORY_STOCK_RECEIVED'],
      () => {
        void loadAlerts();
        void onRefreshData();
      },
      8000
    );

    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [loadAlerts, onRefreshData]);

  // First non-dismissed open alert for floating banner
  const bannerAlert = alerts.find(
    (a) => a.status === 'OPEN' && !dismissedBannerAlertIds.includes(a.id)
  );

  const handleOpenOrderModal = (alert: StockAlertItem) => {
    setActiveAlertForOrder(alert);
    setOrderForm({
      quantity: '10',
      unit: alert.ingredient.unit || 'kg',
      totalCostRupees: '',
      supplier: '',
      notes: '',
      purchasedAt: new Date().toISOString().slice(0, 16),
    });
  };

  const handleSubmitAcknowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlertForOrder) return;

    const qty = parseFloat(orderForm.quantity);
    const amount = parseFloat(orderForm.totalCostRupees);

    if (isNaN(qty) || qty <= 0) {
      showToast('Quantity must be greater than zero.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast('Total cost in rupees is required and must be greater than zero.');
      return;
    }

    try {
      await apiFetch(`/api/inventory/alerts/${activeAlertForOrder.id}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: qty,
          unit: orderForm.unit,
          totalCostRupees: amount,
          supplier: orderForm.supplier.trim() || undefined,
          notes: orderForm.notes.trim() || undefined,
          purchasedAt: orderForm.purchasedAt ? new Date(orderForm.purchasedAt).toISOString() : undefined,
        }),
      });

      showToast(`Stock order recorded for ${activeAlertForOrder.ingredient.name}. Status marked Ordered.`);
      setActiveAlertForOrder(null);
      await loadAlerts();
      await onRefreshData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record stock order');
    }
  };

  const handleReceiveStock = async (alertId: number, ingredientName: string) => {
    try {
      await apiFetch(`/api/inventory/alerts/${alertId}/receive`, {
        method: 'POST',
      });

      showToast(`Stock for ${ingredientName} marked Received! Dishes are available again.`);
      await loadAlerts();
      await onRefreshData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to mark stock received');
    }
  };

  const affectedList = (dishes: unknown) => {
    if (!dishes) return 'No dishes mapped';
    if (Array.isArray(dishes)) return dishes.join(', ');
    return String(dishes);
  };

  return (
    <div className="space-y-4">
      {/* REAL-TIME FLOATING BANNER (FOR EARLIEST OPEN ALERT) */}
      {bannerAlert && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-[20px] bg-tomato/15 border-2 border-tomato text-ink shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-tomato text-surface flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="font-extrabold text-[15px] text-ink leading-tight">
                {bannerAlert.ingredient.name} is out of stock!
              </p>
              <p className="text-[13px] text-muted font-bold">
                Affected dishes: <span className="text-tomato">{affectedList(bannerAlert.affectedDishes)}</span>. Have you ordered it?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setDismissedBannerAlertIds((prev) => [...prev, bannerAlert.id])}
              className="min-h-[40px] px-3.5 rounded-full bg-cream hover:bg-surface text-muted text-[13px] font-bold border border-leaf/15"
            >
              Remind me later
            </button>
            <Button
              variant="leaf"
              onClick={() => handleOpenOrderModal(bannerAlert)}
              className="min-h-[40px] px-4 text-[13px] font-extrabold shadow-sm"
            >
              Yes, I ordered it
            </Button>
          </div>
        </div>
      )}

      {/* ALERTS TAB CARD & LIST */}
      <Card className="p-5 space-y-4 shadow-card border border-leaf/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[12px] bg-sun text-ink flex items-center justify-center font-extrabold">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[17px] font-extrabold text-ink">Inventory Stock Alerts</h3>
                {openCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-tomato text-surface text-[11px] font-extrabold">
                    {openCount} Open
                  </span>
                )}
              </div>
              <p className="text-[12px] text-muted font-bold">
                Real-time kitchen alerts for out-of-stock raw materials
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled((s) => !s)}
              className="min-h-[38px] px-3 rounded-full bg-mint-bg text-leaf text-[12px] font-bold inline-flex items-center gap-1.5 hover:bg-mint transition"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {soundEnabled ? 'Alert chime on' : 'Alert chime off'}
            </button>
            <Button
              variant="mint"
              onClick={loadAlerts}
              className="min-h-[38px] px-3 text-[12px]"
              aria-label="Refresh alerts list"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* ALERTS LIST */}
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="py-8 text-center text-muted font-bold text-[13px]">
              <CheckCircle2 className="w-10 h-10 mx-auto text-leaf mb-2" />
              All ingredients in stock. No active inventory alerts.
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-[16px] border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition ${
                  alert.status === 'OPEN'
                    ? 'bg-tomato/5 border-tomato/30'
                    : alert.status === 'ACKNOWLEDGED'
                    ? 'bg-sun/10 border-sun/40'
                    : 'bg-mint-bg/40 border-leaf/20'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-extrabold text-ink">{alert.ingredient.name}</span>
                    {alert.status === 'OPEN' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-tomato text-surface text-[11px] font-extrabold">
                        Action Required
                      </span>
                    )}
                    {alert.status === 'ACKNOWLEDGED' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-sun text-ink text-[11px] font-extrabold">
                        Ordered (Awaiting Delivery)
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted">
                    Raised by <span className="text-ink font-bold">{alert.raisedBy.name}</span> •{' '}
                    {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-[12px] text-ink font-bold">
                    Dishes made unavailable: <span className="text-tomato">{affectedList(alert.affectedDishes)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {alert.status === 'OPEN' && (
                    <Button
                      variant="leaf"
                      onClick={() => handleOpenOrderModal(alert)}
                      className="min-h-[40px] px-4 text-[13px] font-extrabold"
                    >
                      Yes, I ordered it
                    </Button>
                  )}
                  {alert.status === 'ACKNOWLEDGED' && (
                    <Button
                      variant="sun"
                      onClick={() => handleReceiveStock(alert.id, alert.ingredient.name)}
                      className="min-h-[40px] px-4 text-[13px] font-extrabold inline-flex items-center gap-1.5"
                    >
                      <PackageCheck className="w-4 h-4" /> Received
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* "YES, I ORDERED IT" PURCHASE MODAL */}
      {activeAlertForOrder && (
        <Modal
          open={true}
          onClose={() => setActiveAlertForOrder(null)}
          title={`Order Stock: ${activeAlertForOrder.ingredient.name}`}
        >
          <form onSubmit={handleSubmitAcknowledge} className="space-y-4">
            <div className="p-3 rounded-[14px] bg-sun/20 text-ink text-[12px] font-bold">
              Submitting this form sets status to <span className="text-leaf">Ordered</span> and creates an audited raw-material purchase record.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-extrabold text-ink mb-1">
                  Quantity <span className="text-tomato">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={orderForm.quantity}
                  onChange={(e) => setOrderForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                />
              </div>

              <div>
                <label className="block text-[13px] font-extrabold text-ink mb-1">
                  Unit <span className="text-tomato">*</span>
                </label>
                <select
                  value={orderForm.unit}
                  onChange={(e) => setOrderForm((prev) => ({ ...prev, unit: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="l">l</option>
                  <option value="ml">ml</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                TOTAL AMOUNT PAID (₹ Rupees) <span className="text-tomato">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="10000000"
                required
                value={orderForm.totalCostRupees}
                onChange={(e) => setOrderForm((prev) => ({ ...prev, totalCostRupees: e.target.value }))}
                placeholder="e.g. 1850.00"
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              />
              <p className="text-[11px] text-muted mt-1">
                Stored in integer paise (never float) for financial audits.
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Supplier (Optional)
              </label>
              <input
                type="text"
                value={orderForm.supplier}
                onChange={(e) => setOrderForm((prev) => ({ ...prev, supplier: e.target.value }))}
                placeholder="e.g. Metro Wholesale, Amul Depot"
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              />
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={orderForm.notes}
                onChange={(e) => setOrderForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Expected delivery time or purchase details..."
                rows={2}
                className="w-full p-3 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[13px] font-bold resize-none"
              />
            </div>

            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button type="button" variant="mint" onClick={() => setActiveAlertForOrder(null)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button type="submit" variant="leaf" className="min-h-[44px] px-5">
                Confirm Order & Record Purchase
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
