import { Link } from 'react-router-dom';
import { QrCode, ChefHat, Users, ShieldCheck, UtensilsCrossed } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-orange-50 flex flex-col">
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-sm">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-stone-900">TableFlow</span>
        </div>
        <Link
          to="/login"
          className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition"
        >
          Staff Sign In
        </Link>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-14 flex flex-col justify-center">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-4">
            <ShieldCheck className="w-3.5 h-3.5" /> Secure QR Dining & Kitchen Operations
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-stone-900 tracking-tight leading-tight">
            Scan, order, split & pay—synced live to every table.
          </h1>
          <p className="mt-4 text-lg text-stone-600">
            Guests scan their table QR code at <code className="px-1.5 py-0.5 rounded bg-stone-200/70 text-sm">/t/:tableToken</code> with zero login. Staff, kitchen stations, and admins operate in real time with role-based access control.
          </p>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-sm">
            <QrCode className="w-7 h-7 text-amber-600 mb-3" />
            <h2 className="font-semibold text-stone-900">Guest QR Menu</h2>
            <p className="text-sm text-stone-600 mt-1">
              Scan a table QR code generated in the Admin console to start an isolated table session.
            </p>
          </div>
          <Link
            to="/staff"
            className="p-5 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-400 transition"
          >
            <Users className="w-7 h-7 text-emerald-600 mb-3" />
            <h2 className="font-semibold text-stone-900">Staff Floor & Alerts</h2>
            <p className="text-sm text-stone-600 mt-1">
              1-tap order confirmation, live floor map, and waiter call resolution.
            </p>
          </Link>
          <Link
            to="/kitchen"
            className="p-5 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-400 transition"
          >
            <ChefHat className="w-7 h-7 text-orange-600 mb-3" />
            <h2 className="font-semibold text-stone-900">Kitchen Display (KDS)</h2>
            <p className="text-sm text-stone-600 mt-1">
              Station-grouped tickets (Grill, Fry, Drinks, Dessert) with live elapsed timers.
            </p>
          </Link>
          <Link
            to="/admin"
            className="p-5 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-400 transition"
          >
            <ShieldCheck className="w-7 h-7 text-indigo-600 mb-3" />
            <h2 className="font-semibold text-stone-900">Admin Console</h2>
            <p className="text-sm text-stone-600 mt-1">
              Menu & deals CRUD, printable QR tokens, staff RBAC, and payment records.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
