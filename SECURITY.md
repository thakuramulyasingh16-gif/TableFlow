# Security Policy & Threat Model — TableFlow

## Threat Model Summary (Phase 1 MVP)

| Asset / Surface | Threat | Mitigations Implemented |
| :--- | :--- | :--- |
| **Table QR Tokens (`/t/:tableToken`)** | Enumeration of sequential table IDs; stale QR reuse | 256-bit cryptographically random URL-safe tokens; admin revocation/regeneration endpoint; server-side table session binding |
| **Guest Orders & Bills** | IDOR across tables; price/discount tampering; order spam | Session-scoped queries (ID derived only from verified `httpOnly` cookie); server-side DB price/tax/deal recomputation in integer paise; per-session & per-IP rate limiting |
| **Waiter Call Button** | DoS / alert flooding to staff | Cooldown enforced per table session (60s) + rate limiting |
| **Staff / Kitchen / Admin Auth** | Credential stuffing, brute force, token theft, privilege escalation | `bcryptjs` (cost >= 12); 15m JWT access tokens; rotating `httpOnly` refresh tokens with reuse family revocation; 5-strike lockout + login rate limiter; deny-by-default RBAC |
| **Cookie-Authenticated Routes** | CSRF on refresh, logout, guest actions | Double-submit CSRF token (`tf_csrf` cookie + `X-CSRF-Token` header) + `SameSite` cookies + strict CORS allowlist |
| **API Inputs & Uploads** | SQLi, XSS, mass assignment, malicious file uploads | Sequelize parameterized ORM queries only; Zod `.strict()` schema validation; HTML stripping/escaping; Helmet CSP; image magic-byte & MIME checks, 2MB cap, random UUID filenames |
| **Payments (Razorpay)** | Amount spoofing, forged callback, duplicate webhook credit | Server-side Razorpay order creation; constant-time HMAC-SHA256 signature verification; webhook raw-body signature verification + `webhook_event_id` idempotency |
| **Socket.io Realtime** | Unauthenticated room snooping, spoofed status events | Handshake auth (staff JWT or verified guest session); isolated rooms per role/station/table_session; server-authoritative state transitions |
| **PII & Auditability** | Excess PII retention, untracked admin edits | Minimal PII (guest email stored only on receipt request and deletable via API); immutable `audit_logs` for auth, role, price/menu, and payment/refund actions |

## Supported Versions

Phase 1 MVP (`main` branch).

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.
1. Email the repository maintainer privately or submit a GitHub Security Advisory (Private Vulnerability Reporting) if enabled.
2. Include reproduction steps, affected endpoint/component, and potential impact.
3. We aim to acknowledge reports within 48 hours and provide a remediation timeline within 5 business days.
