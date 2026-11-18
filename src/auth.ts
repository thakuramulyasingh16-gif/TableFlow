import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { recordAuditLog } from './lib/audit';
import { getEnv } from './lib/env';
import { DUMMY_HASH } from './lib/password-policy';
import { prisma } from './lib/prisma';
import { enforceRateLimit } from './lib/rate-limit';
import { consumeRecoveryCode, decryptMfaSecret, verifyTotpWithReplay } from './lib/totp';

export class MfaRequiredError extends CredentialsSignin {
  code = 'mfa_required';
}

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

const credentialsSchema = z.object({
  id: z.string().trim().min(1).max(190).optional(),
  email: z.string().trim().min(1).max(190).optional(),
  password: z.string().min(1).max(128),
  totpCode: z.string().trim().max(32).optional(),
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
        id: { label: 'ID', type: 'text' },
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: 'MFA Code', type: 'text' },
      },
      async authorize(rawCredentials, req) {
        getEnv();
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const rawId = (parsed.data.id || parsed.data.email || '').trim().toLowerCase();
        if (!rawId) return null;

        const password = parsed.data.password;

        // Separate rate limits per IP and per ID
        const forwarded = req?.headers?.get?.('x-forwarded-for') || '';
        const ip = forwarded.split(',')[0].trim() || '127.0.0.1';
        try {
          await enforceRateLimit('login_ip', ip);
          await enforceRateLimit('login_email', rawId);
        } catch {
          return null;
        }

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: rawId },
              { username: { equals: rawId, mode: 'insensitive' } },
            ],
          },
          include: { role: true },
        });

        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          await recordAuditLog({
            action: 'LOGIN_FAILED',
            entityType: 'user',
            ipAddress: ip,
            metadata: { id: rawId, reason: 'unknown_user' },
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

        // TOTP MFA verification for MFA-enabled accounts
        if (user.mfaEnabled && user.mfaSecret) {
          const code = parsed.data.totpCode?.trim();
          if (!code) {
            await recordAuditLog({
              actorUserId: user.id,
              actorRole: user.role.name,
              action: 'LOGIN_MFA_REQUIRED',
              entityType: 'user',
              entityId: user.id,
              ipAddress: ip,
            });
            throw new MfaRequiredError();
          }

          // Enforce separate per-user and per-IP rate limits on TOTP / recovery attempts
          try {
            await enforceRateLimit('mfa_verify_ip', ip);
            await enforceRateLimit('mfa_verify_user', String(user.id));
          } catch {
            await recordAuditLog({
              actorUserId: user.id,
              actorRole: user.role.name,
              action: 'LOGIN_MFA_RATE_LIMITED',
              entityType: 'user',
              entityId: user.id,
              ipAddress: ip,
            });
            return null;
          }

          const plainSecret = decryptMfaSecret(user.mfaSecret);
          const verifyResult = verifyTotpWithReplay(code, plainSecret, user.mfaLastTimeStep);
          let mfaOk = verifyResult.valid;
          const acceptedTimeStep = verifyResult.timeStep ?? null;

          if (!mfaOk && user.mfaRecoveryCodes) {
            const remaining = consumeRecoveryCode(code, user.mfaRecoveryCodes);
            if (remaining) {
              mfaOk = true;
              await prisma.user.update({
                where: { id: user.id },
                data: { mfaRecoveryCodes: JSON.stringify(remaining) },
              });
              await recordAuditLog({
                actorUserId: user.id,
                actorRole: user.role.name,
                action: 'MFA_RECOVERY_CODE_USED',
                entityType: 'user',
                entityId: user.id,
                ipAddress: ip,
              });
            }
          }

          if (!mfaOk) {
            await recordAuditLog({
              actorUserId: user.id,
              actorRole: user.role.name,
              action: 'LOGIN_MFA_FAILED',
              entityType: 'user',
              entityId: user.id,
              ipAddress: ip,
            });
            return null;
          }

          // Update replay protection tracker on successful TOTP authentication
          if (acceptedTimeStep !== null) {
            await prisma.user.update({
              where: { id: user.id },
              data: { mfaLastTimeStep: acceptedTimeStep },
            });
          }
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
          username: user.username,
          role: user.role.name,
          tokenVersion: user.tokenVersion,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = Number(user.id);
        token.role = (user as { role: string }).role;
        token.username = (user as { username?: string | null }).username;
        token.tokenVersion = (user as { tokenVersion: number }).tokenVersion;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword;
      }
      if (trigger === 'update' && session?.user) {
        const updateData = session.user as { mustChangePassword?: boolean };
        if (updateData.mustChangePassword !== undefined) {
          token.mustChangePassword = updateData.mustChangePassword;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId || '');
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { username?: string | null }).username = token.username as string | null | undefined;
        (session.user as { tokenVersion?: number }).tokenVersion = token.tokenVersion as number;
        (session.user as { mustChangePassword?: boolean }).mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
  },
});
