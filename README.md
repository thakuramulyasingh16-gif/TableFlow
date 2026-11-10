# TableFlow — QR-Based Restaurant Ordering & Management System (Phase 1 MVP)

TableFlow is a security-first, real-time QR dining platform built as a monorepo (`/client` + `/server`). Guests scan a table's unguessable QR token (`/t/:tableToken`) to browse the menu, order, call a waiter, split & pay their bill via Razorpay (UPI-first), receive a GST email receipt, and leave a review—while staff, kitchen stations, and admins stay synced in real time via Socket.io.

---

## Architecture & Tech Stack

- **Frontend (`/client`)**: React 19 (Vite), Tailwind CSS, React Router, Socket.io Client
- **Backend (`/server`)**: Node.js, Express, Sequelize ORM (MySQL 8.0, parameterized queries only), Socket.io, Zod
- **Payments**: Razorpay (server-side orders, HMAC-SHA256 verification, idempotent webhooks)
- **Phase 2 Readiness**: Modular `/api/*` route domains, `table_sessions` boundary, and authenticated Socket.io room isolation allow Phase 2 features (games, loyalty rewards, AI assistant) to plug in without refactoring core auth or ordering.

---

## Windows Setup Guide

### 1. Prerequisites
- **Node.js v22+** (`node -v`)
- **MySQL Server 8.0+** running locally on port `3306`

> **PowerShell Note (Windows):** If `npm` fails due to `npm.ps1` execution policy, use `npm.cmd` (e.g., `npm.cmd install`, `npm.cmd test`).

### 2. Create Database & Least-Privilege MySQL User
Connect to MySQL as `root` (e.g., via MySQL Command Line Client or Workbench) and run:

```sql
CREATE DATABASE IF NOT EXISTS tableflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create a least-privilege runtime user for the application
CREATE USER IF NOT EXISTS 'tableflow_app'@'localhost' IDENTIFIED BY 'YourStrongPasswordHere!';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON tableflow.* TO 'tableflow_app'@'localhost';
FLUSH PRIVILEGES;
```

*(In strict production, run migrations with a separate schema-owner user and grant `tableflow_app` only `SELECT, INSERT, UPDATE, DELETE`.)*

### 3. Configure Environment Variables
Copy `.env.example` to `.env` in the repository root (`TableFlow/.env`):

```powershell
Copy-Item .env.example .env
```

Generate strong random secrets (`>= 32` chars) using Node:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Fill in `.env`:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` (distinct 96-hex-char secrets)
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (Test Mode keys; in local dev without Razorpay keys, guest checkout includes a Test Mode UPI simulator signed server-side)
- Optional `SMTP_*` variables for real email delivery (defaults to Nodemailer JSON logger transport in dev)

### 4. Install Dependencies
```powershell
npm.cmd install
npm.cmd --prefix server install
npm.cmd --prefix client install
```

### 5. Run Migrations & Seed Data
```powershell
npm.cmd --prefix server run migrate
npm.cmd --prefix server run seed
```

> **Important:** The seed script generates **strong random passwords** for the 4 demo staff accounts (`owner@tableflow.local`, `manager@tableflow.local`, `waiter@tableflow.local`, `chef@tableflow.local`) and prints them **once** in the terminal. Copy them immediately! It also creates 10 tables (`T1`–`T10`) with unguessable QR tokens.

### 6. Run the Application (Development)
Start backend and frontend in two terminals:

```powershell
# Terminal 1 — API + Socket.io Server (http://localhost:5000)
npm.cmd --prefix server run dev

# Terminal 2 — Vite React App (http://localhost:5173)
npm.cmd --prefix client run dev
```

Open `http://localhost:5173/login` to sign in as Owner/Admin and view/download the printable QR codes under **Tables & QR Codes**, or open `/t/<qrToken>` directly for the guest view.

---

## Verification Commands

```powershell
# Secret scan across tracked files
npm.cmd run secret-scan:all

# Lint server & client
npm.cmd run lint

# Server unit & integration tests (auth, RBAC, pricing, payments, webhooks, uploads)
npm.cmd test

# Security audit (fails on high/critical)
npm.cmd run audit:all

# Production frontend build
npm.cmd --prefix client run build
```

---

## Security Checklist (Phase 1 MVP)

- [x] Passwords hashed with `bcryptjs` (cost `12`); demo passwords randomly generated at seed time
- [x] Short-lived JWT access tokens (`15m`) + rotating `httpOnly` refresh cookies with reuse-detection family revocation
- [x] Deny-by-default RBAC middleware (`owner`, `manager`, `waiter`, `chef`)
- [x] Login rate limiting + 5-strike 15-minute account lockout
- [x] Unguessable 256-bit table QR tokens, revocable/regenerable by admin
- [x] IDOR-safe `httpOnly` signed table sessions with inactivity expiration and post-payment closure
- [x] Strict Zod `.strict()` schema validation rejecting unknown fields on all endpoints
- [x] Sequelize parameterized ORM queries only (no string-interpolated SQL)
- [x] Helmet strict CSP, strict CORS allowlist (no wildcard in production), double-submit CSRF protection
- [x] Server-authoritative pricing, deals, and CGST/SGST calculation in integer paise
- [x] Razorpay server-side order creation, constant-time HMAC signature verification, and idempotent webhooks
- [x] Safe image upload validation (MIME allowlist, magic-byte inspection, UUID filenames, 2MB cap, `nosniff`)
- [x] Authenticated Socket.io connections, isolated per-role/station/session rooms, validated payloads
- [x] Minimal PII (guest email deletable via `DELETE /api/guest/privacy/email`) + `audit_logs` for sensitive actions
- [x] Husky pre-commit secret scanner + GitHub Actions CI (`lint`, `test`, `npm audit`) + `SECURITY.md`
