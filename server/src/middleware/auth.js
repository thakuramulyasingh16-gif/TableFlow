import { getModels } from '../db/models/index.js';
import { verifyAccessToken } from '../services/authService.js';
import { AppError } from '../utils/AppError.js';

export async function requireAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError(401, 'Invalid or expired access token', 'TOKEN_INVALID');
    }

    const { User, Role } = getModels();
    const user = await User.findByPk(Number(payload.sub), {
      include: [{ model: Role, as: 'role' }],
    });

    if (!user || !user.is_active || !user.role) {
      throw new AppError(401, 'Account unavailable', 'AUTH_INVALID');
    }

    if (user.token_version !== payload.tv) {
      throw new AppError(401, 'Session has been revoked', 'TOKEN_REVOKED');
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Deny by default RBAC middleware
export function requireRole(...allowedRoles) {
  const allowedSet = new Set(allowedRoles);
  return function rbacGuard(req, _res, next) {
    if (!req.user || !req.user.role || allowedSet.size === 0 || !allowedSet.has(req.user.role)) {
      return next(new AppError(403, 'Insufficient permissions', 'FORBIDDEN'));
    }
    return next();
  };
}
