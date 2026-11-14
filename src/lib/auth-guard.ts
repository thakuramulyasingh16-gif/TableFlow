import { NextRequest, NextResponse } from 'next/server';
import { RoleName } from '@prisma/client';
import { auth } from '@/auth';
import { AppError, handleApiError } from './api-error';
import { requireCsrf } from './csrf';
import { prisma } from './prisma';
import { checkAllowedRole } from './rbac';

export { checkAllowedRole };

export interface AuthenticatedStaff {
  id: number;
  name: string;
  email: string;
  role: RoleName;
}

export type StaffRouteContext<P = Record<string, string | string[]>> = {
  params: Promise<P>;
  actor: AuthenticatedStaff;
};

export type StaffRouteHandler<P = Record<string, string | string[]>> = (
  req: NextRequest,
  context: StaffRouteContext<P>
) => Promise<NextResponse | Response>;

// Reusable wrapper combining CSRF enforcement, staff authentication, and centralized error handling
export function withStaffAuth<P = Record<string, string | string[]>>(
  allowedRoles: RoleName[],
  handler: StaffRouteHandler<P>
) {
  return async (
    req: NextRequest,
    rawContext?: { params?: Promise<P> }
  ): Promise<NextResponse | Response> => {
    try {
      await requireCsrf(req);
      const actor = await requireStaffAuth(allowedRoles);
      const params = rawContext?.params ?? (Promise.resolve({} as P));
      return await handler(req, { params, actor });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

// Deny-by-default RBAC guard backed by live DB user status & tokenVersion check
export async function requireStaffAuth(allowedRoles: RoleName[]): Promise<AuthenticatedStaff> {
  let session;
  try {
    session = await auth();
  } catch {
    throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

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
