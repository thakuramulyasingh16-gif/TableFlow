import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { Table, TableSession } from '@prisma/client';
import { AppError } from './api-error';
import { sha256Hex, signCookieValue, verifySignedCookieValue } from './crypto';
import { getEnv } from './env';
import { prisma } from './prisma';

export const GUEST_COOKIE_NAME = 'tf_guest_session';

export function setGuestSessionCookie(
  res: NextResponse,
  rawSessionToken: string,
  expiresAt: Date
): void {
  const env = getEnv();
  const signed = signCookieValue(rawSessionToken, env.GUEST_COOKIE_SECRET);
  res.cookies.set(GUEST_COOKIE_NAME, signed, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function requireGuestSession({
  allowPaid = false,
}: { allowPaid?: boolean } = {}): Promise<{ session: TableSession; table: Table }> {
  const cookieStore = await cookies();
  const rawSigned = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  if (!rawSigned) {
    throw new AppError(
      401,
      'Active table session required. Please scan your table QR code.',
      'GUEST_SESSION_REQUIRED'
    );
  }

  const env = getEnv();
  const rawToken = verifySignedCookieValue(rawSigned, env.GUEST_COOKIE_SECRET);
  if (!rawToken) {
    throw new AppError(401, 'Invalid table session signature.', 'GUEST_SESSION_INVALID');
  }

  const session = await prisma.tableSession.findUnique({
    where: { sessionTokenHash: sha256Hex(rawToken) },
    include: { table: true },
  });

  if (!session || !session.table || !session.table.isActive) {
    throw new AppError(401, 'Table session invalid or table inactive.', 'GUEST_SESSION_INVALID');
  }

  const allowed = allowPaid ? ['active', 'paid'] : ['active'];
  if (!allowed.includes(session.status)) {
    throw new AppError(401, 'Table session has ended. Please rescan QR.', 'GUEST_SESSION_ENDED');
  }

  if (session.expiresAt <= new Date()) {
    await prisma.tableSession.update({
      where: { id: session.id },
      data: { status: 'expired' },
    });
    throw new AppError(401, 'Table session expired due to inactivity. Please rescan QR.', 'GUEST_SESSION_EXPIRED');
  }

  if (session.status === 'active') {
    const now = new Date();
    const nextExpiry = new Date(now.getTime() + env.GUEST_SESSION_TTL_MINUTES * 60 * 1000);
    await prisma.tableSession.update({
      where: { id: session.id },
      data: { lastActivityAt: now, expiresAt: nextExpiry },
    });
  }

  return { session, table: session.table };
}
