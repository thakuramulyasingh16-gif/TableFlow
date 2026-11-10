import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Check, CheckCircle2, LogOut, RefreshCw, Utensils } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import { createStaffSocket } from '../lib/socket.js';
import { formatInr } from '../lib/format.js';

const TABLE_COLORS = {
  free: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  ordered: 'bg-amber-50 border-amber-400 text-amber-950',
  needs_help: 'bg-rose-100 border-rose-500 text-rose-950 animate-pulse',
  bill_requested: 'bg-indigo-50 border-indigo-400 text-indigo-950',
};

export default function StaffDashboard() {
  const { user, logout } = useAuth();
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [floorRes, ordersRes, callsRes] = await Promise.all([
        apiRequest('/staff/floor', { auth: true }),
        apiRequest('/staff/orders', { auth: true }),
        apiRequest('/staff/waiter-calls', { auth: true }),
      ]);
      setTables(floorRes.tables || []);
      setOrders(ordersRes.orders || []);
      setCalls(callsRes.calls || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const socket = createStaffSocket();
    const refresh = () => loadAll();
    socket.on('order:created', refresh);
    socket.on('order:updated', refresh);
    socket.on('waiter:call_created', refresh);
    socket.on('waiter:call_resolved', refresh);
    socket.on('table:status_changed', refresh);
    socket.on('payment:captured', refresh);
    return () => socket.disconnect();
  }, [loadAll]);

  async function confirmOrder(orderId) {
    await apiRequest(`/staff/orders/${orderId}/confirm`, { method: 'POST', auth: true, body: {} });
    await loadAll();
  }

  async function markServed(orderId) {
    await apiRequest(`/staff/orders/${orderId}/serve`, { method: 'POST', auth: true, body: {} });
    await loadAll();
  }

  async function resolveCall(callId) {
    await apiRequest(`/staff/waiter-calls/${callId}/resolve`, { method: 'POST', auth: true, body: {} });
    await loadAll();
  }

  async function resetTableFree(tableId) {
    await apiRequest(`/staff/tables/${tableId}/status`, {
      method: 'PATCH',
      auth: true,
      body: { status: 'free' },
    });
    await loadAll();
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-white border-b border-stone-200 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Utensils className="w-5 h-5 text-amber-600" />
          <div>
            <h1 className="font-bold text-stone-900">Staff Floor & Service</h1>
            <p className="text-xs text-stone-500">
              {user?.name} ({user?.role})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(user?.role === 'owner' || user?.role === 'manager') && (
            <>
              <Link to="/kitchen" className="px-3 py-1.5 rounded-lg bg-stone-100 text-xs font-semibold">
                Kitchen
              </Link>
              <Link to="/admin" className="px-3 py-1.5 rounded-lg bg-stone-100 text-xs font-semibold">
                Admin
              </Link>
            </>
          )}
          <button onClick={loadAll} className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        {/* Waiter Call Alerts */}
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

        {/* Live Floor Map */}
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
                  <div className="text-xs opacity-80 mt-0.5">{t.zone} • {t.capacity} seats</div>
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

        {/* Incoming & Active Orders */}
        <section className="space-y-3">
          <h2 className="font-bold text-stone-900">Orders Queue ({orders.length})</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map((ord) => (
              <div key={ord.id} className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">{ord.table?.label || `Table #${ord.table_id}`}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold capitalize">
                      {ord.status}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {ord.order_number} • {formatInr(ord.total_paise)}
                  </div>
                  <ul className="mt-3 space-y-1 text-sm border-t border-stone-100 pt-2">
                    {(ord.items || []).map((it) => (
                      <li key={it.id} className="flex justify-between">
                        <span>
                          {it.quantity}× {it.item_name_snapshot}
                          {it.variant_name_snapshot ? ` (${it.variant_name_snapshot})` : ''}
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
                    <Check className="w-4 h-4" /> Confirm & Send to Kitchen
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
