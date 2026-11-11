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

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities. Contact the repository maintainer privately or submit a GitHub Private Security Advisory with reproduction steps and impact details.
