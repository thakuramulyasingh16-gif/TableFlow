# Deploying TableFlow to Vercel

This guide walks through deploying TableFlow (Next.js App Router + Postgres + Auth.js + Upstash Redis + Supabase Realtime + Razorpay + Resend) to Vercel with zero local-only dependencies.

---

## 1. Provision Managed Services

### A. PostgreSQL (Neon or Supabase)
1. Create a Postgres database on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Copy **two** connection strings:
   - `DATABASE_URL`: Pooled connection string (with `?sslmode=require&pgbouncer=true` if using Supabase/Neon pooler)
   - `DIRECT_URL`: Direct non-pooled connection string (used by `prisma migrate deploy`)

### B. Upstash Redis (Rate Limiting)
1. Create a free Redis database on [Upstash](https://upstash.com).
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### C. Supabase Realtime (Live Updates)
1. In your Supabase project settings -> **API**, copy:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### D. Razorpay (Payments & Webhooks)
1. Create test or live API keys in [Razorpay Dashboard](https://dashboard.razorpay.com) -> **Settings -> API Keys**.
2. Create a Webhook pointing to `https://<your-vercel-domain>/api/webhooks/razorpay` subscribing to the following three events:
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`
3. Set a strong `RAZORPAY_WEBHOOK_SECRET` and add it to your environment variables.

### E. Resend (Email GST Receipts)
1. Create an API key on [Resend](https://resend.com) and verify your sending domain (or use `onboarding@resend.dev` for testing).

---

## 2. Vercel Environment Variables

In Vercel Project Settings -> **Environment Variables**, add:

| Variable | Scope | Example / Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | Production | `production` |
| `HUSKY` | All | `0` (disables git hooks during automated Vercel build) |
| `NEXT_PUBLIC_APP_URL` | All | `https://tableflow.vercel.app` |
| `CORS_ORIGIN` | Production | `https://tableflow.vercel.app` (never `*`) |
| `DATABASE_URL` | All | Pooled Postgres URL |
| `DIRECT_URL` | All | Direct Postgres URL for migrations |
| `AUTH_SECRET` | All | Min 48-char random base64 / hex |
| `GUEST_COOKIE_SECRET` | All | Distinct min 48-char random base64 / hex |
| `MFA_ENCRYPTION_KEY` | Production | Exactly 32-byte base64-encoded key |
| `REALTIME_CHANNEL_SECRET` | Production | Min 32 chars random string for realtime HMAC derivation |
| `GUEST_SESSION_TTL_MINUTES` | All | `120` |
| `CGST_BPS` | All | `250` (2.5%) |
| `SGST_BPS` | All | `250` (2.5%) |
| `UPSTASH_REDIS_REST_URL` | Production | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Production | Upstash REST Token |
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Supabase service role key (server-only) |
| `RAZORPAY_KEY_ID` | All | `rzp_live_...` or `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Production | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | Production | Razorpay webhook secret |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | All | Same as `RAZORPAY_KEY_ID` |
| `RESEND_API_KEY` | Production | `re_...` |
| `RESEND_FROM` | All | `TableFlow Receipts <receipts@yourdomain.com>` |

### Generating Cryptographic Secrets (Windows cmd / PowerShell)

Run these commands in Windows cmd or terminal to generate high-entropy secrets for your deployment:

```cmd
rem 1. AUTH_SECRET (Session encryption, min 48 chars)
node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"

rem 2. GUEST_COOKIE_SECRET (Guest session HMAC cookie signing, min 48 chars)
node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"

rem 3. MFA_ENCRYPTION_KEY (AES-256-GCM TOTP secret encryption at rest, EXACTLY 32 bytes base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

rem 4. REALTIME_CHANNEL_SECRET (Private realtime channel name derivation, min 32 chars)
node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"

rem 5. RAZORPAY_WEBHOOK_SECRET (Webhook signature verification)
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## 3. Run Database Migrations & Production Owner Setup

> [!WARNING]
> **CRITICAL: DO NOT RUN DEMO SEED IN PRODUCTION!**
> Never run `npm run db:seed` or `npx tsx prisma/seed.ts` in production. The seed script inserts sample demo menu items, demo orders, test tables, and demo accounts intended solely for development. Running it in production will contaminate your live database with sample test data.

To initialize your production database safely:

```bash
# 1. Apply Prisma migrations to the production database
npx prisma migrate deploy

# 2. Bootstrap production roles, restaurant settings, and owner account ONLY
npm run create-owner
```

Optionally pass non-interactive flags when running `create-owner`:
```bash
npm run create-owner -- --name "Restaurant Owner" --email "owner@yourdomain.com" --username "owner"
```

Save the temporary password printed once by `create-owner`. On your first login at `/login`, you will be prompted to set a permanent, secure password.

---

## 4. Deploy to Vercel

1. Connect `thakuramulyasingh16-gif/TableFlow` in the Vercel Dashboard.
2. Vercel detects `vercel.json` (`npx prisma generate && npm run build`).
3. Click **Deploy**.
4. Verify `https://<your-domain>/api/health` returns `{"status":"ok"}`.

---

## 5. Supabase Realtime Authorization & RLS Private Channel Policies

TableFlow uses cryptographically unguessable, HMAC-SHA256 derived private channel names (`session_private_<sessionId>_<token>` and `role_private_<role>_<token>`) derived server-side with `REALTIME_CHANNEL_SECRET`. Server-side events are broadcast exclusively using the trusted `SUPABASE_SERVICE_ROLE_KEY`.

To enforce strict Row Level Security (RLS) on Supabase Realtime and block unauthorized client-side broadcasts, execute the following SQL in your Supabase SQL Editor:

```sql
-- 1. Enable RLS on the Realtime messages table
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- 2. Grant full broadcast permissions only to the service role (Next.js server-side)
CREATE POLICY "service_role_all" ON realtime.messages
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- 3. Allow clients (anon / authenticated guests & staff) to listen only to permitted channels
CREATE POLICY "clients_listen_only" ON realtime.messages
FOR SELECT TO anon, authenticated
USING (true);

-- 4. Explicitly deny and block client-side publishing / message injection
CREATE POLICY "block_client_publish" ON realtime.messages
FOR INSERT TO anon, authenticated
WITH CHECK (false);
```

---

## 6. Step-by-Step Go-Live Checklist

Complete this checklist prior to launching in production:

- [ ] **1. Managed Database**: Provision managed PostgreSQL (e.g. Neon or Supabase) with both `DATABASE_URL` (pooled) and `DIRECT_URL` (direct).
- [ ] **2. Upstash Redis**: Provision Upstash Redis instance and configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- [ ] **3. Supabase Realtime**: Provision Supabase project and apply RLS SQL policies from Section 5.
- [ ] **4. Cryptographic Secrets**: Generate secrets using `node -e` commands from Section 2 and configure in Vercel environment variables.
- [ ] **5. Environment Variables**: Add `HUSKY=0`, `NODE_ENV=production`, `NEXT_PUBLIC_APP_URL`, and `CORS_ORIGIN` to Vercel.
- [ ] **6. Database Migrations**: Run `npx prisma migrate deploy` targeting production `DATABASE_URL` / `DIRECT_URL`.
- [ ] **7. Bootstrap Owner**: Run `npm run create-owner` to create system roles and initial owner account. **Verify that `npm run db:seed` was NOT run.**
- [ ] **8. Razorpay Webhooks**: Configure webhook endpoint (`/api/webhooks/razorpay`) subscribed to `payment.captured`, `payment.failed`, and `refund.processed` with matching secret.
- [ ] **9. Resend Domain**: Verify sending domain in Resend and configure `RESEND_API_KEY` and `RESEND_FROM`.
- [ ] **10. Initial Login & Setup**: Log into `/login` with owner credentials, change initial temporary password, and configure restaurant legal details, GSTIN, FSSAI, and tables under `/admin`.
- [ ] **11. Health Check**: Verify `https://<your-domain>/api/health` returns status `ok`.



