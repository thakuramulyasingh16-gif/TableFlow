# TableFlow — Vercel-Ready QR Restaurant Ordering & Management (Phase 1 MVP)

TableFlow is a single-project **Next.js (App Router) + TypeScript + Tailwind CSS** application backed by **PostgreSQL + Prisma ORM**, **Auth.js v5**, **Upstash Redis**, **Supabase Realtime**, **Razorpay**, and **Resend**.

---

## 🚀 Start Here (Quickstart)

### Windows (One Click)
Double-click `start.bat` in the repository root.
- Automatically checks Node.js & `.env`
- Automatically provisions/starts PostgreSQL container if needed
- Validates database and pending migrations
- Launches the Next.js dev server and opens your browser to `http://localhost:3000`

### Command Line (Any OS)

```bash
# 1. Fresh machine setup (creates .env with cryptographically strong secrets, creates DB, migrates & seeds)
npm run setup

# 2. Start the dev server (runs automated preflight check, verifies DB & outputs direct URLs)
npm run dev
```

### Database Diagnostic & Verification Tool
To inspect your database connection, applied Prisma migrations, and live row counts at any time:
```bash
npm run db:check
```

---

## 🍽 Access URLs & Demo Credentials

| Role / Feature | URL | Demo Credentials |
| :--- | :--- | :--- |
| **Guest Menu (Table 1)** | `http://localhost:3000/t/CD2H_c5dMe73GlPoAbrs1RvOpD9Sfdq3h5JTxWDg_zg` | *No login needed (table QR)* |
| **Chef Inventory & Stock** | `http://localhost:3000/chef` | Chef / Manager / Owner |
| **Kitchen Display (KDS)** | `http://localhost:3000/kitchen` | Chef / Staff |
| **Live Floor Map** | `http://localhost:3000/staff/floor` | Waiter / Manager |
| **Waiter Calls Board** | `http://localhost:3000/staff/waiter-calls` | Waiter / Manager |
| **Admin & Manager Portal** | `http://localhost:3000/admin` | Owner / Manager |
| **Staff Sign In** | `http://localhost:3000/login` | See table below |
| **API Health Status** | `http://localhost:3000/api/health` | Public JSON healthcheck |

### Default Staff Accounts (Seeded)

| Role | Email | Password |
| :--- | :--- | :--- |
| **Owner** | `owner@tableflow.local` | `TableFlow@2026!Owner` |
| **Manager** | `manager@tableflow.local` | `TableFlow@2026!Manager` |
| **Waiter** | `waiter@tableflow.local` | `TableFlow@2026!Waiter` |
| **Chef** | `chef@tableflow.local` | `TableFlow@2026!Chef` |

---

## Features (Phase 1)

- **Guest (`/t/:tableToken`, no login)**:
  - Category & veg-only menu with search, spice levels, allergens, variants/sizes, and promo deals
  - Realtime ingredient-backed availability badge ("Currently unavailable" when required ingredients are out of stock)
  - Phone cart & server-authoritative order placement (blocks ordering unavailable dishes)
  - Live 4-step order tracking (`Received → Preparing → Ready → Served`)
  - One-tap **Call Waiter** with 60s cooldown
  - GST bill view, **Split Bill** (Full, Equal, By-Item), tip selector, Razorpay UPI-first payment (plus local test-mode simulator)
  - Email GST receipt (Resend) + **Delete my email (PII)** + post-payment 1–5 star review
- **Chef Inventory (`/chef`)**:
  - Dishes & Recipes tab: search/filter dishes, inspect recipe ingredients with live stock status badges
  - 1-tap stock status toggles: `In Stock`, `Out of Stock`, `Ordered`
  - Out of stock confirmation modal listing all other dishes affected by marking an ingredient out of stock
  - Ingredients tab: comprehensive ingredient list with search, usage count, and direct status toggles
  - Strict RBAC: chef cannot view costs, financial reports, or alter prices/recipes
- **Kitchen Display (`/kitchen`)**: Station-grouped KDS (`grill`, `fry`, `drinks`, `dessert`) with live elapsed timers, item `Preparing` / `Ready` sync, and direct link to `/chef` Stock Control
- **Staff Floor (`/staff`)**: Live floor map (`free`, `ordered`, `needs_help`, `bill_requested`), 1-tap order confirmation to kitchen, mark served, resolve waiter calls
- **Manager & Admin (`/admin`)**:
  - **Menu**: Dish catalog with expandable recipes, recipe editor (assign ingredients, quantities, optional flags, or create missing ingredients on the fly), manual availability override with mandatory reason, soft-delete with restore, and bulk delete modal with typed `"DELETE"` confirmation
  - **Deals**: Promo discount codes & percentage/flat rules
  - **Ingredients**: All raw materials, status toggles, and new ingredient modal
  - **Alerts**: Realtime stock alerts banner with audio chime, "Yes, I ordered it" purchase modal, and "Received" 1-tap resolution
  - **Purchases**: Raw material log with filtering (ingredient, supplier, date range), proactive purchase modal, purchase editing with required reason, and CSV export
  - **Reports**: KPI cards (Total Sales, Raw Material Spend, Net Margin, Orders, Spend Ratio), Recharts Line & Bar charts, monthly financial breakdown table, and CSV export
  - **Tables**: Printable/downloadable QR PNGs with token rotation
  - **Staff**: Owner-only staff RBAC management (`owner`, `manager`, `waiter`, `chef`)

---

## 🛠 Preflight Diagnostics (`scripts/preflight.mjs`)

When you run `npm run dev`, TableFlow's automated `predev` preflight script runs first and validates:
1. **`.env` existence & completeness**: Validates configuration using Zod schema; prints exact missing fields if invalid.
2. **PostgreSQL connectivity**: Verifies host & port reachability. If Docker container `tableflow-pg` is stopped, it auto-starts it.
3. **Database existence**: Checks if target database exists; auto-creates it if missing.
4. **Prisma migrations**: Verifies migration status; auto-deploys pending migrations with `prisma migrate deploy`.
5. **Port conflict check**: Checks if port 3000 is occupied; reports the occupying process name & PID.
6. **URL Banner**: Queries the active database for the first active table token and displays the full list of clickable URLs and staff credentials.

---

## Verification & Quality Commands

```powershell
npm.cmd run db:check
npm.cmd run secret-scan:all
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run audit:high
```

For production deployment on Vercel, see [`DEPLOY.md`](file:///C:/Amulya's%20Projects/TableFlow/DEPLOY.md).
