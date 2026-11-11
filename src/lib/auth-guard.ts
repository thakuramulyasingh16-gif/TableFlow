import { RoleName } from '@prisma/client';
import { auth } from '@/auth';
import { AppError } from './api-error';
import { prisma } from './prisma';
import { checkAllowedRole } from './rbac';

export { checkAllowedRole };

export interface AuthenticatedStaff {
  id: number;
  name: string;
  email: string;
  role: RoleName;
}

// Deny-by-default RBAC guard backed by live DB user status & tokenVersion check
export async function requireStaffAuth(allowedRoles: RoleName[]): Promise<AuthenticatedStaff> {
  const session = await auth();
  const userIdStr = session?.user?.id;
  const sessionTokenVersion = (session?.user as { tokenVersion?: number } | undefined)?.tokenVersion;

  if (!userIdStr) {
    throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(userIdStr) },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, 'Account unavailable', 'AUTH_INVALID');
  }

  if (sessionTokenVersion !== undefined && user.tokenVersion !== sessionTokenVersion) {
    throw new AppError(401, 'Session has been revoked', 'TOKEN_REVOKED');
  }

  if (!checkAllowedRole(user.role.name, allowedRoles)) {
    throw new AppError(403, 'Insufficient permissions', 'FORBIDDEN');
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
  };
}
