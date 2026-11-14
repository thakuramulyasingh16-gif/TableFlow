'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Download,
  Layers,
  LogOut,
  PackageOpen,
  PieChart,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Shield,
  ShoppingCart,
  Tag,
  Upload,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatInr } from '@/lib/format';
import { AlertsBanner } from '@/components/admin/AlertsBanner';
import { AdminIngredientItem, IngredientsTab } from '@/components/admin/IngredientsTab';
import { AdminDishItem, MenuInventoryTab } from '@/components/admin/MenuInventoryTab';
import { PurchasesTab } from '@/components/admin/PurchasesTab';
import { ReportsTab } from '@/components/admin/ReportsTab';
import { SettingsTab } from '@/components/admin/SettingsTab';
import { Badge, Button, Card, Toast } from '@/components/ui';

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

  const [tab, setTab] = useState<
    'menu' | 'deals' | 'ingredients' | 'alerts' | 'purchases' | 'reports' | 'tables' | 'staff' | 'orders' | 'settings'
  >('menu');

  const [catalog, setCatalog] = useState<CatalogData>({ categories: [], stations: [], items: [], deals: [] });
  const [dishes, setDishes] = useState<AdminDishItem[]>([]);
  const [ingredients, setIngredients] = useState<AdminIngredientItem[]>([]);
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
  const [uploadingImage, setUploadingImage] = useState(false);

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
    try {
      const [catRes, tblRes, opRes, menuRes, ingRes] = await Promise.all([
        apiFetch<CatalogData>('/api/admin/catalog'),
        apiFetch<{ tables: AdminTable[] }>('/api/admin/tables'),
        apiFetch<OrdersPaymentsData>('/api/admin/orders-payments'),
        apiFetch<{ items: AdminDishItem[] }>('/api/inventory/menu?includeArchived=true'),
        apiFetch<{ ingredients: AdminIngredientItem[] }>('/api/inventory/ingredients'),
      ]);

      setCatalog(catRes);
      setTables(tblRes.tables || []);
      setOrdersPayments(opRes);
      setDishes(menuRes.items || []);
      setIngredients(ingRes.ingredients || []);

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
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load manager data');
    }
  }, [user, showToast]);

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

  async function handleDishImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      showToast('Image file exceeds 3 MB limit');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const csrfCookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith('tf_csrf='))
        ?.split('=')[1];

      const res = await fetch('/api/admin/menu/upload', {
        method: 'POST',
        headers: csrfCookie ? { 'X-CSRF-Token': csrfCookie } : {},
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || errorData.message || 'Upload failed');
      }

      const data = await res.json();
      setNewItem((p) => ({ ...p, imageUrl: data.url }));
      showToast('Dish photo uploaded successfully!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/menu-items', {
        method: 'POST',
        body: {
          name: newItem.name.trim(),
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
      showToast('Menu item added. You can now define its recipe in the table below.');
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
    const link = document.createElement('a');
    link.download = `table-${t.tableNumber}-qr.png`;
    link.href = t.qrDataUrl;
    link.click();
  }

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/staff', {
        method: 'POST',
        body: newStaff,
      });
      setNewStaff({ name: '', email: '', password: '', role: 'waiter' });
      showToast('Staff member added.');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create staff');
    }
  }

  async function toggleStaffActive(s: StaffMember) {
    await apiFetch(`/api/admin/staff/${s.id}`, {
      method: 'PATCH',
      body: { isActive: !s.isActive },
    });
    showToast(`Staff ${s.name} ${!s.isActive ? 'activated' : 'disabled'}`);
    await loadData();
  }

  return (
    <div className="min-h-screen bg-cream font-sans pb-16">
      <Toast message={toast} />

      {/* Signature Gradient Header */}
      <header className="bg-signature-gradient rounded-b-[28px] px-5 sm:px-8 py-5 shadow-card">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-leaf text-surface flex items-center justify-center shadow-sm">
              <Shield className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[22px] font-extrabold text-ink tracking-tight">Manager & Admin Flow</span>
                <span className="px-2.5 py-0.5 rounded-full bg-ink text-sun-soft text-[11px] font-extrabold uppercase">
                  {user?.role || 'Staff'}
                </span>
              </div>
              <p className="text-[12px] font-bold text-leaf">
                {user?.name || 'Administrator'} • Inventory, Recipes & Financial Control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/kitchen"
              className="min-h-[44px] px-4 rounded-[14px] bg-surface/80 hover:bg-surface text-leaf font-bold text-[13px] inline-flex items-center gap-1.5 transition border border-leaf/20"
            >
              Kitchen KDS
            </Link>
            <Link
              href="/chef"
              className="min-h-[44px] px-4 rounded-[14px] bg-surface/80 hover:bg-surface text-leaf font-bold text-[13px] inline-flex items-center gap-1.5 transition border border-leaf/20"
            >
              Chef Portal
            </Link>
            <Link
              href="/staff/floor"
              className="min-h-[44px] px-4 rounded-[14px] bg-surface/80 hover:bg-surface text-leaf font-bold text-[13px] inline-flex items-center gap-1.5 transition border border-leaf/20"
            >
              Floor Map
            </Link>
            <Button variant="tomato" onClick={() => signOut({ callbackUrl: '/login' })} className="min-h-[44px]">
              <LogOut className="w-4 h-4 mr-1.5" aria-hidden="true" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {/* PERSISTENT REAL-TIME ALERTS BANNER FOR ONLINE MANAGERS */}
        <AlertsBanner onRefreshData={loadData} showToast={showToast} />

        {/* 6 Core Manager Tabs + Operational Tabs */}
        <nav aria-label="Admin and inventory tabs" className="flex gap-2 flex-wrap pb-1">
          {[
            { id: 'menu', label: 'Menu & Recipes', icon: Layers },
            { id: 'deals', label: 'Deals & Offers', icon: Tag },
            { id: 'ingredients', label: 'Ingredients', icon: PackageOpen },
            { id: 'alerts', label: 'Alerts', icon: Bell },
            { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
            { id: 'reports', label: 'Financial Reports', icon: PieChart },
            { id: 'tables', label: 'Tables & QRs', icon: QrCode },
            ...(user?.role === 'owner' ? [{ id: 'staff', label: 'Staff & Roles', icon: Users }] : []),
            { id: 'orders', label: 'Orders & Payments', icon: RefreshCw },
            { id: 'settings', label: 'Settings & Taxes', icon: Settings },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`min-h-[42px] px-4 rounded-full text-[13px] font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-sun text-ink shadow-sm'
                    : 'bg-mint-bg text-leaf hover:bg-mint'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* 1. MENU TAB (Dishes + Expandable Recipes + Soft Delete & Restore + Availability Overrides) */}
        {tab === 'menu' && (
          <div className="space-y-6">
            {/* Quick Add Dish Form */}
            <Card className="p-5 shadow-sm border border-leaf/10">
              <form onSubmit={handleCreateItem} className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3 font-extrabold text-[17px] text-ink flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-leaf" aria-hidden="true" /> Add New Dish
                </div>
                <div>
                  <label htmlFor="item-name" className="sr-only">Dish name</label>
                  <input
                    id="item-name"
                    required
                    placeholder="Dish name"
                    value={newItem.name}
                    onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="item-cat" className="sr-only">Category</label>
                  <select
                    id="item-cat"
                    value={newItem.categoryId}
                    onChange={(e) => setNewItem((p) => ({ ...p, categoryId: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
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
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
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
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="item-spice" className="sr-only">Spice level</label>
                  <select
                    id="item-spice"
                    value={newItem.spiceLevel}
                    onChange={(e) => setNewItem((p) => ({ ...p, spiceLevel: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
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
                <div className="sm:col-span-2">
                  <label htmlFor="item-desc" className="sr-only">Description</label>
                  <input
                    id="item-desc"
                    placeholder="Description / short taste notes"
                    value={newItem.description}
                    onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center gap-3 p-3 rounded-[12px] bg-cream border border-leaf/20">
                  {newItem.imageUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={newItem.imageUrl}
                        alt="Dish preview"
                        className="w-12 h-12 object-cover rounded-lg border border-sun"
                      />
                      <div className="flex flex-col">
                        <span className="text-[12px] font-bold text-ink truncate max-w-xs">{newItem.imageUrl}</span>
                        <button
                          type="button"
                          onClick={() => setNewItem((p) => ({ ...p, imageUrl: '' }))}
                          className="text-[11px] font-extrabold text-tomato hover:underline text-left mt-0.5"
                        >
                          Remove photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 text-[13px] font-bold text-leaf cursor-pointer hover:underline">
                      <Upload className="w-4 h-4" />
                      {uploadingImage ? 'Uploading photo...' : 'Upload Dish Photo (JPEG/PNG/WebP, max 3MB)'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingImage}
                        onChange={handleDishImageUpload}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
                <Button type="submit" variant="sun" className="min-h-[44px] font-extrabold">
                  Add Dish
                </Button>
              </form>
            </Card>

            {/* Menu & Recipes Inventory Manager */}
            <MenuInventoryTab
              dishes={dishes}
              categories={catalog.categories}
              stations={catalog.stations}
              availableIngredients={ingredients}
              onRefresh={loadData}
              showToast={showToast}
            />
          </div>
        )}

        {/* 2. DEALS TAB */}
        {tab === 'deals' && (
          <Card className="p-6 space-y-4">
            <h3 className="text-[18px] font-extrabold text-ink">Active Restaurant Deals & Discounts</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {catalog.deals.map((deal) => (
                <div key={deal.id} className="p-4 rounded-[16px] bg-cream border border-leaf/15 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[16px] text-ink">{deal.title}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-sun text-ink text-[12px] font-bold">
                      {deal.code || 'Auto-applied'}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted">
                    Status: <span className="text-leaf font-bold">{deal.isActive ? 'Active' : 'Inactive'}</span>
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 3. INGREDIENTS TAB */}
        {tab === 'ingredients' && (
          <IngredientsTab
            ingredients={ingredients}
            onRefresh={loadData}
            showToast={showToast}
          />
        )}

        {/* 4. ALERTS TAB */}
        {tab === 'alerts' && (
          <div className="space-y-4">
            <p className="text-[13px] text-muted font-bold">
              Review and act on raw-material alerts raised by the kitchen.
            </p>
          </div>
        )}

        {/* 5. PURCHASES TAB */}
        {tab === 'purchases' && (
          <PurchasesTab
            ingredients={ingredients}
            showToast={showToast}
          />
        )}

        {/* 6. REPORTS TAB (Financial & Material Analytics) */}
        {tab === 'reports' && (
          <ReportsTab showToast={showToast} />
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
                    <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> PNG
                  </Button>
                  <Button variant="outline-tomato" onClick={() => void handleRegenerateQr(t.id)}>
                    <RefreshCw className="w-4 h-4 mr-1.5" aria-hidden="true" /> Rotate
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
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
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
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
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
                    className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                  />
                </div>
                <div className="flex gap-2">
                  <label htmlFor="staff-role" className="sr-only">Role</label>
                  <select
                    id="staff-role"
                    value={newStaff.role}
                    onChange={(e) => setNewStaff((p) => ({ ...p, role: e.target.value }))}
                    className="flex-1 min-h-[44px] px-3 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                  >
                    <option value="waiter">Waiter</option>
                    <option value="chef">Chef</option>
                    <option value="manager">Manager</option>
                    <option value="owner">Owner</option>
                  </select>
                  <Button type="submit" variant="sun" className="font-extrabold">
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
                <tbody className="divide-y divide-mint/60 font-bold">
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

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <SettingsTab userRole={user?.role} showToast={showToast} />
        )}
      </main>
    </div>
  );
}
