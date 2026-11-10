import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { getModels } from '../db/models/index.js';
import { AppError } from '../utils/AppError.js';
import { generateOpaqueToken, sha256Hex } from '../utils/crypto.js';
import { recordAuditLog } from './auditService.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8u1l4P3z9b/3dY8/3L0S1p2nF2qKXe';

export function signAccessToken(user, roleName, env = getEnv()) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: roleName,
      tv: user.token_version,
      name: user.name,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_TTL,
      issuer: 'tableflow',
      audience: 'tableflow-staff',
    }
  );
}

export function verifyAccessToken(token, env = getEnv()) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'tableflow',
    audience: 'tableflow-staff',
  });
}

export async function loginStaff({ email, password, ipAddress, userAgent }) {
  const { User, Role, RefreshToken, sequelize } = getModels();
  const env = getEnv();
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({
    where: { email: normalizedEmail },
    include: [{ model: Role, as: 'role' }],
  });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    await recordAuditLog({
      action: 'LOGIN_FAILED',
      entityType: 'user',
      ipAddress,
      userAgent,
      metadata: { email: normalizedEmail, reason: 'unknown_user' },
    });
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!user.is_active) {
    await recordAuditLog({
      actorUserId: user.id,
      actorRole: user.role?.name,
      action: 'LOGIN_BLOCKED_INACTIVE',
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
    });
    throw new AppError(403, 'Account is disabled. Contact administrator.', 'ACCOUNT_DISABLED');
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(
      423,
      'Account temporarily locked due to repeated failed attempts. Try again later.',
      'ACCOUNT_LOCKED'
    );
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

    await user.update({
      failed_login_attempts: attempts,
      locked_until: lockedUntil,
    });

    await recordAuditLog({
      actorUserId: user.id,
      actorRole: user.role?.name,
      action: lockedUntil ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
      metadata: { attempts },
    });

    if (lockedUntil) {
      throw new AppError(
        423,
        'Account temporarily locked due to repeated failed attempts. Try again later.',
        'ACCOUNT_LOCKED'
      );
    }
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const rawRefreshToken = generateOpaqueToken(48);
  const refreshHash = sha256Hex(rawRefreshToken);
  const familyId = generateOpaqueToken(16);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await sequelize.transaction(async (transaction) => {
    await user.update(
      { failed_login_attempts: 0, locked_until: null },
      { transaction }
    );
    await RefreshToken.create(
      {
        user_id: user.id,
        token_hash: refreshHash,
        family_id: familyId,
        expires_at: expiresAt,
      },
      { transaction }
    );
    await recordAuditLog({
      actorUserId: user.id,
      actorRole: user.role.name,
      action: 'LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
      transaction,
    });
  });

  const accessToken = signAccessToken(user, user.role.name, env);
  return {
    accessToken,
    rawRefreshToken,
    refreshExpiresAt: expiresAt,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
    },
  };
}

export async function rotateRefreshToken({ rawRefreshToken, ipAddress, userAgent }) {
  if (!rawRefreshToken) {
    throw new AppError(401, 'Refresh token required', 'REFRESH_MISSING');
  }
  const { RefreshToken, User, Role, sequelize } = getModels();
  const env = getEnv();
  const tokenHash = sha256Hex(rawRefreshToken);

  const existing = await RefreshToken.findOne({
    where: { token_hash: tokenHash },
    include: [
      {
        model: User,
        as: 'user',
        include: [{ model: Role, as: 'role' }],
      },
    ],
  });

  if (!existing || !existing.user) {
    throw new AppError(401, 'Invalid refresh token', 'REFRESH_INVALID');
  }

  // Reuse detection: if an already-revoked refresh token is presented, revoke entire family & invalidate access tokens
  if (existing.revoked_at) {
    await sequelize.transaction(async (transaction) => {
      await RefreshToken.update(
        { revoked_at: new Date() },
        { where: { family_id: existing.family_id, revoked_at: null }, transaction }
      );
      await existing.user.increment('token_version', { by: 1, transaction });
      await recordAuditLog({
        actorUserId: existing.user.id,
        actorRole: existing.user.role?.name,
        action: 'TOKEN_REUSE_DETECTED',
        entityType: 'refresh_token',
        entityId: existing.id,
        ipAddress,
        userAgent,
        metadata: { familyId: existing.family_id },
        transaction,
      });
    });
    throw new AppError(401, 'Session invalidated due to token reuse', 'REFRESH_REUSED');
  }

  if (new Date(existing.expires_at) <= new Date()) {
    throw new AppError(401, 'Refresh token expired', 'REFRESH_EXPIRED');
  }

  if (!existing.user.is_active) {
    throw new AppError(403, 'Account is disabled', 'ACCOUNT_DISABLED');
  }

  const nextRawRefresh = generateOpaqueToken(48);
  const nextHash = sha256Hex(nextRawRefresh);
  const nextExpiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await sequelize.transaction(async (transaction) => {
    await existing.update(
      {
        revoked_at: new Date(),
        replaced_by_hash: nextHash,
      },
      { transaction }
    );
    await RefreshToken.create(
      {
        user_id: existing.user.id,
        token_hash: nextHash,
        family_id: existing.family_id,
        expires_at: nextExpiresAt,
      },
      { transaction }
    );
  });

  const accessToken = signAccessToken(existing.user, existing.user.role.name, env);
  return {
    accessToken,
    rawRefreshToken: nextRawRefresh,
    refreshExpiresAt: nextExpiresAt,
    user: {
      id: existing.user.id,
      name: existing.user.name,
      email: existing.user.email,
      role: existing.user.role.name,
    },
  };
}

export async function logoutStaff({ rawRefreshToken, userId, role, ipAddress, userAgent }) {
  const { RefreshToken } = getModels();
  if (rawRefreshToken) {
    const tokenHash = sha256Hex(rawRefreshToken);
    const record = await RefreshToken.findOne({ where: { token_hash: tokenHash } });
    if (record) {
      await RefreshToken.update(
        { revoked_at: new Date() },
        { where: { family_id: record.family_id, revoked_at: null } }
      );
    }
  }
  if (userId) {
    await recordAuditLog({
      actorUserId: userId,
      actorRole: role,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: userId,
      ipAddress,
      userAgent,
    });
  }
}
