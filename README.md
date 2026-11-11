# TableFlow — Vercel-Ready QR Restaurant Ordering & Management (Phase 1 MVP)

TableFlow is a single-project **Next.js (App Router) + TypeScript + Tailwind CSS** application backed by **PostgreSQL + Prisma ORM**, **Auth.js v5**, **Upstash Redis**, **Supabase Realtime**, **Razorpay**, and **Resend**.

---

## Features (Phase 1)

- **Guest (`/t/:tableToken`, no login)**:
  - Category & veg-only menu with search, spice levels, allergens, variants/sizes, and promo deals
  - Phone cart & server-authoritative order placement
  - Live 4-step order tracking (`Received → Preparing → Ready → Served`)
  - One-tap **Call Waiter** with 60s cooldown
  - GST bill view, **Split Bill** (Full, Equal, By-Item), tip selector, Razorpay UPI-first payment (plus local test-mode simulator)
  - Email GST receipt (Resend) + **Delete my email (PII)** + post-payment 1–5 star review
- **Staff (`/staff`)**: Live floor map (`free`, `ordered`, `needs_help`, `bill_requested`), 1-tap order confirmation to kitchen, mark served, resolve waiter calls
- **Kitchen (`/kitchen`)**: Station-grouped KDS (`grill`, `fry`, `drinks`, `dessert`) with live elapsed timers and item `Preparing` / `Ready` sync
- **Admin (`/admin`)**: Menu & stock CRUD, printable/downloadable QR PNGs with token rotation, owner-only staff RBAC, orders & payments overview

---

## Local Development (Windows)

1. **Install dependencies** (use `npm.cmd` in PowerShell if execution policy blocks `npm.ps1`):
   ```powershell
   npm.cmd install
   ```
2. **Configure `.env.local`** from [`.env.example`](file:///C:/Amulya's%20Projects/TableFlow/.env.example) and set `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, and `GUEST_COOKIE_SECRET`.
3. **Run Prisma migrations and seed demo data**:
   ```powershell
   npx prisma migrate dev
   npm.cmd run db:seed
   ```
4. **Start the Next.js server**:
   ```powershell
   npm.cmd run dev
   ```
   Open `http://localhost:3000` (and `/t/<qrToken>` printed by `db:seed`).

---

## Verification Commands

```powershell
npm.cmd run secret-scan:all
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run audit:high
```

For production deployment on Vercel, see [`DEPLOY.md`](file:///C:/Amulya's%20Projects/TableFlow/DEPLOY.md).
