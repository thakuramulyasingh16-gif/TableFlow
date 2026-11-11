import Link from 'next/link';
import { ChefHat, QrCode, ShieldCheck, Users, UtensilsCrossed } from 'lucide-react';
import { Badge, Card } from '@/components/ui';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="bg-signature-gradient rounded-b-[28px] px-5 sm:px-8 py-6 shadow-card">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-leaf text-surface flex items-center justify-center">
              <UtensilsCrossed className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <span className="text-[24px] font-extrabold text-ink tracking-tight">TableFlow</span>
              <p className="text-[12px] font-bold text-leaf">QR Dining &amp; Kitchen Flow</p>
            </div>
          </div>
          <Link
            href="/login"
            className="min-h-[44px] px-5 rounded-[14px] bg-leaf text-surface font-bold text-[14px] inline-flex items-center hover:bg-leaf-mid transition"
          >
            Staff Sign In
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-8 py-12 flex flex-col justify-center space-y-10">
        <div className="max-w-2xl space-y-3">
          <Badge tone="mint">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Live QR Ordering &amp; Realtime Sync
          </Badge>
          <h1 className="text-[26px] sm:text-[38px] font-extrabold text-ink leading-tight">
            Scan, order, split &amp; pay—freshly synced to every table.
          </h1>
          <p className="text-[15px] text-muted">
            Guests scan their table QR code at{' '}
            <code className="px-2 py-0.5 rounded-full bg-mint-bg text-leaf font-bold text-[13px]">
              /t/:tableToken
            </code>{' '}
            with zero login. Staff, kitchen stations, and admins stay coordinated in real time.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 space-y-2">
            <QrCode className="w-7 h-7 text-leaf" aria-hidden="true" />
            <h2 className="font-extrabold text-[17px] text-ink">Guest QR Menu</h2>
            <p className="text-[13px] text-muted">
              Scan any table QR code from Admin to browse, customize, call waiter, and pay via UPI.
            </p>
          </Card>

          <Link href="/staff" className="block">
            <Card className="p-5 space-y-2 h-full hover:border-leaf transition">
              <Users className="w-7 h-7 text-leaf" aria-hidden="true" />
              <h2 className="font-extrabold text-[17px] text-ink">Staff Floor Map</h2>
              <p className="text-[13px] text-muted">
                1-tap order confirmation, live table states, and instant waiter-call resolution.
              </p>
            </Card>
          </Link>

          <Link href="/kitchen" className="block">
            <Card className="p-5 space-y-2 h-full hover:border-leaf transition">
              <ChefHat className="w-7 h-7 text-leaf" aria-hidden="true" />
              <h2 className="font-extrabold text-[17px] text-ink">Kitchen Display</h2>
              <p className="text-[13px] text-muted">
                Station-grouped tickets with On-time / Due-soon / Late timers and 1-tap Mark Ready.
              </p>
            </Card>
          </Link>

          <Link href="/admin" className="block">
            <Card className="p-5 space-y-2 h-full hover:border-leaf transition">
              <ShieldCheck className="w-7 h-7 text-leaf" aria-hidden="true" />
              <h2 className="font-extrabold text-[17px] text-ink">Admin Console</h2>
              <p className="text-[13px] text-muted">
                Menu CRUD, printable/rotatable QR tokens, staff RBAC, and payment records.
              </p>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
