'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Download, LogOut, Plus, QrCode, RefreshCw, Shield, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatInr } from '@/lib/format';

interface CatalogData {
  categories: { id: number; name: string }[];
  stations: { id: number; name: string; code: string }[];
  items: {
    id: number;
    name: string;
    basePricePaise: number;
    isAvailable: boolean;
    category?: { name: string };
    station?: { name: string };
  }[];
  deals: { id: number; title: string; code?: string | null; isActive: boolean }[];
}

interface AdminTable {
  id: number;
  tableNumber: string;
  label: string;
  capacity: number;
  zone: string;
  qrToken: string;
  qrDataUrl: string;
}

interface StaffMember {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  role: { name: string };
}

interface OrdersPaymentsData {
  orders: { id: number; orderNumber: string; status: string; totalPaise: number; table?: { tableNumber: string } }[];
  payments: { id: number; razorpayOrderId: string; status: string; method?: string | null; amountPaise: number }[];
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const [tab, setTab] = useState<'menu' | 'tables' | 'staff' | 'orders'>('menu');
  const [catalog, setCatalog] = useState<CatalogData>({ categories: [], stations: [], items: [], deals: [] });
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [ordersPayments, setOrdersPayments] = useState<OrdersPaymentsData>({ orders: [], payments: [] });
  const [msg, setMsg] = useState('');

  const [newItem, setNewItem] = useState({
    name: '',
    categoryId: '',
    stationId: '',
    priceRupees: '',
    isVeg: true,
    spiceLevel: 'mild',
    description: '',
    imageUrl: '',
  });

  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    password: '',
    role: 'waiter',
  });

  const loadData = useCallback(async () => {
    const [catRes, tblRes, opRes] = await Promise.all([
      apiFetch<CatalogData>('/api/admin/catalog'),
      apiFetch<{ tables: AdminTable[] }>('/api/admin/tables'),
      apiFetch<OrdersPaymentsData>('/api/admin/orders-payments'),
    ]);
    setCatalog(catRes);
    setTables(tblRes.tables || []);
    setOrdersPayments(opRes);

    if (catRes.categories.length > 0) {
      setNewItem((prev) => ({
        ...prev,
        categoryId: prev.categoryId || String(catRes.categories[0].id),
        stationId: prev.stationId || String(catRes.stations[0]?.id || ''),
      }));
    }

    if (user?.role === 'owner') {
      const staffRes = await apiFetch<{ staff: StaffMember[] }>('/api/admin/staff');
      setStaff(staffRes.staff || []);
    }
  }, [user?.role]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated') {
      const timer = setTimeout(() => {
        loadData().catch((e) => setMsg(e instanceof Error ? e.message : 'Failed to load admin data'));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [status, router, loadData]);

  async function toggleItemAvailability(item: CatalogData['items'][number]) {
    await apiFetch(`/api/admin/menu-items/${item.id}`, {
      method: 'PATCH',
      body: { isAvailable: !item.isAvailable },
    });
    await loadData();
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/menu-items', {
        method: 'POST',
        body: {
          name: newItem.name,
          categoryId: Number(newItem.categoryId),
          stationId: Number(newItem.stationId),
          basePricePaise: Math.round(Number(newItem.priceRupees) * 100),
          isVeg: newItem.isVeg,
          spiceLevel: newItem.spiceLevel,
          description: newItem.description || undefined,
          imageUrl: newItem.imageUrl.trim() || undefined,
        },
      });
      setNewItem((p) => ({ ...p, name: '', priceRupees: '', description: '', imageUrl: '' }));
      setMsg('Menu item added.');
      await loadData();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to create item');
    }
  }

  async function handleRegenerateQr(tableId: number) {
    await apiFetch(`/api/admin/tables/${tableId}/regenerate-qr`, { method: 'POST', body: {} });
    setMsg('QR token regenerated. Previous QR code has been revoked.');
    await loadData();
  }

  function downloadQrDataUrl(t: AdminTable) {
    const a = document.createElement('a');
    a.href = t.qrDataUrl;
    a.download = `${t.tableNumber}-QR.png`;
    a.click();
  }

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/staff', { method: 'POST', body: newStaff });
      setNewStaff({ name: '', email: '', password: '', role: 'waiter' });
      setMsg('Staff account created.');
      await loadData();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to create staff');
    }
  }

  async function toggleStaffActive(member: StaffMember) {
    await apiFetch(`/api/admin/staff/${member.id}`, {
      method: 'PATCH',
      body: { isActive: !member.isActive },
    });
    await loadData();
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-stone-600">Loading admin console...</div>;
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-white border-b border-stone-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-indigo-600" />
          <div>
            <h1 className="font-bold text-stone-900">TableFlow Admin Console</h1>
            <p className="text-xs text-stone-500">
              {user?.name} ({user?.role})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/staff" className="px-3 py-1.5 rounded-lg bg-stone-100 text-xs font-semibold">
            Floor
          </Link>
          <Link href="/kitchen" className="px-3 py-1.5 rounded-lg bg-stone-100 text-xs font-semibold">
            Kitchen
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { id: 'menu', label: 'Menu & Deals' },
              { id: 'tables', label: 'Tables & QR Codes' },
              ...(user?.role === 'owner' ? [{ id: 'staff', label: 'Staff & Roles' }] : []),
              { id: 'orders', label: 'Orders & Payments' },
            ] as { id: 'menu' | 'tables' | 'staff' | 'orders'; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                tab === t.id ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {msg && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">{msg}</div>}

        {tab === 'menu' && (
          <div className="space-y-6">
            <form onSubmit={handleCreateItem} className="bg-white rounded-2xl border border-stone-200 p-5 grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3 font-bold text-stone-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Add Menu Item
              </div>
              <input
                required
                placeholder="Dish name"
                value={newItem.name}
                onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              />
              <select
                value={newItem.categoryId}
                onChange={(e) => setNewItem((p) => ({ ...p, categoryId: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              >
                {catalog.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={newItem.stationId}
                onChange={(e) => setNewItem((p) => ({ ...p, stationId: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              >
                {catalog.stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                required
                type="number"
                min="1"
                placeholder="Price (₹)"
                value={newItem.priceRupees}
                onChange={(e) => setNewItem((p) => ({ ...p, priceRupees: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              />
              <select
                value={newItem.spiceLevel}
                onChange={(e) => setNewItem((p) => ({ ...p, spiceLevel: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              >
                <option value="none">No Spice</option>
                <option value="mild">Mild</option>
                <option value="medium">Medium</option>
                <option value="hot">Hot</option>
              </select>
              <label className="flex items-center gap-2 text-sm px-2">
                <input
                  type="checkbox"
                  checked={newItem.isVeg}
                  onChange={(e) => setNewItem((p) => ({ ...p, isVeg: e.target.checked }))}
                />
                Vegetarian
              </label>
              <input
                placeholder="HTTPS Image URL (optional)"
                value={newItem.imageUrl}
                onChange={(e) => setNewItem((p) => ({ ...p, imageUrl: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              />
              <input
                placeholder="Description"
                value={newItem.description}
                onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              />
              <button type="submit" className="py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold">
                Save Dish
              </button>
            </form>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-stone-50 border-b border-stone-200 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="p-3">Dish</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Station</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Availability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {catalog.items.map((it) => (
                    <tr key={it.id}>
                      <td className="p-3 font-semibold text-stone-900">{it.name}</td>
                      <td className="p-3 text-stone-600">{it.category?.name}</td>
                      <td className="p-3 text-stone-600">{it.station?.name}</td>
                      <td className="p-3 font-medium">{formatInr(it.basePricePaise)}</td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleItemAvailability(it)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            it.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {it.isAvailable ? 'In Stock' : 'Out of Stock'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'tables' && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tables.map((t) => (
              <div key={t.id} className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-stone-900">{t.label} ({t.tableNumber})</div>
                    <div className="text-xs text-stone-500">{t.zone} • {t.capacity} seats</div>
                  </div>
                  <QrCode className="w-5 h-5 text-amber-600" />
                </div>

                {t.qrDataUrl && (
                  <img
                    src={t.qrDataUrl}
                    alt={`QR ${t.tableNumber}`}
                    className="w-40 h-40 mx-auto border border-stone-200 rounded-xl p-1"
                  />
                )}

                <div className="text-[11px] text-stone-500 break-all bg-stone-50 p-2 rounded-lg">
                  <Link href={`/t/${t.qrToken}`} className="text-amber-700 underline">
                    /t/{t.qrToken}
                  </Link>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => downloadQrDataUrl(t)}
                    className="flex-1 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Download PNG
                  </button>
                  <button
                    onClick={() => handleRegenerateQr(t.id)}
                    className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold inline-flex items-center gap-1"
                    title="Revoke old QR & issue new token"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Rotate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'staff' && user?.role === 'owner' && (
          <div className="space-y-6">
            <form onSubmit={handleCreateStaff} className="bg-white rounded-2xl border border-stone-200 p-5 grid sm:grid-cols-4 gap-3">
              <div className="sm:col-span-4 font-bold text-stone-900 flex items-center gap-1.5">
                <Users className="w-4 h-4" /> Create Staff Account
              </div>
              <input
                required
                placeholder="Full Name"
                value={newStaff.name}
                onChange={(e) => setNewStaff((p) => ({ ...p, name: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={newStaff.email}
                onChange={(e) => setNewStaff((p) => ({ ...p, email: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              />
              <input
                required
                type="password"
                minLength={10}
                placeholder="Password (min 10 chars)"
                value={newStaff.password}
                onChange={(e) => setNewStaff((p) => ({ ...p, password: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-stone-200 text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff((p) => ({ ...p, role: e.target.value }))}
                  className="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-sm"
                >
                  <option value="waiter">Waiter</option>
                  <option value="chef">Chef</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
                <button type="submit" className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold">
                  Add
                </button>
              </div>
            </form>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-stone-50 border-b border-stone-200 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {staff.map((m) => (
                    <tr key={m.id}>
                      <td className="p-3 font-semibold">{m.name}</td>
                      <td className="p-3 text-stone-600">{m.email}</td>
                      <td className="p-3 uppercase text-xs font-bold">{m.role?.name}</td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleStaffActive(m)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            m.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {m.isActive ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'orders' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <h2 className="font-bold text-stone-900">Recent Orders</h2>
              <div className="divide-y divide-stone-100 text-sm">
                {ordersPayments.orders.map((o) => (
                  <div key={o.id} className="py-2 flex justify-between">
                    <div>
                      <div className="font-semibold">{o.orderNumber} ({o.table?.tableNumber})</div>
                      <div className="text-xs text-stone-500 capitalize">Status: {o.status}</div>
                    </div>
                    <div className="font-bold">{formatInr(o.totalPaise)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <h2 className="font-bold text-stone-900">Recent Payments</h2>
              <div className="divide-y divide-stone-100 text-sm">
                {ordersPayments.payments.map((p) => (
                  <div key={p.id} className="py-2 flex justify-between">
                    <div>
                      <div className="font-semibold">{p.razorpayOrderId}</div>
                      <div className="text-xs text-stone-500 capitalize">{p.status} • {p.method || 'pending'}</div>
                    </div>
                    <div className="font-bold">{formatInr(p.amountPaise)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
