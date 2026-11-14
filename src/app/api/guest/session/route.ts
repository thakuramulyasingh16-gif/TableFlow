import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { generateOpaqueToken, sha256Hex, verifySignedCookieValue } from '@/lib/crypto';
import { setCsrfCookie } from '@/lib/csrf';
import { getEnv } from '@/lib/env';
import { GUEST_COOKIE_NAME, setGuestSessionCookie } from '@/lib/guest-session';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { getSessionRealtimeChannel } from '@/lib/realtime';
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
            session: {
              id: existingSession.id,
              status: existingSession.status,
              expiresAt: existingSession.expiresAt,
              realtimeChannel: getSessionRealtimeChannel(existingSession.id),
            },
            joinPin: existingSession.joinPin,
          });
          setCsrfCookie(res);
          return res;
        }
      }
    }

    // Check if there is already an active session for this table
    const activeSession = await prisma.tableSession.findFirst({
      where: {
        tableId: table.id,
        status: 'active',
        expiresAt: { gt: new Date() },
      },
    });

    if (activeSession) {
      // Require PIN to join the active table session
      if (!body.pin) {
        return NextResponse.json({
          requiresPin: true,
          table: { id: table.id, tableNumber: table.tableNumber, label: table.label, zone: table.zone },
        });
      }

      // Enforce rate limit on PIN attempts per table/IP
      await enforceRateLimit('table_pin', `${getClientIp(req)}:${table.id}`);

      if (!activeSession.joinPin || activeSession.joinPin !== body.pin.trim()) {
        throw new AppError(401, 'Invalid table PIN. Please ask your waiter or dining partner.', 'INVALID_TABLE_PIN');
      }

      // PIN valid - join the shared session and issue signed cookie
      let rawToken = activeSession.rawToken;
      if (!rawToken) {
        rawToken = generateOpaqueToken(32);
        await prisma.tableSession.update({
          where: { id: activeSession.id },
          data: {
            sessionTokenHash: sha256Hex(rawToken),
            rawToken,
          },
        });
      }

      const res = NextResponse.json({
        table: { id: table.id, tableNumber: table.tableNumber, label: table.label, zone: table.zone },
        session: {
          id: activeSession.id,
          status: activeSession.status,
          expiresAt: activeSession.expiresAt,
          realtimeChannel: getSessionRealtimeChannel(activeSession.id),
        },
        joinPin: activeSession.joinPin,
      });
      setGuestSessionCookie(res, rawToken, activeSession.expiresAt);
      setCsrfCookie(res);
      return res;
    }

    // First scanner on idle table creates the active session and generates the 4-digit PIN
    const rawSessionToken = generateOpaqueToken(32);
    const joinPin = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + env.GUEST_SESSION_TTL_MINUTES * 60 * 1000);

    const session = await prisma.$transaction(async (tx) => {
      const concurrent = await tx.tableSession.findFirst({
        where: { tableId: table.id, status: 'active', expiresAt: { gt: new Date() } },
      });
      if (concurrent) {
        return concurrent;
      }

      const created = await tx.tableSession.create({
        data: {
          tableId: table.id,
          sessionTokenHash: sha256Hex(rawSessionToken),
          rawToken: rawSessionToken,
          joinPin,
          status: 'active',
          lastActivityAt: new Date(),
          expiresAt,
        },
      });

      if (table.status === 'free') {
        await tx.table.update({
          where: { id: table.id },
          data: { status: 'ordered' },
        });
      }

      return created;
    });

    if (session.rawToken !== rawSessionToken) {
      // Concurrently created by another scanner
      return NextResponse.json({
        requiresPin: true,
        table: { id: table.id, tableNumber: table.tableNumber, label: table.label, zone: table.zone },
      });
    }

    const res = NextResponse.json(
      {
        table: { id: table.id, tableNumber: table.tableNumber, label: table.label, zone: table.zone },
        session: {
          id: session.id,
          status: session.status,
          expiresAt: session.expiresAt,
          realtimeChannel: getSessionRealtimeChannel(session.id),
        },
        joinPin: session.joinPin,
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

