# Security Policy & Threat Model — TableFlow (Vercel / Next.js Stack)

## Threat Model Summary (Phase 1 MVP)

| Asset / Surface | Threat | Mitigations Implemented |
| :--- | :--- | :--- |
| **Table QR Tokens (`/t/:tableToken`)** | Sequential table enumeration; stale QR reuse | 256-bit cryptographically random URL-safe tokens (`crypto.randomBytes(32)`); admin rotation endpoint immediately expires active sessions and revokes prior token |
| **Guest Orders & Bills** | Cross-table IDOR; price/discount tampering; order flooding | HMAC-signed `httpOnly` `tf_guest_session` cookie; every query scoped strictly to verified server `session.id`; server-side DB pricing/deals/CGST/SGST in integer paise; Upstash Redis rate limiting |
| **Waiter Call Button** | Alert flooding / DoS | 60-second DB cooldown per table session + Upstash rate limiting |
| **Staff / Kitchen / Admin Auth** | Credential stuffing, brute force, privilege escalation | Auth.js v5 with `bcryptjs` (cost `12`); 15-minute JWT sessions; DB `tokenVersion` + `isActive` validation on every protected API route; 5-strike 15-minute account lockout; Upstash login limiter; deny-by-default RBAC (`owner`, `manager`, `waiter`, `chef`) |
| **Cookie-Authenticated Routes** | CSRF on guest/staff mutations | Double-submit CSRF cookie (`tf_csrf`) + `x-csrf-token` header checked with `crypto.timingSafeEqual` + `SameSite` cookies + strict CORS allowlist |
| **API Inputs & Headers** | SQLi, XSS, mass assignment, clickjacking | Prisma parameterized queries only; Zod `.strict()` schema validation rejecting unknown fields; HTML tag stripping & escaping; strict `Content-Security-Policy`, `X-Frame-Options: DENY`, `nosniff`, HSTS |
| **Payments (Razorpay)** | Amount tampering, forged callbacks, replay webhooks | Server-side Razorpay order creation; `crypto.timingSafeEqual` HMAC-SHA256 verification; raw-body webhook verification + unique `webhook_event_id` idempotency |
| **Secrets, PII & Audit** | Secret leaks, excess PII retention, untracked edits | Fail-fast Zod startup validation (`src/lib/env.ts`); Husky pre-commit secret scanner + CI checks; guest email scrubbed via `DELETE /api/guest/privacy/email`; immutable `audit_logs` |
| **Inventory & Availability Engine** | Client availability forgery, ghost dish ordering | Server-side authoritative evaluation (`evaluateDishAvailability`); client-submitted availability is ignored; orders with out-of-stock items rejected with HTTP 400; shared ingredient status changes cascade immediately; rate limiting on toggles (`stock_toggle` 30/min); immutable `stock_events` log |
| **Purchases & Financial Reports** | Money rounding exploits, unauthorized cost inspection | Money stored strictly in integer paise (`total_cost_paise`); floating-point amounts rejected; purchases and reports protected by manager/owner RBAC; Chef cannot view purchase costs or financial margins; purchase edits require mandatory reason logged to audit trail |
| **Menu Modifications & Bulk Deletes** | Accidental data loss, cascading foreign key wipeouts | Non-destructive soft-delete (`archivedAt`) preserves past order history, guest receipts, and sales reports; bulk delete requires explicit typed confirmation (`"DELETE"`) and executes atomically |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities. Contact the repository maintainer privately or submit a GitHub Private Security Advisory with reproduction steps and impact details.
