'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Download, LogOut, Plus, QrCode, RefreshCw, Shield, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatInr } from '@/lib/format';
import { Badge, Button, Card, Chip, Skeleton, Toast } from '@/components/ui';

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
  const [toast, setToast] = useState('');

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

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  }, []);

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
        loadData().catch((e) => showToast(e instanceof Error ? e.message : 'Failed to load admin data'));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [status, router, loadData, showToast]);

  async function toggleItemAvailability(item: CatalogData['items'][number]) {
    await apiFetch(`/api/admin/menu-items/${item.id}`, {
      method: 'PATCH',
      body: { isAvailable: !item.isAvailable },
    });
    showToast(`${item.name} updated`);
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
      showToast('Menu item added.');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create item');
    }
  }

  async function handleRegenerateQr(tableId: number) {
    await apiFetch(`/api/admin/tables/${tableId}/regenerate-qr`, { method: 'POST', body: {} });
    showToast('QR token rotated. Previous QR code revoked.');
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
      showToast('Staff account created.');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create staff');
    }
  }

  async function toggleStaffActive(member: StaffMember) {
    await apiFetch(`/api/admin/staff/${member.id}`, {
      method: 'PATCH',
      body: { isActive: !member.isActive },
    });
    showToast('Staff status updated.');
    await loadData();
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-cream p-5 max-w-7xl mx-auto space-y-5">
        <Skeleton className="h-24 w-full rounded-[28px]" />
        <Skeleton className="h-72 w-full rounded-[20px]" />
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
              <Shield className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-[26px] font-extrabold text-ink leading-tight">TableFlow Admin Console</h1>
              <p className="text-[12px] font-bold text-leaf">
                {user?.name} ({user?.role})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/staff"
              className="min-h-[44px] px-4 rounded-[14px] bg-surface text-ink font-bold text-[13px] inline-flex items-center shadow-sm"
            >
              Floor
            </Link>
            <Link
              href="/kitchen"
              className="min-h-[44px] px-4 rounded-[14px] bg-surface text-ink font-bold text-[13px] inline-flex items-center shadow-sm"
            >
              Kitchen
            </Link>
            <Button variant="leaf" onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className="w-4 h-4" aria-hidden="true" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        <nav aria-label="Admin sections" className="flex gap-2.5 flex-wrap">
          {(
            [
              { id: 'menu', label: 'Menu & Deals' },
              { id: 'tables', label: 'Tables & QR Codes' },
              ...(user?.role === 'owner' ? [{ id: 'staff', label: 'Staff & Roles' }] : []),
              { id: 'orders', label: 'Orders & Payments' },
            ] as { id: 'menu' | 'tables' | 'staff' | 'orders'; label: string }[]
          ).map((t) => (
            <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </Chip>
          ))}
        </nav>

        {/* MENU & DEALS */}
        {tab === 'menu' && (
          <div className="space-y-6">
            <Card className="p-5">
              <form onSubmit={handleCreateItem} className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3 font-extrabold text-[17px] text-ink flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-leaf" aria-hidden="true" /> Add Menu Item
                </div>
                <div>
                  <label htmlFor="item-name" className="sr-only">Dish name</label>
                  <input
                    id="item-name"
                    required
                    placeholder="Dish name"
                    value={newItem.name}
                    onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  />
                </div>
                <div>
                  <label htmlFor="item-cat" className="sr-only">Category</label>
                  <select
                    id="item-cat"
                    value={newItem.categoryId}
                    onChange={(e) => setNewItem((p) => ({ ...p, categoryId: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  >
                    {catalog.categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="item-station" className="sr-only">Kitchen station</label>
                  <select
                    id="item-station"
                    value={newItem.stationId}
                    onChange={(e) => setNewItem((p) => ({ ...p, stationId: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  >
                    {catalog.stations.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="item-price" className="sr-only">Price in Rupees</label>
                  <input
                    id="item-price"
                    required
                    type="number"
                    min="1"
                    placeholder="Price (₹)"
                    value={newItem.priceRupees}
                    onChange={(e) => setNewItem((p) => ({ ...p, priceRupees: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  />
                </div>
                <div>
                  <label htmlFor="item-spice" className="sr-only">Spice level</label>
                  <select
                    id="item-spice"
                    value={newItem.spiceLevel}
                    onChange={(e) => setNewItem((p) => ({ ...p, spiceLevel: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  >
                    <option value="none">No Spice</option>
                    <option value="mild">Mild</option>
                    <option value="medium">Medium</option>
                    <option value="hot">Hot</option>
                  </select>
                </div>
                <label className="min-h-[44px] flex items-center gap-2 text-[14px] font-bold text-ink px-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItem.isVeg}
                    onChange={(e) => setNewItem((p) => ({ ...p, isVeg: e.target.checked }))}
                    className="w-4 h-4 accent-leaf"
                  />
                  Vegetarian
                </label>
                <div>
                  <label htmlFor="item-image" className="sr-only">HTTPS Image URL</label>
                  <input
                    id="item-image"
                    placeholder="HTTPS Image URL (optional)"
                    value={newItem.imageUrl}
                    onChange={(e) => setNewItem((p) => ({ ...p, imageUrl: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  />
                </div>
                <div>
                  <label htmlFor="item-desc" className="sr-only">Description</label>
                  <input
                    id="item-desc"
                    placeholder="Description"
                    value={newItem.description}
                    onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  />
                </div>
                <Button type="submit" variant="sun">
                  Save Dish
                </Button>
              </form>
            </Card>

            <Card className="overflow-x-auto">
              <table className="w-full text-[14px] text-left">
                <thead className="bg-mint-bg border-b border-mint text-[12px] uppercase text-leaf font-extrabold">
                  <tr>
                    <th className="p-3.5">Dish</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Station</th>
                    <th className="p-3.5">Price</th>
                    <th className="p-3.5">Availability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mint/60">
                  {catalog.items.map((it) => (
                    <tr key={it.id}>
                      <td className="p-3.5 font-extrabold text-ink">{it.name}</td>
                      <td className="p-3.5 text-muted">{it.category?.name}</td>
                      <td className="p-3.5 text-muted">{it.station?.name}</td>
                      <td className="p-3.5 font-bold text-ink">{formatInr(it.basePricePaise)}</td>
                      <td className="p-3.5">
                        <Button
                          variant={it.isAvailable ? 'mint' : 'outline-tomato'}
                          onClick={() => void toggleItemAvailability(it)}
                        >
                          {it.isAvailable ? 'In Stock' : 'Out of Stock'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* TABLES & QR CODES */}
        {tab === 'tables' && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tables.map((t) => (
              <Card key={t.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-[17px] text-ink">
                      {t.label} ({t.tableNumber})
                    </div>
                    <div className="text-[12px] text-muted">
                      {t.zone} · {t.capacity} seats
                    </div>
                  </div>
                  <QrCode className="w-5 h-5 text-leaf" aria-hidden="true" />
                </div>

                {t.qrDataUrl && (
                  <img
                    src={t.qrDataUrl}
                    alt={`QR code for ${t.tableNumber}`}
                    className="w-40 h-40 mx-auto border border-mint rounded-[16px] p-1.5 bg-surface"
                  />
                )}

                <div className="text-[12px] break-all bg-mint-bg p-2.5 rounded-[12px]">
                  <Link href={`/t/${t.qrToken}`} className="text-leaf font-bold underline">
                    /t/{t.qrToken}
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="leaf" onClick={() => downloadQrDataUrl(t)}>
                    <Download className="w-4 h-4" aria-hidden="true" /> PNG
                  </Button>
                  <Button variant="outline-tomato" onClick={() => void handleRegenerateQr(t.id)}>
                    <RefreshCw className="w-4 h-4" aria-hidden="true" /> Rotate
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* STAFF & ROLES (Owner only) */}
        {tab === 'staff' && user?.role === 'owner' && (
          <div className="space-y-6">
            <Card className="p-5">
              <form onSubmit={handleCreateStaff} className="grid sm:grid-cols-4 gap-3">
                <div className="sm:col-span-4 font-extrabold text-[17px] text-ink flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-leaf" aria-hidden="true" /> Create Staff Account
                </div>
                <div>
                  <label htmlFor="staff-name" className="sr-only">Full Name</label>
                  <input
                    id="staff-name"
                    required
                    placeholder="Full Name"
                    value={newStaff.name}
                    onChange={(e) => setNewStaff((p) => ({ ...p, name: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  />
                </div>
                <div>
                  <label htmlFor="staff-email" className="sr-only">Work Email</label>
                  <input
                    id="staff-email"
                    required
                    type="email"
                    placeholder="Email"
                    value={newStaff.email}
                    onChange={(e) => setNewStaff((p) => ({ ...p, email: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  />
                </div>
                <div>
                  <label htmlFor="staff-pass" className="sr-only">Password</label>
                  <input
                    id="staff-pass"
                    required
                    type="password"
                    minLength={10}
                    placeholder="Password (min 10 chars)"
                    value={newStaff.password}
                    onChange={(e) => setNewStaff((p) => ({ ...p, password: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  />
                </div>
                <div className="flex gap-2">
                  <label htmlFor="staff-role" className="sr-only">Role</label>
                  <select
                    id="staff-role"
                    value={newStaff.role}
                    onChange={(e) => setNewStaff((p) => ({ ...p, role: e.target.value }))}
                    className="flex-1 min-h-[44px] px-3 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                  >
                    <option value="waiter">Waiter</option>
                    <option value="chef">Chef</option>
                    <option value="manager">Manager</option>
                    <option value="owner">Owner</option>
                  </select>
                  <Button type="submit" variant="sun">
                    Add
                  </Button>
                </div>
              </form>
            </Card>

            <Card className="overflow-x-auto">
              <table className="w-full text-[14px] text-left">
                <thead className="bg-mint-bg border-b border-mint text-[12px] uppercase text-leaf font-extrabold">
                  <tr>
                    <th className="p-3.5">Name</th>
                    <th className="p-3.5">Email</th>
                    <th className="p-3.5">Role</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mint/60">
                  {staff.map((m) => (
                    <tr key={m.id}>
                      <td className="p-3.5 font-extrabold text-ink">{m.name}</td>
                      <td className="p-3.5 text-muted">{m.email}</td>
                      <td className="p-3.5">
                        <Badge tone="sun">{m.role?.name}</Badge>
                      </td>
                      <td className="p-3.5">
                        <Button
                          variant={m.isActive ? 'mint' : 'outline-tomato'}
                          onClick={() => void toggleStaffActive(m)}
                        >
                          {m.isActive ? 'Active' : 'Disabled'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* ORDERS & PAYMENTS */}
        {tab === 'orders' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5 space-y-3">
              <h2 className="font-extrabold text-[18px] text-ink">Recent Orders</h2>
              <div className="divide-y divide-mint text-[14px]">
                {ordersPayments.orders.map((o) => (
                  <div key={o.id} className="py-2.5 flex justify-between items-center">
                    <div>
                      <div className="font-extrabold text-ink">
                        {o.orderNumber} ({o.table?.tableNumber})
                      </div>
                      <div className="text-[12px] text-muted capitalize">Status: {o.status}</div>
                    </div>
                    <div className="font-extrabold text-ink">{formatInr(o.totalPaise)}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5 space-y-3">
              <h2 className="font-extrabold text-[18px] text-ink">Recent Payments</h2>
              <div className="divide-y divide-mint text-[14px]">
                {ordersPayments.payments.map((p) => (
                  <div key={p.id} className="py-2.5 flex justify-between items-center">
                    <div>
                      <div className="font-extrabold text-ink">{p.razorpayOrderId}</div>
                      <div className="text-[12px] text-muted capitalize">
                        {p.status} · {p.method || 'pending'}
                      </div>
                    </div>
                    <div className="font-extrabold text-ink">{formatInr(p.amountPaise)}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
