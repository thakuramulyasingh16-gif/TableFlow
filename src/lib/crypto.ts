import crypto from 'node:crypto';

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyHmacSha256(
  payload: string | Buffer,
  secret: string,
  providedSignature: string
): boolean {
  if (!payload || !secret || !providedSignature) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return timingSafeEqualStr(expected, providedSignature);
}

export function signCookieValue(value: string, secret: string): string {
  const sig = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${sig}`;
}

export function verifySignedCookieValue(signed: string, secret: string): string | null {
  if (typeof signed !== 'string') return null;
  const idx = signed.lastIndexOf('.');
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  if (!timingSafeEqualStr(expected, sig)) return null;
  return value;
}

