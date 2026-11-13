import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { generateOpaqueToken, sha256Hex, verifySignedCookieValue } from '@/lib/crypto';
import { setCsrfCookie } from '@/lib/csrf';
import { getEnv } from '@/lib/env';
import { GUEST_COOKIE_NAME, setGuestSessionCookie } from '@/lib/guest-session';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { initGuestSessionSchema, parseJsonBody } from '@/lib/validators';

export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit('global', getClientIp(req));
    const body = await parseJsonBody(req, initGuestSessionSchema);
    const env = getEnv();

    const table = await prisma.table.findFirst({
      where: { qrToken: body.tableToken, isActive: true },
    });
    if (!table) {
      throw new AppError(404, 'Invalid or revoked table QR code.', 'INVALID_TABLE_TOKEN');
    }

    // Reuse existing active session if cookie already belongs to this table
    const cookieStore = await cookies();
    const existingSigned = cookieStore.get(GUEST_COOKIE_NAME)?.value;
    if (existingSigned) {
      const rawExisting = verifySignedCookieValue(existingSigned, env.GUEST_COOKIE_SECRET);
      if (rawExisting) {
        const existingSession = await prisma.tableSession.findFirst({
          where: {
            sessionTokenHash: sha256Hex(rawExisting),
            tableId: table.id,
            status: 'active',
            expiresAt: { gt: new Date() },
          },
        });
        if (existingSession) {
          const res = NextResponse.json({
            table: { id: table.id, tableNumber: table.tableNumber, label: table.label, zone: table.zone },
            session: { id: existingSession.id, status: existingSession.status, expiresAt: existingSession.expiresAt },
          });
          setCsrfCookie(res);
          return res;
        }
      }
    }

    const rawSessionToken = generateOpaqueToken(32);
    const expiresAt = new Date(Date.now() + env.GUEST_SESSION_TTL_MINUTES * 60 * 1000);
    const session = await prisma.tableSession.create({
      data: {
        tableId: table.id,
        sessionTokenHash: sha256Hex(rawSessionToken),
        status: 'active',
        lastActivityAt: new Date(),
        expiresAt,
      },
    });

    const res = NextResponse.json(
      {
        table: { id: table.id, tableNumber: table.tableNumber, label: table.label, zone: table.zone },
        session: { id: session.id, status: session.status, expiresAt: session.expiresAt },
      },
      { status: 201 }
    );
    setGuestSessionCookie(res, rawSessionToken, expiresAt);
    setCsrfCookie(res);
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}

