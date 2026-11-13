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

### D. Razorpay (Test Mode Payments & Webhooks)
1. Create test API keys in [Razorpay Dashboard](https://dashboard.razorpay.com) -> **Settings -> API Keys**.
2. Create a Webhook pointing to `https://<your-vercel-domain>/api/webhooks/razorpay` subscribing to `payment.captured`, and set a strong `RAZORPAY_WEBHOOK_SECRET`.

### E. Resend (Email GST Receipts)
1. Create an API key on [Resend](https://resend.com) and verify your sending domain (or use `onboarding@resend.dev` for testing).

---

## 2. Vercel Environment Variables

In Vercel Project Settings -> **Environment Variables**, add:

| Variable | Scope | Example / Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | Production | `production` |
| `NEXT_PUBLIC_APP_URL` | All | `https://tableflow.vercel.app` |
| `CORS_ORIGIN` | Production | `https://tableflow.vercel.app` (never `*`) |
| `DATABASE_URL` | All | Pooled Postgres URL |
| `DIRECT_URL` | All | Direct Postgres URL for migrations |
| `AUTH_SECRET` | All | 96-char random hex (`crypto.randomBytes(48).toString('hex')`) |
| `GUEST_COOKIE_SECRET` | All | Distinct 96-char random hex |
| `GUEST_SESSION_TTL_MINUTES` | All | `120` |
| `CGST_BPS` | All | `250` (2.5%) |
| `SGST_BPS` | All | `250` (2.5%) |
| `UPSTASH_REDIS_REST_URL` | Production | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Production | Upstash REST Token |
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Supabase service role key (server-only) |
| `RAZORPAY_KEY_ID` | All | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Production | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | Production | Razorpay webhook secret |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | All | Same as `RAZORPAY_KEY_ID` |
| `RESEND_API_KEY` | Production | `re_...` |
| `RESEND_FROM` | All | `TableFlow Receipts <receipts@yourdomain.com>` |

---

## 3. Run Database Migrations & Seed

From your local terminal pointing `.env` (or exported env vars) to your production/staging `DATABASE_URL` and `DIRECT_URL`:

```bash
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

Save the randomly generated staff credentials printed once by `seed.ts`, and rotate them via the Owner account if desired.

---

## 4. Deploy to Vercel

1. Connect `thakuramulyasingh16-gif/TableFlow` in the Vercel Dashboard.
2. Vercel detects `vercel.json` (`npx prisma generate && npm run build`).
3. Click **Deploy**.
4. Verify `https://<your-domain>/api/health` returns `{"status":"ok"}`.

