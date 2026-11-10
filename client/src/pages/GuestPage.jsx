import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BellRing,
  CheckCircle2,
  Flame,
  Mail,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Utensils,
} from 'lucide-react';
import { apiRequest } from '../lib/api.js';
import { createGuestSocket } from '../lib/socket.js';
import { formatInr, SPICE_BADGE } from '../lib/format.js';

const STATUS_STEPS = ['received', 'preparing', 'ready', 'served'];

function normalizeStep(status) {
  if (status === 'confirmed') return 'received';
  return status;
}

export default function GuestPage() {
  const { tableToken } = useParams();
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState('');
  const [table, setTable] = useState(null);
  const [tab, setTab] = useState('menu');

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [deals, setDeals] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [search, setSearch] = useState('');

  const [cart, setCart] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [dealCode, setDealCode] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  const [orders, setOrders] = useState([]);
  const [bill, setBill] = useState(null);
  const [splitType, setSplitType] = useState('full');
  const [equalParts, setEqualParts] = useState(2);
  const [selectedSplitItemIds, setSelectedSplitItemIds] = useState([]);
  const [tipRupees, setTipRupees] = useState(0);

  const [waiterCooldown, setWaiterCooldown] = useState(0);
  const [toast, setToast] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [mockCheckout, setMockCheckout] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const refreshOrdersAndBill = useCallback(async () => {
    const [ordRes, billRes] = await Promise.all([
      apiRequest('/guest/orders'),
      apiRequest('/guest/bill'),
    ]);
    setOrders(ordRes.orders || []);
    setBill(billRes);
  }, []);

  useEffect(() => {
    let socket;
    let active = true;
    (async () => {
      try {
        const init = await apiRequest('/guest/sessions/init', {
          method: 'POST',
          body: { tableToken },
        });
        if (!active) return;
        setTable(init.table);

        const menuRes = await apiRequest('/guest/menu');
        if (!active) return;
        setCategories(menuRes.categories || []);
        setItems(menuRes.items || []);
        setDeals(menuRes.deals || []);

        const defaultMap = {};
        for (const it of menuRes.items || []) {
          const defVar = it.variants?.find((v) => v.is_default) || it.variants?.[0];
          if (defVar) defaultMap[it.id] = defVar.id;
        }
        setSelectedVariants(defaultMap);

        await refreshOrdersAndBill();

        socket = createGuestSocket();
        socket.on('order:updated', () => {
          refreshOrdersAndBill().catch(() => {});
        });
        socket.on('waiter:call_resolved', () => {
          showToast('A waiter is on the way to your table!');
        });
        socket.on('payment:captured', () => {
          refreshOrdersAndBill().catch(() => {});
          showToast('Payment received! Thank you.');
        });
      } catch (err) {
        if (active) setFatalError(err.message || 'Unable to load table session');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (socket) socket.disconnect();
    };
  }, [tableToken, refreshOrdersAndBill, showToast]);

  useEffect(() => {
    if (waiterCooldown <= 0) return;
    const id = setInterval(() => {
      setWaiterCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [waiterCooldown]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (selectedCategory !== 'all' && String(it.category_id) !== String(selectedCategory)) return false;
      if (vegOnly && !it.is_veg) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!it.name.toLowerCase().includes(q) && !(it.description || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, selectedCategory, vegOnly, search]);

  function addToCart(item) {
    const variantId = selectedVariants[item.id] || null;
    const variant = item.variants?.find((v) => v.id === variantId) || null;
    const unitPricePaise = item.base_price_paise + (variant ? variant.price_delta_paise : 0);

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
          specialInstructions: '',
        },
      ];
    });
    showToast(`Added ${item.name} to cart`);
  }

  function updateCartQty(idx, delta) {
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
      await apiRequest('/guest/orders', {
        method: 'POST',
        csrf: true,
        body: {
          items: cart.map((c) => ({
            menuItemId: c.menuItemId,
            variantId: c.variantId,
            quantity: c.quantity,
            specialInstructions: c.specialInstructions || undefined,
          })),
          dealCode: dealCode.trim() || undefined,
          notes: orderNotes.trim() || undefined,
        },
      });
      setCart([]);
      setOrderNotes('');
      setCartOpen(false);
      await refreshOrdersAndBill();
      setTab('orders');
      showToast('Order placed! Waiting for staff confirmation.');
    } catch (err) {
      showToast(err.message);
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleCallWaiter() {
    if (waiterCooldown > 0) return;
    try {
      const res = await apiRequest('/guest/waiter-calls', {
        method: 'POST',
        csrf: true,
        body: { reason: 'Table assistance requested' },
      });
      setWaiterCooldown(res.cooldownSeconds || 60);
      showToast('Waiter notified!');
    } catch (err) {
      if (err.details?.retryAfterSeconds) {
        setWaiterCooldown(err.details.retryAfterSeconds);
      }
      showToast(err.message);
    }
  }

  async function handleCreateSplit() {
    try {
      await apiRequest('/guest/bill/split', {
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
      showToast(err.message);
    }
  }

  async function startPayment(billSplitId = null) {
    try {
      const tipPaise = Math.max(0, Math.round(Number(tipRupees || 0) * 100));
      const orderData = await apiRequest('/guest/payments/create-order', {
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
        name: 'TableFlow Restaurant',
        description: `${table?.label || 'Table'} Bill Payment`,
        order_id: orderData.razorpayOrderId,
        config: {
          display: {
            sequence: ['block.upi', 'block.card', 'block.netbanking'],
            blocks: {
              upi: { name: 'Pay via UPI', instruments: [{ method: 'upi' }] },
            },
          },
        },
        handler: async (response) => {
          try {
            await apiRequest('/guest/payments/verify', {
              method: 'POST',
              csrf: true,
              body: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                method: 'upi',
              },
            });
            await refreshOrdersAndBill();
            showToast('Payment successful!');
          } catch (err) {
            showToast(err.message);
          }
        },
      });
      rzp.open();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function completeMockPayment() {
    if (!mockCheckout) return;
    try {
      // Compute test-mode signature using Web Crypto HMAC-SHA256 with test_mock_secret only when server runs in mock mode
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

      await apiRequest('/guest/payments/verify', {
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
      await refreshOrdersAndBill();
      showToast('Test UPI Payment Verified!');
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleSendReceipt(e) {
    e.preventDefault();
    try {
      await apiRequest('/guest/receipts/email', {
        method: 'POST',
        csrf: true,
        body: { email: receiptEmail },
      });
      showToast('GST Receipt sent to your email!');
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleDeleteEmailPii() {
    try {
      await apiRequest('/guest/privacy/email', { method: 'DELETE', csrf: true });
      setReceiptEmail('');
      showToast('Your email was scrubbed from our records.');
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleSubmitReview(e) {
    e.preventDefault();
    if (!rating) return;
    try {
      await apiRequest('/guest/reviews', {
        method: 'POST',
        csrf: true,
        body: { rating, comment: reviewComment || undefined },
      });
      setReviewSubmitted(true);
      showToast('Thanks for your feedback!');
    } catch (err) {
      showToast(err.message);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-stone-600">Loading your table menu...</div>;
  }

  if (fatalError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-bold text-stone-900">QR Code Unavailable</h1>
        <p className="text-stone-600 mt-2 max-w-sm">{fatalError}</p>
      </div>
    );
  }

  const allSessionItems = bill?.orders?.flatMap((o) => o.items || []) || [];
  const hasCapturedPayment = bill?.payments?.some((p) => p.status === 'captured');

  return (
    <div className="min-h-screen bg-stone-50 pb-28 max-w-2xl mx-auto">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-amber-600" />
              <span className="font-bold text-stone-900">TableFlow</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                {table?.label} • {table?.zone}
              </span>
            </div>
          </div>
          <button
            onClick={handleCallWaiter}
            disabled={waiterCooldown > 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-semibold shadow-sm hover:bg-rose-700 disabled:bg-stone-300 disabled:text-stone-600 transition"
          >
            <BellRing className="w-3.5 h-3.5" />
            {waiterCooldown > 0 ? `Wait ${waiterCooldown}s` : 'Call Waiter'}
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 bg-stone-100 p-1 rounded-xl">
          {[
            { id: 'menu', label: 'Menu' },
            { id: 'orders', label: `Orders (${orders.length})` },
            { id: 'bill', label: 'Bill & Pay' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition ${
                tab === t.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-stone-900 text-white text-xs font-medium shadow-lg">
          {toast}
        </div>
      )}

      {/* MENU TAB */}
      {tab === 'menu' && (
        <div className="px-4 pt-4 space-y-4">
          {deals.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {deals.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    if (d.code) {
                      setDealCode(d.code);
                      showToast(`Promo ${d.code} selected`);
                    }
                  }}
                  className="shrink-0 text-left px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm min-w-[220px]"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5" /> {d.code || 'OFFER'}
                  </div>
                  <div className="text-xs mt-0.5 font-medium">{d.title}</div>
                </button>
              ))}
            </div>
          )}

          {/* Search & Veg Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              onClick={() => setVegOnly((v) => !v)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                vegOnly ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-stone-700 border-stone-200'
              }`}
            >
              Veg Only
            </button>
          </div>

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
                selectedCategory === 'all' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border border-stone-200'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  selectedCategory === c.id ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border border-stone-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Dish Cards */}
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const activeVarId = selectedVariants[item.id];
              const activeVar = item.variants?.find((v) => v.id === activeVarId);
              const price = item.base_price_paise + (activeVar ? activeVar.price_delta_paise : 0);
              const spice = SPICE_BADGE[item.spice_level] || SPICE_BADGE.mild;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border border-stone-200 p-3.5 shadow-sm flex gap-3 ${
                    !item.is_available ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                          item.is_veg ? 'border-emerald-600' : 'border-red-600'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.is_veg ? 'bg-emerald-600' : 'bg-red-600'
                          }`}
                        />
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-0.5 ${spice.cls}`}>
                        <Flame className="w-2.5 h-2.5" /> {spice.label}
                      </span>
                      {Array.isArray(item.allergens) && item.allergens.length > 0 && (
                        <span className="text-[10px] text-stone-500">
                          Allergens: {item.allergens.join(', ')}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-stone-900 mt-1">{item.name}</h3>
                    <p className="text-xs text-stone-500 line-clamp-2 mt-0.5">{item.description}</p>
                    <p className="font-bold text-stone-900 mt-2">{formatInr(price)}</p>

                    {item.variants && item.variants.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.variants.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => setSelectedVariants((prev) => ({ ...prev, [item.id]: v.id }))}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${
                              activeVarId === v.id
                                ? 'bg-amber-50 border-amber-500 text-amber-900'
                                : 'bg-stone-50 border-stone-200 text-stone-600'
                            }`}
                          >
                            {v.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end justify-between shrink-0">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-24 h-24 rounded-xl object-cover bg-stone-100"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 text-xs">
                        No Image
                      </div>
                    )}
                    <button
                      disabled={!item.is_available}
                      onClick={() => addToCart(item)}
                      className="mt-2 w-24 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:bg-stone-300"
                    >
                      {item.is_available ? '+ Add' : 'Sold Out'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ORDERS TAB */}
      {tab === 'orders' && (
        <div className="px-4 pt-4 space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-stone-500 text-sm">
              No orders placed yet. Add dishes from the Menu tab!
            </div>
          ) : (
            orders.map((ord) => {
              const stepIdx = STATUS_STEPS.indexOf(normalizeStep(ord.status));
              return (
                <div key={ord.id} className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">{ord.order_number}</span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold capitalize">
                      {ord.status}
                    </span>
                  </div>

                  {/* Live 4-step progress */}
                  <div className="grid grid-cols-4 gap-1 text-center">
                    {STATUS_STEPS.map((st, idx) => (
                      <div key={st} className="flex flex-col items-center">
                        <div
                          className={`w-full h-1.5 rounded-full ${
                            idx <= stepIdx ? 'bg-emerald-500' : 'bg-stone-200'
                          }`}
                        />
                        <span className="text-[10px] mt-1 capitalize text-stone-600 font-medium">{st}</span>
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-stone-100 text-sm">
                    {(ord.items || []).map((it) => (
                      <div key={it.id} className="py-1.5 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-stone-800">
                            {it.quantity}× {it.item_name_snapshot}
                          </span>
                          {it.variant_name_snapshot && (
                            <span className="text-xs text-stone-500 ml-1">({it.variant_name_snapshot})</span>
                          )}
                        </div>
                        <span className="text-xs capitalize text-stone-500">{it.status}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-stone-100 flex justify-between text-sm font-semibold">
                    <span>Order Total (incl. GST)</span>
                    <span>{formatInr(ord.total_paise)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* BILL & PAY TAB */}
      {tab === 'bill' && (
        <div className="px-4 pt-4 space-y-4">
          {!bill || bill.ordersTotalPaise === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-stone-500 text-sm">
              Place an order first to view your bill.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-2 text-sm">
                <div className="flex items-center gap-2 font-bold text-stone-900 mb-2">
                  <Receipt className="w-4 h-4 text-amber-600" /> GST Bill Summary
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span>{formatInr(bill.subtotalPaise)}</span>
                </div>
                {bill.discountPaise > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Deals Discount</span>
                    <span>-{formatInr(bill.discountPaise)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-600">
                  <span>CGST (2.5%)</span>
                  <span>{formatInr(bill.cgstPaise)}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>SGST (2.5%)</span>
                  <span>{formatInr(bill.sgstPaise)}</span>
                </div>
                <div className="pt-2 border-t border-stone-200 flex justify-between font-bold text-stone-900">
                  <span>Remaining Payable</span>
                  <span>{formatInr(bill.remainingPaise)}</span>
                </div>
              </div>

              {bill.remainingPaise > 0 && (
                <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-2">Split Bill Option</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'full', label: 'Full Bill' },
                        { id: 'equal', label: 'Equal Split' },
                        { id: 'by_item', label: 'By Item' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setSplitType(opt.id)}
                          className={`py-2 rounded-xl text-xs font-semibold border ${
                            splitType === opt.id
                              ? 'bg-stone-900 text-white border-stone-900'
                              : 'bg-stone-50 text-stone-700 border-stone-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {splitType === 'equal' && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Split between how many guests?</span>
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={equalParts}
                        onChange={(e) => setEqualParts(Number(e.target.value))}
                        className="w-20 px-2.5 py-1.5 rounded-lg border border-stone-300 text-center"
                      />
                    </div>
                  )}

                  {splitType === 'by_item' && (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto border border-stone-100 rounded-xl p-2">
                      {allSessionItems.map((it) => (
                        <label key={it.id} className="flex items-center justify-between text-xs py-1">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedSplitItemIds.includes(it.id)}
                              onChange={(e) => {
                                setSelectedSplitItemIds((prev) =>
                                  e.target.checked ? [...prev, it.id] : prev.filter((id) => id !== it.id)
                                );
                              }}
                            />
                            {it.quantity}× {it.item_name_snapshot}
                          </span>
                          <span>{formatInr(it.line_total_paise)}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {splitType !== 'full' && (
                    <button
                      onClick={handleCreateSplit}
                      className="w-full py-2 rounded-xl bg-amber-100 text-amber-900 text-xs font-semibold hover:bg-amber-200"
                    >
                      Calculate Split Parts
                    </button>
                  )}

                  {/* Tip Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-2">Add Tip (Optional)</label>
                    <div className="flex gap-2">
                      {[0, 20, 50, 100].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setTipRupees(amt)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            tipRupees === amt ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-stone-200'
                          }`}
                        >
                          {amt === 0 ? 'No Tip' : `₹${amt}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pay Full or Individual Split Parts */}
                  {bill.splits?.length > 0 ? (
                    <div className="space-y-2">
                      {bill.splits.map((sp) => (
                        <div key={sp.id} className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200">
                          <div>
                            <div className="text-xs font-semibold text-stone-800">
                              Part {sp.part_number} of {sp.total_parts}
                            </div>
                            <div className="text-sm font-bold">{formatInr(sp.amount_paise)}</div>
                          </div>
                          {sp.status === 'paid' ? (
                            <span className="text-xs text-emerald-700 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Paid
                            </span>
                          ) : (
                            <button
                              onClick={() => startPayment(sp.id)}
                              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                            >
                              Pay UPI / Card
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => startPayment(null)}
                      className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 shadow-sm"
                    >
                      Pay {formatInr(bill.remainingPaise + tipRupees * 100)} via Razorpay (UPI)
                    </button>
                  )}
                </div>
              )}

              {/* Post-payment Receipt + PII Delete + One-Tap Rating */}
              {hasCapturedPayment && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-stone-900 text-sm">
                      <Mail className="w-4 h-4 text-amber-600" /> Email GST Receipt
                    </div>
                    <form onSubmit={handleSendReceipt} className="flex gap-2">
                      <input
                        type="email"
                        required
                        value={receiptEmail}
                        onChange={(e) => setReceiptEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-sm"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold"
                      >
                        Send
                      </button>
                    </form>
                    <button
                      onClick={handleDeleteEmailPii}
                      className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete my stored email (privacy)
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-3">
                    <div className="font-semibold text-stone-900 text-sm">Rate your dining experience</div>
                    {reviewSubmitted ? (
                      <div className="text-sm text-emerald-700 font-medium">Thank you for your {rating}-star review!</div>
                    ) : (
                      <form onSubmit={handleSubmitReview} className="space-y-3">
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              type="button"
                              key={n}
                              onClick={() => setRating(n)}
                              className="p-1.5"
                            >
                              <Star
                                className={`w-7 h-7 ${
                                  n <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Optional note for the chef & team..."
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={!rating}
                          className="w-full py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold disabled:bg-stone-300"
                        >
                          Submit Rating
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Floating Cart Bar */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-xl z-40">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full py-3.5 px-5 rounded-2xl bg-stone-900 text-white shadow-xl flex items-center justify-between"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBag className="w-4 h-4 text-amber-400" /> {cartCount} item(s)
            </span>
            <span className="text-sm font-bold">View Cart • {formatInr(cartEstSubtotal)}</span>
          </button>
        </div>
      )}

      {/* Cart Drawer Modal */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="bg-white w-full max-w-2xl rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-stone-900">Your Order Cart</h2>
              <button onClick={() => setCartOpen(false)} className="text-sm text-stone-500 font-medium">
                Close
              </button>
            </div>

            <div className="divide-y divide-stone-100">
              {cart.map((c, idx) => (
                <div key={`${c.menuItemId}-${c.variantId}`} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm text-stone-900">{c.name}</div>
                    {c.variantName && <div className="text-xs text-stone-500">{c.variantName}</div>}
                    <div className="text-xs font-medium text-stone-700 mt-0.5">
                      {formatInr(c.unitPricePaise * c.quantity)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateCartQty(idx, -1)}
                      className="w-7 h-7 rounded-lg border border-stone-300 flex items-center justify-center"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-semibold w-5 text-center">{c.quantity}</span>
                    <button
                      onClick={() => updateCartQty(idx, 1)}
                      className="w-7 h-7 rounded-lg border border-stone-300 flex items-center justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={dealCode}
                onChange={(e) => setDealCode(e.target.value)}
                placeholder="Promo code (e.g. WELCOME10)"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-200 text-sm"
              />
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Kitchen notes (e.g. less spicy, no onions)"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-200 text-sm"
              />
            </div>

            <button
              disabled={placingOrder}
              onClick={handlePlaceOrder}
              className="w-full py-3.5 rounded-2xl bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50"
            >
              {placingOrder ? 'Sending Order...' : `Place Order • Est. ${formatInr(cartEstSubtotal)} + GST`}
            </button>
          </div>
        </div>
      )}

      {/* Mock Razorpay Checkout Modal (Dev/Test Mode when Razorpay keys are unconfigured) */}
      {mockCheckout && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Razorpay Test Mode Simulator
            </div>
            <h3 className="text-lg font-bold text-stone-900">
              Pay {formatInr(mockCheckout.amountPaise)} via UPI
            </h3>
            <p className="text-xs text-stone-500">
              Order ID: <code>{mockCheckout.razorpayOrderId}</code>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setMockCheckout(null)}
                className="flex-1 py-2.5 rounded-xl border border-stone-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={completeMockPayment}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
              >
                Simulate UPI Success
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
