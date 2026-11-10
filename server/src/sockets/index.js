import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getModels } from '../db/models/index.js';
import { GUEST_COOKIE_NAME } from '../middleware/guestSession.js';
import { verifyAccessToken } from '../services/authService.js';
import { sha256Hex } from '../utils/crypto.js';

const subscribeStationSchema = z.object({
  stationCode: z.enum(['grill', 'fry', 'drinks', 'dessert']),
}).strict();

function parseCookieHeader(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

export function attachSocketServer(httpServer) {
  const env = getEnv();
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const staffToken = socket.handshake.auth?.token;
      const { User, Role, TableSession } = getModels();

      if (typeof staffToken === 'string' && staffToken.length > 0) {
        const payload = verifyAccessToken(staffToken, env);
        const user = await User.findByPk(Number(payload.sub), {
          include: [{ model: Role, as: 'role' }],
        });
        if (!user || !user.is_active || user.token_version !== payload.tv || !user.role) {
          return next(new Error('Unauthorized'));
        }
        socket.data.principalType = 'staff';
        socket.data.user = { id: user.id, role: user.role.name, name: user.name };
        return next();
      }

      const rawCookieHeader = socket.handshake.headers?.cookie;
      if (rawCookieHeader) {
        const cookies = parseCookieHeader(rawCookieHeader);
        const signedVal = cookies[GUEST_COOKIE_NAME];
        if (signedVal) {
          const unsigned = cookieParser.signedCookie(signedVal, env.COOKIE_SECRET);
          if (typeof unsigned === 'string' && unsigned.length > 10) {
            const session = await TableSession.findOne({
              where: { session_token_hash: sha256Hex(unsigned), status: 'active' },
            });
            if (session && new Date(session.expires_at) > new Date()) {
              socket.data.principalType = 'guest';
              socket.data.tableSessionId = session.id;
              socket.data.tableId = session.table_id;
              return next();
            }
          }
        }
      }

      return next(new Error('Unauthorized'));
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.data.principalType === 'staff') {
      const { role, id } = socket.data.user;
      socket.join(`role:${role}`);
      if (role === 'chef' || role === 'manager' || role === 'owner') {
        socket.join('kitchen:all');
      }
      logger.debug({ userId: id, role }, 'Staff socket connected');

      socket.on('kitchen:subscribe_station', (rawPayload, ack) => {
        if (!['chef', 'manager', 'owner'].includes(role)) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Forbidden' });
          return;
        }
        const parsed = subscribeStationSchema.safeParse(rawPayload);
        if (!parsed.success) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Invalid station' });
          return;
        }
        socket.join(`kitchen:station:${parsed.data.stationCode}`);
        if (typeof ack === 'function') ack({ ok: true });
      });
    } else if (socket.data.principalType === 'guest') {
      socket.join(`table_session:${socket.data.tableSessionId}`);
      logger.debug({ tableSessionId: socket.data.tableSessionId }, 'Guest socket connected');
    }
  });

  return io;
}
