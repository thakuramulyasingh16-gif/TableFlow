import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, LogOut, Plus, QrCode, RefreshCw, Shield, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import { formatInr } from '../lib/format.js';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('menu');
  const [catalog, setCatalog] = useState({ categories: [], stations: [], items: [], deals: [] });
  const [tables, setTables] = useState([]);
  const [staff, setStaff] = useState([]);
  const [ordersPayments, setOrdersPayments] = useState({ orders: [], payments: [] });
  const [msg, setMsg] = useState('');

  // Quick create item form
  const [newItem, setNewItem] = useState({
    name: '',
    categoryId: '',
    stationId: '',
    priceRupees: '',
    isVeg: true,
    spiceLevel: 'mild',
    description: '',
  });

  // Quick create staff form (owner only)
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    password: '',
    role: 'waiter',
  });

  const loadData = useCallback(async () => {
    const [catRes, tblRes, opRes] = await Promise.all([
      apiRequest('/admin/catalog', { auth: true }),
      apiRequest('/admin/tables', { auth: true }),
      apiRequest('/admin/orders-payments', { auth: true }),
    ]);
    setCatalog(catRes);
    setTables(tblRes.tables || []);
    setOrdersPayments(opRes);

    if (catRes.categories?.length && !newItem.categoryId) {
      setNewItem((prev) => ({
        ...prev,
        categoryId: String(catRes.categories[0].id),
        stationId: String(catRes.stations?.[0]?.id || ''),
      }));
    }

    if (user?.role === 'owner') {
      const staffRes = await apiRequest('/admin/staff', { auth: true });
      setStaff(staffRes.staff || []);
    }
  }, [user?.role, newItem.categoryId]);

  useEffect(() => {
    loadData().catch((e) => setMsg(e.message));
  }, [loadData]);

  async function toggleItemAvailability(item) {
    await apiRequest(`/admin/menu-items/${item.id}`, {
      method: 'PATCH',
      auth: true,
      body: { isAvailable: !item.is_available },
    });
    await loadData();
  }

  async function handleCreateItem(e) {
    e.preventDefault();
    try {
      await apiRequest('/admin/menu-items', {
        method: 'POST',
        auth: true,
        body: {
          name: newItem.name,
          categoryId: Number(newItem.categoryId),
          stationId: Number(newItem.stationId),
          basePricePaise: Math.round(Number(newItem.priceRupees) * 100),
          isVeg: newItem.isVeg,
          spiceLevel: newItem.spiceLevel,
          description: newItem.description,
        },
      });
      setNewItem((p) => ({ ...p, name: '', priceRupees: '', description: '' }));
      setMsg('Menu item added.');
      await loadData();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function handleRegenerateQr(tableId) {
    await apiRequest(`/admin/tables/${tableId}/regenerate-qr`, {
      method: 'POST',
      auth: true,
      body: {},
    });
    setMsg('QR token regenerated. Previous QR code has been revoked.');
    await loadData();
  }

  function downloadQrDataUrl(t) {
    const a = document.createElement('a');
    a.href = t.qrDataUrl;
    a.download = `${t.tableNumber}-QR.png`;
    a.click();
  }

  async function handleCreateStaff(e) {
    e.preventDefault();
    try {
      await apiRequest('/admin/staff', {
        method: 'POST',
        auth: true,
        body: newStaff,
      });
      setNewStaff({ name: '', email: '', password: '', role: 'waiter' });
      setMsg('Staff account created.');
      await loadData();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function toggleStaffActive(member) {
    await apiRequest(`/admin/staff/${member.id}`, {
      method: 'PATCH',
      auth: true,
      body: { isActive: !member.is_active },
    });
    await loadData();
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
          <Link to="/staff" className="px-3 py-1.5 rounded-lg bg-stone-100 text-xs font-semibold">
            Floor
          </Link>
          <Link to="/kitchen" className="px-3 py-1.5 rounded-lg bg-stone-100 text-xs font-semibold">
            Kitchen
          </Link>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'menu', label: 'Menu & Deals' },
            { id: 'tables', label: 'Tables & QR Codes' },
            ...(user?.role === 'owner' ? [{ id: 'staff', label: 'Staff & Roles' }] : []),
            { id: 'orders', label: 'Orders & Payments' },
          ].map((t) => (
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

        {/* MENU & DEALS */}
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
                placeholder="Description"
                value={newItem.description}
                onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                className="sm:col-span-2 px-3 py-2 rounded-xl border border-stone-200 text-sm"
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
                      <td className="p-3 font-medium">{formatInr(it.base_price_paise)}</td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleItemAvailability(it)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            it.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {it.is_available ? 'In Stock' : 'Out of Stock'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TABLES & QR CODES */}
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
                  <Link to={`/t/${t.qrToken}`} className="text-amber-700 underline">
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

        {/* STAFF & ROLES (Owner only) */}
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
                            m.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {m.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ORDERS & PAYMENTS */}
        {tab === 'orders' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <h2 className="font-bold text-stone-900">Recent Orders</h2>
              <div className="divide-y divide-stone-100 text-sm">
                {ordersPayments.orders.map((o) => (
                  <div key={o.id} className="py-2 flex justify-between">
                    <div>
                      <div className="font-semibold">{o.order_number} ({o.table?.table_number})</div>
                      <div className="text-xs text-stone-500 capitalize">Status: {o.status}</div>
                    </div>
                    <div className="font-bold">{formatInr(o.total_paise)}</div>
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
                      <div className="font-semibold">{p.razorpay_order_id}</div>
                      <div className="text-xs text-stone-500 capitalize">
                        {p.status} • {p.method || 'pending'}
                      </div>
                    </div>
                    <div className="font-bold">{formatInr(p.amount_paise)}</div>
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
