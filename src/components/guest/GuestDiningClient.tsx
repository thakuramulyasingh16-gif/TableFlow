'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  CreditCard,
  Lock,
  Mail,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatInr } from '@/lib/format';
import { subscribeRealtime } from '@/lib/realtime-client';
import {
  Badge,
  Button,
  Card,
  Chip,
  Modal,
  Skeleton,
  StatusStepper,
  Toast,
  VegIndicator,
} from '@/components/ui';

interface Variant {
  id: number;
  name: string;
  priceDeltaPaise: number;
  isDefault: boolean;
}

interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  basePricePaise: number;
  isVeg: boolean;
  spiceLevel: string;
  allergens: string[];
  isAvailable: boolean;
  prepTimeMins?: number;
  variants: Variant[];
}

interface Category {
  id: number;
  name: string;
}

interface Deal {
  id: number;
  title: string;
  code?: string | null;
}

interface OrderItem {
  id: number;
  itemNameSnapshot: string;
  variantNameSnapshot?: string | null;
  quantity: number;
  lineTotalPaise: number;
  status: string;
}

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  totalPaise: number;
  createdAt: string;
  items: OrderItem[];
}

interface BillSummary {
  orders: Order[];
  subtotalPaise: number;
  discountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  ordersTotalPaise: number;
  remainingPaise: number;
  splits: { id: number; partNumber: number; totalParts: number; amountPaise: number; status: string }[];
  payments: { id: number; status: string }[];
}

interface CartItem {
  menuItemId: number;
  variantId: number | null;
  name: string;
  variantName: string | null;
  unitPricePaise: number;
  quantity: number;
}

interface MockCheckout {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  isMock: boolean;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SPICE_LABELS: Record<string, string> = {
  none: 'No spice',
  mild: 'Mild',
  medium: 'Medium',
  hot: 'Hot',
  extra_hot: 'Extra hot',
};

const STATUS_HEADLINES: Record<string, string> = {
  received: 'Order received',
  confirmed: 'Confirmed for kitchen',
  preparing: 'Chefs are cooking',
  ready: 'Ready for your table',
  served: 'Served — enjoy!',
};

export function GuestDiningClient({
  tableToken,
  initialView = 'menu',
}: {
  tableToken: string;
  initialView?: 'menu' | 'orders' | 'bill';
}) {
  const restaurantName = process.env.NEXT_PUBLIC_RESTAURANT_NAME || 'TableFlow Bistro';

  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState('');
  const [table, setTable] = useState<{ id: number; tableNumber: string; label: string; zone: string } | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [view, setView] = useState<'menu' | 'orders' | 'bill'>(initialView);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<number, number>>({});
  const [dealCode, setDealCode] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [bill, setBill] = useState<BillSummary | null>(null);
  const [splitType, setSplitType] = useState<'full' | 'equal' | 'by_item'>('full');
  const [equalParts, setEqualParts] = useState(2);
  const [selectedSplitItemIds, setSelectedSplitItemIds] = useState<number[]>([]);
  const [tipRupees, setTipRupees] = useState(0);

  const [waiterCooldown, setWaiterCooldown] = useState(0);
  const [toast, setToast] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [mockCheckout, setMockCheckout] = useState<MockCheckout | null>(null);
  const [paymentSuccessBanner, setPaymentSuccessBanner] = useState(false);
  const [requiresPin, setRequiresPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState('');
  const [billRequested, setBillRequested] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const handleRequestPrintedBill = async () => {
    try {
      await apiFetch('/api/guest/bill/request', { method: 'POST', csrf: true });
      setBillRequested(true);
      showToast('Staff has been notified for your printed bill');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to request bill');
    }
  };

  const refreshOrdersAndBill = useCallback(async () => {
    const [ordRes, billRes] = await Promise.all([
      apiFetch<{ orders: Order[] }>('/api/guest/orders'),
      apiFetch<BillSummary>('/api/guest/bill'),
    ]);
    setOrders(ordRes.orders || []);
    setBill(billRes);
  }, []);

  const loadMenuAndData = useCallback(async () => {
    const menuRes = await apiFetch<{ categories: Category[]; items: MenuItem[]; deals: Deal[] }>(
      '/api/guest/menu'
    );
    setCategories(menuRes.categories || []);
    setItems(menuRes.items || []);
    setDeals(menuRes.deals || []);

    const defMap: Record<number, number> = {};
    for (const it of menuRes.items || []) {
      const defVar = it.variants?.find((v) => v.isDefault) || it.variants?.[0];
      if (defVar) defMap[it.id] = defVar.id;
    }
    setSelectedVariants(defMap);

    await refreshOrdersAndBill();
  }, [refreshOrdersAndBill]);

  const handleJoinWithPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) return;
    setPinSubmitting(true);
    setPinError('');
    try {
      const init = await apiFetch<{
        table: { id: number; tableNumber: string; label: string; zone: string };
        session: { id: number };
      }>('/api/guest/session', {
        method: 'POST',
        body: { tableToken, pin: pinInput.trim() },
      });
      setTable(init.table);
      setSessionId(init.session.id);
      setRequiresPin(false);
      setLoading(true);
      await loadMenuAndData();
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Invalid table PIN');
    } finally {
      setPinSubmitting(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const init = await apiFetch<{
          table: { id: number; tableNumber: string; label: string; zone: string };
          session?: { id: number };
          requiresPin?: boolean;
        }>('/api/guest/session', {
          method: 'POST',
          body: { tableToken },
        });
        if (!active) return;
        setTable(init.table);

        if (init.requiresPin) {
          setRequiresPin(true);
          setLoading(false);
          return;
        }

        if (init.session) {
          setSessionId(init.session.id);
        }

        await loadMenuAndData();
      } catch (err) {
        if (active) setFatalError(err instanceof Error ? err.message : 'Unable to load table session');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tableToken, loadMenuAndData]);

  useEffect(() => {
    if (!sessionId) return;
    return subscribeRealtime(
      `table_session:${sessionId}`,
      ['order:updated', 'waiter:call_resolved', 'payment:captured'],
      () => {
        refreshOrdersAndBill().catch(() => {});
      }
    );
  }, [sessionId, refreshOrdersAndBill]);

  useEffect(() => {
    if (waiterCooldown <= 0) return;
    const id = setInterval(() => setWaiterCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [waiterCooldown]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (selectedCategory !== 'all' && String(it.categoryId) !== selectedCategory) return false;
      if (vegOnly && !it.isVeg) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!it.name.toLowerCase().includes(q) && !(it.description || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, selectedCategory, vegOnly, search]);

  function addToCart(item: MenuItem) {
    const variantId = selectedVariants[item.id] ?? null;
    const variant = item.variants?.find((v) => v.id === variantId) || null;
    const unitPricePaise = item.basePricePaise + (variant ? variant.priceDeltaPaise : 0);

    // Optimistic UI update; server always recomputes authoritative totals on submit
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.menuItemId === item.id && c.variantId === variantId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: Math.min(20, copy[idx].quantity + 1) };
        return copy;
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          variantId,
          name: item.name,
          variantName: variant?.name || null,
          unitPricePaise,
          quantity: 1,
        },
      ];
    });
    showToast(`Added ${item.name} to cart`);
  }

  function updateCartQty(idx: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c, i) => (i === idx ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  }

  const cartCount = cart.reduce((acc, c) => acc + c.quantity, 0);
  const cartEstSubtotal = cart.reduce((acc, c) => acc + c.unitPricePaise * c.quantity, 0);

  async function handlePlaceOrder() {
    if (cart.length === 0) return;
    setPlacingOrder(true);
    try {
      await apiFetch('/api/guest/orders', {
        method: 'POST',
        csrf: true,
        body: {
          items: cart.map((c) => ({
            menuItemId: c.menuItemId,
            variantId: c.variantId,
            quantity: c.quantity,
          })),
          dealCode: dealCode.trim() || undefined,
          notes: orderNotes.trim() || undefined,
        },
      });
      setCart([]);
      setOrderNotes('');
      setCartOpen(false);
      await refreshOrdersAndBill();
      setView('orders');
      showToast('Order placed! Tracking live updates.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to place order');
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleCallWaiter() {
    if (waiterCooldown > 0) return;
    try {
      const res = await apiFetch<{ cooldownSeconds: number }>('/api/guest/waiter-calls', {
        method: 'POST',
        csrf: true,
        body: { reason: 'Table assistance requested' },
      });
      setWaiterCooldown(res.cooldownSeconds || 60);
      showToast('Waiter notified! Someone will be right with you.');
    } catch (err) {
      const e = err as Error & { details?: { retryAfterSeconds?: number } };
      if (e.details?.retryAfterSeconds) setWaiterCooldown(e.details.retryAfterSeconds);
      showToast(e.message || 'Could not reach waiter');
    }
  }

  async function handleCreateSplit() {
    try {
      await apiFetch('/api/guest/bill/split', {
        method: 'POST',
        csrf: true,
        body: {
          splitType,
          ...(splitType === 'equal' ? { parts: equalParts } : {}),
          ...(splitType === 'by_item' ? { itemIds: selectedSplitItemIds } : {}),
        },
      });
      await refreshOrdersAndBill();
      showToast('Bill split updated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to split bill');
    }
  }

  async function startPayment(billSplitId: number | null = null) {
    try {
      const tipPaise = Math.max(0, Math.round(Number(tipRupees || 0) * 100));
      const orderData = await apiFetch<MockCheckout>('/api/guest/payments/create-order', {
        method: 'POST',
        csrf: true,
        body: { billSplitId, tipPaise },
      });

      if (orderData.isMock || typeof window.Razorpay !== 'function') {
        setMockCheckout(orderData);
        return;
      }

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency,
        name: restaurantName,
        description: `${table?.label || 'Table'} Bill Payment`,
        order_id: orderData.razorpayOrderId,
        config: {
          display: {
            sequence: ['block.upi', 'block.card', 'block.netbanking'],
            blocks: { upi: { name: 'Pay via UPI', instruments: [{ method: 'upi' }] } },
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await apiFetch('/api/guest/payments/verify', {
              method: 'POST',
              csrf: true,
              body: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                method: 'upi',
              },
            });
            setPaymentSuccessBanner(true);
            await refreshOrdersAndBill();
            showToast('Payment successful!');
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Payment verification failed');
          }
        },
      });
      rzp.open();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to initiate payment');
    }
  }

  async function completeMockPayment() {
    if (!mockCheckout) return;
    try {
      const enc = new TextEncoder();
      const paymentId = `pay_mock_${Date.now()}`;
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode('test_mock_secret'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await crypto.subtle.sign(
        'HMAC',
        key,
        enc.encode(`${mockCheckout.razorpayOrderId}|${paymentId}`)
      );
      const sigHex = Array.from(new Uint8Array(sigBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      await apiFetch('/api/guest/payments/verify', {
        method: 'POST',
        csrf: true,
        body: {
          razorpayOrderId: mockCheckout.razorpayOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: sigHex,
          method: 'upi',
        },
      });
      setMockCheckout(null);
      setPaymentSuccessBanner(true);
      await refreshOrdersAndBill();
      showToast('Test UPI Payment Verified!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  async function handleSendReceipt(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/guest/receipts/email', {
        method: 'POST',
        csrf: true,
        body: { email: receiptEmail },
      });
      showToast('GST Receipt sent!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send receipt');
    }
  }

  async function handleDeleteEmailPii() {
    try {
      await apiFetch('/api/guest/privacy/email', { method: 'DELETE', csrf: true });
      setReceiptEmail('');
      showToast('Your email was deleted from our records.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to delete email');
    }
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return;
    try {
      await apiFetch('/api/guest/reviews', {
        method: 'POST',
        csrf: true,
        body: { rating, comment: reviewComment || undefined },
      });
      setReviewSubmitted(true);
      showToast('Thank you for rating your meal!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not submit review');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream max-w-md mx-auto pb-20">
        <div className="bg-signature-gradient rounded-b-[28px] p-5 space-y-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-11 w-24 rounded-full" />
            <Skeleton className="h-11 w-28 rounded-full" />
            <Skeleton className="h-11 w-24 rounded-full" />
          </div>
          <Skeleton className="h-32 w-full rounded-[20px]" />
          <Skeleton className="h-32 w-full rounded-[20px]" />
          <Skeleton className="h-32 w-full rounded-[20px]" />
        </div>
      </div>
    );
  }

  if (requiresPin) {
    return (
      <main className="min-h-screen bg-cream flex items-center justify-center p-5">
        <Card className="p-6 max-w-sm w-full text-center space-y-4 shadow-card">
          <div className="w-12 h-12 mx-auto rounded-full bg-mint-bg flex items-center justify-center text-leaf">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <span className="px-3 py-1 rounded-full bg-ink text-sun-soft text-[12px] font-extrabold inline-block mb-2">
              {table?.label || 'Table'}
            </span>
            <h1 className="text-[22px] font-extrabold text-ink">Enter Table PIN</h1>
            <p className="text-[13px] text-muted mt-1">
              A dining session is already active for this table. Ask your waiter or dining partner for the 4-digit PIN to join.
            </p>
          </div>

          <form onSubmit={handleJoinWithPin} className="space-y-3">
            <label htmlFor="table-pin-input" className="sr-only">Table PIN</label>
            <input
              id="table-pin-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="4-digit PIN"
              className="w-full text-center tracking-[0.3em] font-mono text-[22px] font-extrabold min-h-[48px] px-4 py-2 rounded-[14px] bg-surface text-ink border-2 border-mint focus:border-leaf outline-none"
            />

            {pinError && (
              <p className="text-[12px] font-bold text-tomato" role="alert">
                {pinError}
              </p>
            )}

            <Button
              type="submit"
              variant="leaf"
              fullWidth
              disabled={pinSubmitting || pinInput.trim().length < 4}
            >
              {pinSubmitting ? 'Joining...' : 'Join Table Session'}
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  if (fatalError) {
    return (
      <main className="min-h-screen bg-cream flex items-center justify-center p-5">
        <Card className="p-6 max-w-sm w-full text-center space-y-3">
          <Badge tone="tomato">QR Unavailable</Badge>
          <h1 className="text-[22px] font-extrabold text-ink">Unable to open table</h1>
          <p className="text-[14px] text-muted">{fatalError}</p>
        </Card>
      </main>
    );
  }

  const latestOrder = orders[0] || null;
  const allSessionItems = bill?.orders?.flatMap((o) => o.items || []) || [];
  const hasCapturedPayment = bill?.payments?.some((p) => p.status === 'captured') || paymentSuccessBanner;

  return (
    <div className="min-h-screen bg-cream max-w-md mx-auto pb-36 relative">
      <Toast message={toast} />

      {/* SCREEN A HEADER: MENU / BILL */}
      {view !== 'orders' && (
        <header className="bg-signature-gradient rounded-b-[28px] p-5 shadow-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold text-leaf uppercase tracking-wider">Welcome to</p>
              <h1 className="text-[24px] font-extrabold text-ink leading-tight">{restaurantName}</h1>
              <p className="text-[12px] font-medium text-muted mt-0.5">{table?.zone}</p>
            </div>
            <span className="px-3.5 py-2 rounded-full bg-ink text-sun-soft text-[13px] font-extrabold shrink-0">
              {table?.label}
            </span>
          </div>

          {view === 'menu' && (
            <div className="relative">
              <label htmlFor="guest-menu-search" className="sr-only">
                Search menu dishes
              </label>
              <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="guest-menu-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search paneer, biryani, coolers..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-[14px] bg-surface text-ink placeholder:text-muted text-[14px] shadow-sm border border-mint"
              />
            </div>
          )}

          {/* Sub-navigation pills */}
          <nav aria-label="Guest dining sections" className="grid grid-cols-3 gap-2">
            <Chip active={view === 'menu'} onClick={() => setView('menu')}>
              Menu
            </Chip>
            <Chip active={false} onClick={() => setView('orders')}>
              Track ({orders.length})
            </Chip>
            <Chip active={view === 'bill'} onClick={() => setView('bill')}>
              Bill &amp; Pay
            </Chip>
          </nav>
        </header>
      )}

      {/* SCREEN B HEADER: ORDER TRACKING */}
      {view === 'orders' && (
        <header className="bg-signature-gradient rounded-b-[28px] p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setView('menu')}
              className="min-h-[44px] px-3 rounded-full bg-surface/85 text-ink font-bold text-[13px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Menu
            </button>
            <span className="px-3 py-1.5 rounded-full bg-ink text-sun-soft text-[12px] font-extrabold">
              {table?.label} {latestOrder ? `· ${latestOrder.orderNumber}` : ''}
            </span>
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold text-ink leading-tight" aria-live="polite">
              {latestOrder ? STATUS_HEADLINES[latestOrder.status] || 'Order in progress' : 'No active orders yet'}
            </h1>
            <p className="text-[13px] font-bold text-leaf mt-1">
              {latestOrder
                ? latestOrder.status === 'served'
                  ? 'Delivered to your table'
                  : 'Estimated prep time: 12–18 mins'
                : 'Pick dishes from the menu to start cooking'}
            </p>
          </div>
          <nav aria-label="Guest order views" className="grid grid-cols-3 gap-2">
            <Chip active={false} onClick={() => setView('menu')}>
              Menu
            </Chip>
            <Chip active={true} onClick={() => setView('orders')}>
              Track ({orders.length})
            </Chip>
            <Chip active={false} onClick={() => setView('bill')}>
              Bill &amp; Pay
            </Chip>
          </nav>
        </header>
      )}

      {/* VIEW: MENU */}
      {view === 'menu' && (
        <main className="px-5 pt-5 space-y-5">
          {/* Deals row */}
          {deals.length > 0 && (
            <section aria-label="Deals and offers" className="flex gap-2.5 overflow-x-auto pb-1">
              {deals.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    if (d.code) {
                      setDealCode(d.code);
                      showToast(`Offer ${d.code} applied to checkout!`);
                    }
                  }}
                  className="min-h-[44px] shrink-0 text-left px-4 py-2.5 rounded-[16px] bg-leaf text-surface shadow-card cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-sun-soft">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> {d.code || 'OFFER'}
                  </div>
                  <div className="text-[13px] font-bold mt-0.5">{d.title}</div>
                </button>
              ))}
            </section>
          )}

          {/* Category chips */}
          <section aria-label="Menu categories" className="flex gap-2 overflow-x-auto pb-1">
            <Chip active={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>
              All dishes
            </Chip>
            <Chip active={vegOnly} onClick={() => setVegOnly((v) => !v)}>
              Veg only
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={selectedCategory === String(c.id)}
                onClick={() => setSelectedCategory(String(c.id))}
              >
                {c.name}
              </Chip>
            ))}
          </section>

          {/* Dish cards */}
          <section aria-label="Dishes" className="space-y-4">
            {filteredItems.length === 0 ? (
              <Card className="p-6 text-center space-y-2">
                <UtensilsCrossed className="w-7 h-7 text-leaf mx-auto" aria-hidden="true" />
                <p className="font-bold text-ink">No matching dishes</p>
                <p className="text-[13px] text-muted">Try clearing your search or category filter.</p>
              </Card>
            ) : (
              filteredItems.map((item) => {
                const activeVarId = selectedVariants[item.id];
                const activeVar = item.variants?.find((v) => v.id === activeVarId);
                const price = item.basePricePaise + (activeVar ? activeVar.priceDeltaPaise : 0);
                const spiceText = SPICE_LABELS[item.spiceLevel] || 'Mild';
                const allergyText =
                  Array.isArray(item.allergens) && item.allergens.length > 0
                    ? ` · Contains ${item.allergens.join(', ')}`
                    : '';

                return (
                  <Card
                    key={item.id}
                    className={`p-3.5 flex gap-3.5 ${!item.isAvailable ? 'opacity-65' : ''}`}
                  >
                    {item.imageUrl && !brokenImages[item.id] ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        onError={() => setBrokenImages((b) => ({ ...b, [item.id]: true }))}
                        className="w-[92px] h-[92px] rounded-[16px] object-cover shrink-0 bg-dish-placeholder"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="w-[92px] h-[92px] rounded-[16px] bg-dish-placeholder shrink-0 flex items-center justify-center text-leaf"
                      >
                        <UtensilsCrossed className="w-7 h-7" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <VegIndicator isVeg={item.isVeg} />
                            <h2 className="text-[16px] font-extrabold text-ink leading-snug">{item.name}</h2>
                          </div>
                        </div>

                        <p className="text-[12px] text-muted mt-1">
                          Spice: {spiceText}
                          {allergyText}
                        </p>

                        {item.variants && item.variants.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Size options for ${item.name}`}>
                            {item.variants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => setSelectedVariants((prev) => ({ ...prev, [item.id]: v.id }))}
                                className={`min-h-[32px] px-2.5 py-1 rounded-full text-[12px] font-bold cursor-pointer transition ${
                                  activeVarId === v.id
                                    ? 'bg-butter text-ink border border-leaf'
                                    : 'bg-mint-bg text-leaf'
                                }`}
                              >
                                {v.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[17px] font-extrabold text-ink">{formatInr(price)}</span>
                        {!item.isAvailable ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-full bg-tomato/15 text-tomato text-[12px] font-bold tracking-tight">
                              Currently unavailable
                            </span>
                            <Button
                              variant="mint"
                              disabled={true}
                              className="px-3 text-[13px] opacity-70 cursor-not-allowed"
                              aria-label={`${item.name} is currently unavailable`}
                            >
                              Unavailable
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="sun"
                            onClick={() => addToCart(item)}
                            className="px-4"
                            aria-label={`Add ${item.name} to order`}
                          >
                            + Add
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </section>
        </main>
      )}

      {/* VIEW: ORDER TRACKING */}
      {view === 'orders' && (
        <main className="px-5 pt-5 space-y-5">
          {orders.length === 0 ? (
            <Card className="p-6 text-center space-y-3">
              <UtensilsCrossed className="w-8 h-8 text-leaf mx-auto" aria-hidden="true" />
              <h2 className="text-[18px] font-extrabold text-ink">Nothing cooking yet</h2>
              <p className="text-[14px] text-muted">Browse the menu and place your first order.</p>
              <Button variant="sun" fullWidth onClick={() => setView('menu')}>
                Explore Menu
              </Button>
            </Card>
          ) : (
            orders.map((ord, idx) => (
              <div key={ord.id} className="space-y-4">
                <Card className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-extrabold text-ink">
                      {idx === 0 ? 'Latest Order' : 'Earlier Order'} · {ord.orderNumber}
                    </span>
                    <Badge tone={ord.status === 'served' ? 'mint' : 'sun'}>{ord.status}</Badge>
                  </div>
                  <StatusStepper status={ord.status} />
                </Card>

                <section aria-label="Your items" className="bg-mint-bg rounded-[20px] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-extrabold text-ink">Your items</h2>
                    <span className="text-[14px] font-extrabold text-leaf">{formatInr(ord.totalPaise)}</span>
                  </div>
                  <ul className="divide-y divide-mint space-y-1.5 text-[14px]">
                    {ord.items.map((it) => (
                      <li key={it.id} className="pt-1.5 flex items-center justify-between gap-2">
                        <span className="text-ink font-medium">
                          {it.quantity}× {it.itemNameSnapshot}
                          {it.variantNameSnapshot ? ` (${it.variantNameSnapshot})` : ''}
                        </span>
                        <Badge tone={it.status === 'ready' || it.status === 'served' ? 'mint' : 'sun'}>
                          {it.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            ))
          )}

          {/* Bottom Order Tracking actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline-tomato" onClick={handleCallWaiter} disabled={waiterCooldown > 0}>
              <BellRing className="w-4 h-4" aria-hidden="true" />
              {waiterCooldown > 0 ? `Wait ${waiterCooldown}s` : 'Call waiter'}
            </Button>
            <Button variant="leaf" onClick={() => setView('bill')}>
              <CreditCard className="w-4 h-4" aria-hidden="true" /> Split bill &amp; pay
            </Button>
          </div>

          <p className="text-center text-[12px] text-muted">
            Direct link:{' '}
            <Link href={`/t/${tableToken}/orders`} className="underline text-leaf font-bold">
              /t/{tableToken.slice(0, 10)}…/orders
            </Link>
          </p>
        </main>
      )}

      {/* VIEW: BILL, SPLIT, TIP, PAY, RECEIPT & RATING */}
      {view === 'bill' && (
        <main className="px-5 pt-5 space-y-4">
          {!bill || bill.ordersTotalPaise === 0 ? (
            <Card className="p-6 text-center space-y-3">
              <Receipt className="w-8 h-8 text-leaf mx-auto" aria-hidden="true" />
              <h2 className="text-[18px] font-extrabold text-ink">No bill generated yet</h2>
              <p className="text-[14px] text-muted">Place an order to review your itemized GST bill.</p>
              <Button variant="sun" fullWidth onClick={() => setView('menu')}>
                Go to Menu
              </Button>
            </Card>
          ) : (
            <>
              <Card className="p-5 space-y-2.5 text-[14px]">
                <div className="flex items-center gap-2 text-[17px] font-extrabold text-ink mb-1">
                  <Receipt className="w-5 h-5 text-leaf" aria-hidden="true" /> GST Bill Breakup
                </div>
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="font-bold text-ink">{formatInr(bill.subtotalPaise)}</span>
                </div>
                {bill.discountPaise > 0 && (
                  <div className="flex justify-between text-veg-green font-bold">
                    <span>Promo Discount</span>
                    <span>-{formatInr(bill.discountPaise)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted">
                  <span>CGST (2.5%)</span>
                  <span>{formatInr(bill.cgstPaise)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>SGST (2.5%)</span>
                  <span>{formatInr(bill.sgstPaise)}</span>
                </div>
                <div className="pt-3 border-t border-mint flex justify-between text-[18px] font-extrabold text-ink">
                  <span>Remaining Payable</span>
                  <span>{formatInr(bill.remainingPaise)}</span>
                </div>
              </Card>

              {bill.remainingPaise > 0 && (
                <Card className="p-5 space-y-4">
                  <div>
                    <p className="text-[13px] font-extrabold text-ink mb-2">Split bill</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'full', label: 'Full bill' },
                          { id: 'equal', label: 'Equal' },
                          { id: 'by_item', label: 'By item' },
                        ] as const
                      ).map((opt) => (
                        <Chip key={opt.id} active={splitType === opt.id} onClick={() => setSplitType(opt.id)}>
                          {opt.label}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  {splitType === 'equal' && (
                    <div className="flex items-center justify-between gap-3 bg-mint-bg p-3 rounded-[14px]">
                      <label htmlFor="equal-parts-input" className="text-[13px] font-bold text-ink">
                        Number of guests
                      </label>
                      <input
                        id="equal-parts-input"
                        type="number"
                        min={2}
                        max={10}
                        value={equalParts}
                        onChange={(e) => setEqualParts(Number(e.target.value))}
                        className="w-20 min-h-[44px] px-3 rounded-[12px] bg-surface border border-mint text-center font-bold text-ink"
                      />
                    </div>
                  )}

                  {splitType === 'by_item' && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto bg-mint-bg rounded-[14px] p-3">
                      {allSessionItems.map((it) => (
                        <label key={it.id} className="flex items-center justify-between text-[13px] py-1.5 min-h-[44px] cursor-pointer">
                          <span className="flex items-center gap-2 font-medium text-ink">
                            <input
                              type="checkbox"
                              checked={selectedSplitItemIds.includes(it.id)}
                              onChange={(e) =>
                                setSelectedSplitItemIds((prev) =>
                                  e.target.checked ? [...prev, it.id] : prev.filter((id) => id !== it.id)
                                )
                              }
                              className="w-4 h-4 accent-leaf"
                            />
                            {it.quantity}× {it.itemNameSnapshot}
                          </span>
                          <span className="font-bold text-ink">{formatInr(it.lineTotalPaise)}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {splitType !== 'full' && (
                    <Button variant="mint" fullWidth onClick={handleCreateSplit}>
                      Calculate Split Amounts
                    </Button>
                  )}

                  <div>
                    <p className="text-[13px] font-extrabold text-ink mb-2">Add a tip (optional)</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 20, 50, 100].map((amt) => (
                        <Chip key={amt} active={tipRupees === amt} onClick={() => setTipRupees(amt)}>
                          {amt === 0 ? '₹0' : `₹${amt}`}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  {bill.splits?.length > 0 ? (
                    <div className="space-y-2.5">
                      {bill.splits.map((sp) => (
                        <div
                          key={sp.id}
                          className="flex items-center justify-between p-3.5 rounded-[16px] bg-mint-bg"
                        >
                          <div>
                            <div className="text-[12px] font-bold text-leaf">
                              Share {sp.partNumber} of {sp.totalParts}
                            </div>
                            <div className="text-[17px] font-extrabold text-ink">{formatInr(sp.amountPaise)}</div>
                          </div>
                          {sp.status === 'paid' ? (
                            <Badge tone="mint">
                              <CheckCircle2 className="w-4 h-4" /> Paid
                            </Badge>
                          ) : (
                            <Button variant="leaf" onClick={() => startPayment(sp.id)}>
                              Pay UPI
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Button variant="leaf" fullWidth onClick={() => startPayment(null)}>
                      Pay {formatInr(bill.remainingPaise + tipRupees * 100)} via Razorpay (UPI)
                    </Button>
                  )}

                  <Button
                    variant="mint"
                    fullWidth
                    onClick={handleRequestPrintedBill}
                    disabled={billRequested}
                  >
                    {billRequested ? 'Printed Bill Requested' : 'Ask Waiter for Printed Bill'}
                  </Button>
                </Card>
              )}

              {hasCapturedPayment && (
                <div className="space-y-4">
                  <Card className="p-5 bg-mint-bg space-y-2">
                    <div className="flex items-center gap-2 text-leaf font-extrabold text-[17px]">
                      <CheckCircle2 className="w-5 h-5" /> Payment Complete!
                    </div>
                    <p className="text-[13px] text-ink">
                      Thank you for dining with {restaurantName}. Get your GST invoice or leave a quick rating below.
                    </p>
                  </Card>

                  <Card className="p-5 space-y-3">
                    <div className="flex items-center gap-2 font-extrabold text-ink text-[15px]">
                      <Mail className="w-4 h-4 text-leaf" /> Email GST Receipt
                    </div>
                    <form onSubmit={handleSendReceipt} className="flex gap-2">
                      <label htmlFor="receipt-email" className="sr-only">
                        Email address for GST receipt
                      </label>
                      <input
                        id="receipt-email"
                        type="email"
                        required
                        value={receiptEmail}
                        onChange={(e) => setReceiptEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="flex-1 min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                      />
                      <Button type="submit" variant="sun">
                        Send
                      </Button>
                    </form>
                    <button
                      type="button"
                      onClick={handleDeleteEmailPii}
                      className="min-h-[44px] inline-flex items-center gap-1.5 text-[12px] font-bold text-tomato cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete my stored email (privacy)
                    </button>
                  </Card>

                  <Card className="p-5 space-y-3">
                    <h2 className="font-extrabold text-ink text-[15px]">Rate your meal</h2>
                    {reviewSubmitted ? (
                      <Badge tone="mint">Thanks for your {rating}-star review!</Badge>
                    ) : (
                      <form onSubmit={handleSubmitReview} className="space-y-3">
                        <div className="flex gap-1.5" role="radiogroup" aria-label="Star rating">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              type="button"
                              key={n}
                              aria-label={`${n} stars`}
                              onClick={() => setRating(n)}
                              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full hover:bg-mint-bg cursor-pointer"
                            >
                              <Star
                                className={`w-7 h-7 ${
                                  n <= rating ? 'fill-sun text-leaf' : 'text-muted/40'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <label htmlFor="review-notes" className="sr-only">
                          Optional review comment
                        </label>
                        <textarea
                          id="review-notes"
                          rows={2}
                          maxLength={500}
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Optional note for our kitchen team..."
                          className="w-full p-3 rounded-[14px] bg-cream border border-mint text-ink text-[14px]"
                        />
                        <Button type="submit" variant="leaf" fullWidth disabled={!rating}>
                          Submit Review
                        </Button>
                      </form>
                    )}
                  </Card>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* Floating Call Waiter Pill (Menu view, positioned right above bottom cart bar) */}
      {view === 'menu' && (
        <div
          className={`fixed right-5 z-40 transition-all duration-150 ${
            cartCount > 0 ? 'bottom-24' : 'bottom-5'
          }`}
        >
          <Button
            variant="tomato"
            onClick={handleCallWaiter}
            disabled={waiterCooldown > 0}
            className="rounded-full shadow-card px-4"
          >
            <BellRing className="w-4 h-4" aria-hidden="true" />
            {waiterCooldown > 0 ? `Wait ${waiterCooldown}s` : 'Call waiter'}
          </Button>
        </div>
      )}

      {/* Sticky Bottom Cart Bar */}
      {cartCount > 0 && view === 'menu' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-[calc(28rem-2.5rem)] z-40">
          <div className="bg-leaf text-surface rounded-[18px] shadow-card p-2.5 pl-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[14px] font-bold">
              <ShoppingBag className="w-4 h-4 text-sun" aria-hidden="true" />
              <span>
                {cartCount} {cartCount === 1 ? 'item' : 'items'} · {formatInr(cartEstSubtotal)}
              </span>
            </div>
            <Button variant="sun" onClick={() => setCartOpen(true)} className="px-4">
              View cart
            </Button>
          </div>
        </div>
      )}

      {/* Cart & Checkout Sheet Modal */}
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Your Order Cart" variant="sheet">
        <div className="space-y-4">
          <div className="divide-y divide-mint">
            {cart.map((c, idx) => (
              <div key={`${c.menuItemId}-${c.variantId}`} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-extrabold text-[15px] text-ink">{c.name}</div>
                  {c.variantName && <div className="text-[12px] text-muted">{c.variantName}</div>}
                  <div className="text-[14px] font-bold text-leaf mt-0.5">
                    {formatInr(c.unitPricePaise * c.quantity)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Decrease quantity of ${c.name}`}
                    onClick={() => updateCartQty(idx, -1)}
                    className="min-w-[44px] min-h-[44px] rounded-[12px] bg-mint-bg text-leaf inline-flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-[15px] font-extrabold w-6 text-center">{c.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Increase quantity of ${c.name}`}
                    onClick={() => updateCartQty(idx, 1)}
                    className="min-w-[44px] min-h-[44px] rounded-[12px] bg-sun text-ink inline-flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2.5">
            <div>
              <label htmlFor="checkout-deal" className="block text-[12px] font-bold text-muted mb-1">
                Promo code (optional)
              </label>
              <input
                id="checkout-deal"
                type="text"
                value={dealCode}
                onChange={(e) => setDealCode(e.target.value)}
                placeholder="e.g. WELCOME10"
                className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
              />
            </div>
            <div>
              <label htmlFor="checkout-notes" className="block text-[12px] font-bold text-muted mb-1">
                Kitchen &amp; allergy notes (optional)
              </label>
              <input
                id="checkout-notes"
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="e.g. Less spicy, nut allergy"
                className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
              />
            </div>
          </div>

          <div className="bg-mint-bg rounded-[14px] p-3 text-[12px] text-leaf font-bold">
            Final GST (5%) &amp; promo discounts are calculated securely on our server when you place the order.
          </div>

          <Button variant="leaf" fullWidth disabled={placingOrder} onClick={handlePlaceOrder}>
            {placingOrder ? 'Sending to kitchen...' : `Place Order · Est. ${formatInr(cartEstSubtotal)} + GST`}
          </Button>
        </div>
      </Modal>

      {/* Razorpay Test Mode Simulator Modal */}
      <Modal
        open={Boolean(mockCheckout)}
        onClose={() => setMockCheckout(null)}
        title="Razorpay Test UPI Checkout"
      >
        {mockCheckout && (
          <div className="space-y-4">
            <Badge tone="sun">Test Mode Simulator</Badge>
            <p className="text-[18px] font-extrabold text-ink">
              Amount: {formatInr(mockCheckout.amountPaise)}
            </p>
            <p className="text-[12px] text-muted">Order Ref: {mockCheckout.razorpayOrderId}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="mint" onClick={() => setMockCheckout(null)}>
                Cancel
              </Button>
              <Button variant="leaf" onClick={completeMockPayment}>
                Simulate UPI Pay
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

