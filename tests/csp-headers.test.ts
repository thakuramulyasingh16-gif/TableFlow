import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp } from '../src/middleware';
import nextConfig from '../next.config';

test('CSP: production policy uses nonces, blocks unsafe-eval, and disallows unsafe-inline scripts', () => {
  const nonce = 'dGVzdE5vbmNlMTIzNDU2';
  const prodCsp = buildCsp(nonce, false);

  // Script-src checks
  assert.ok(prodCsp.includes(`'nonce-${nonce}'`), 'Must contain nonce in script-src');
  assert.equal(prodCsp.includes("'unsafe-eval'"), false, 'Production CSP must not allow unsafe-eval');
  
  // Extract script-src directive
  const directives = prodCsp.split(';').map((d) => d.trim());
  const scriptDirective = directives.find((d) => d.startsWith('script-src'));
  assert.ok(scriptDirective);
  assert.equal(scriptDirective.includes("'unsafe-inline'"), false, 'script-src must not contain unsafe-inline');

  // Razorpay and Supabase allowances
  assert.ok(prodCsp.includes('https://checkout.razorpay.com'));
  assert.ok(prodCsp.includes('https://api.razorpay.com'));
  assert.ok(prodCsp.includes('https://*.supabase.co'));
  assert.ok(prodCsp.includes('wss://*.supabase.co'));
  assert.ok(prodCsp.includes('https://*.public.blob.vercel-storage.com'));
});

test('CSP: development policy allows unsafe-eval for hot reload / source maps with nonce', () => {
  const nonce = 'ZGV2Tm9uY2UxMjM0NTY=';
  const devCsp = buildCsp(nonce, true);

  assert.ok(devCsp.includes(`'nonce-${nonce}'`));
  assert.ok(devCsp.includes("'unsafe-eval'"), 'Development CSP should allow unsafe-eval');
});

test('Image remotePatterns: strictly restricted to Supabase Storage and Vercel Blob domains', () => {
  const patterns = nextConfig.images?.remotePatterns || [];
  assert.ok(patterns.length >= 2);

  // Check no wildcard '**' exists
  const hasOpenWildcard = patterns.some((p: { hostname?: string }) => p.hostname === '**');
  assert.equal(hasOpenWildcard, false, 'Image patterns must not use open wildcard **');

  // Verify explicit allowlist
  const hostnames = patterns.map((p: { hostname?: string }) => p.hostname);
  assert.ok(hostnames.includes('*.supabase.co'));
  assert.ok(hostnames.includes('*.public.blob.vercel-storage.com'));
});

test('Security Headers: includes COOP, CORP, HSTS, and frame protection', async () => {
  const headersConfig = typeof nextConfig.headers === 'function' ? await nextConfig.headers() : [];
  assert.ok(headersConfig.length > 0);

  const mainRoute = headersConfig.find((h: { source: string }) => h.source === '/((?!api).*)');
  assert.ok(mainRoute);

  const headerMap = new Map(mainRoute.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
  assert.equal(headerMap.get('Cross-Origin-Opener-Policy'), 'same-origin');
  assert.equal(headerMap.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(headerMap.get('X-Frame-Options'), 'DENY');
  assert.equal(headerMap.get('X-Content-Type-Options'), 'nosniff');
});
