import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { recordAuditLog } from './lib/audit';
import { getEnv } from './lib/env';
import { prisma } from './lib/prisma';
import { enforceRateLimit } from './lib/rate-limit';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8u1l4P3z9b/3dY8/3L0S1p2nF2qKXe';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(190),
  password: z.string().min(8).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 15 * 60, // Short-lived 15-minute session
    updateAge: 5 * 60,
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'Staff Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials, req) {
        getEnv();
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const password = parsed.data.password;

        // Rate limit login attempts per email/IP
        const forwarded = req?.headers?.get?.('x-forwarded-for') || '';
        const ip = forwarded.split(',')[0].trim() || '127.0.0.1';
        try {
          await enforceRateLimit('login', `${ip}:${email}`);
        } catch {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true },
        });

        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          await recordAuditLog({
            action: 'LOGIN_FAILED',
            entityType: 'user',
            ipAddress: ip,
            metadata: { email, reason: 'unknown_user' },
          });
          return null;
        }

        if (!user.isActive) {
          await recordAuditLog({
            actorUserId: user.id,
            actorRole: user.role.name,
            action: 'LOGIN_BLOCKED_INACTIVE',
            entityType: 'user',
            entityId: user.id,
            ipAddress: ip,
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await recordAuditLog({
            actorUserId: user.id,
            actorRole: user.role.name,
            action: 'LOGIN_BLOCKED_LOCKED',
            entityType: 'user',
            entityId: user.id,
            ipAddress: ip,
          });
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          const attempts = user.failedLoginAttempts + 1;
          const lockedUntil =
            attempts >= MAX_FAILED_LOGINS
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
              : null;

          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: attempts, lockedUntil },
          });

          await recordAuditLog({
            actorUserId: user.id,
            actorRole: user.role.name,
            action: lockedUntil ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
            entityType: 'user',
            entityId: user.id,
            ipAddress: ip,
            metadata: { attempts },
          });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });

        await recordAuditLog({
          actorUserId: user.id,
          actorRole: user.role.name,
          action: 'LOGIN_SUCCESS',
          entityType: 'user',
          entityId: user.id,
          ipAddress: ip,
        });

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role.name,
          tokenVersion: user.tokenVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = Number(user.id);
        token.role = (user as { role: string }).role;
        token.tokenVersion = (user as { tokenVersion: number }).tokenVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId || '');
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { tokenVersion?: number }).tokenVersion = token.tokenVersion as number;
      }
      return session;
    },
  },
});
