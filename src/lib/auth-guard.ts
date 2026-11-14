import { NextRequest, NextResponse } from 'next/server';
import { RoleName } from '@prisma/client';
import { auth } from '@/auth';
import { AppError, handleApiError } from './api-error';
import { requireCsrf } from './csrf';
import { prisma } from './prisma';
import { checkAllowedRole } from './rbac';

export { checkAllowedRole };

export type SessionResolver = () => Promise<unknown>;
let sessionResolver: SessionResolver = () => auth();

export function setSessionResolver(resolver: SessionResolver) {
  sessionResolver = resolver;
}

export function resetSessionResolver() {
  sessionResolver = () => auth();
}

export interface AuthenticatedStaff {
  id: number;
  name: string;
  email: string;
  role: RoleName;
}

export interface StaffRouteContext<P = Record<string, string | string[]>> {
  params: Promise<P>;
  actor: AuthenticatedStaff;
}

export interface StaffAuthOptions {
  allowMfaSetup?: boolean;
  allowChangePassword?: boolean;
}

export type StaffRouteHandler<P = Record<string, string | string[]>> = (
  req: NextRequest,
  context: StaffRouteContext<P>
) => Promise<NextResponse | Response>;

// Reusable wrapper combining CSRF enforcement, staff authentication, and centralized error handling
export function withStaffAuth<P = Record<string, string | string[]>>(
  allowedRoles: RoleName[],
  handler: StaffRouteHandler<P>,
  options?: StaffAuthOptions
) {
  return async (
    req: NextRequest,
    rawContext?: { params?: Promise<P> }
  ): Promise<NextResponse | Response> => {
    try {
      await requireCsrf(req);
      const actor = await requireStaffAuth(allowedRoles, options);
      const params = rawContext?.params ?? (Promise.resolve({} as P));
      return await handler(req, { params, actor });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

// Deny-by-default RBAC guard backed by live DB user status & tokenVersion check
export async function requireStaffAuth(
  allowedRoles: RoleName[],
  options?: StaffAuthOptions
): Promise<AuthenticatedStaff> {
  let session;
  try {
    session = await sessionResolver();
  } catch {
    throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  const userIdStr = session?.user?.id;
  const sessionUser = session?.user as
    | {
        tokenVersion?: number;
        mustChangePassword?: boolean;
        mfaSetupRequired?: boolean;
      }
    | undefined;
  const sessionTokenVersion = sessionUser?.tokenVersion;

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

  const isPrivileged = user.role.name === 'owner' || user.role.name === 'manager';
  const mfaEnrolled = user.mfaEnabled && Boolean(user.mfaSecret);
  const mfaSetupRequired = sessionUser?.mfaSetupRequired || (isPrivileged && !mfaEnrolled);

  // 1. Mandatory password change check
  const mustChangePassword = sessionUser?.mustChangePassword || user.mustChangePassword;
  if (mustChangePassword && !options?.allowChangePassword) {
    throw new AppError(
      403,
      'Password change required before accessing staff operations',
      'PASSWORD_CHANGE_REQUIRED'
    );
  }

  // 2. Mandatory MFA enrollment for owner and manager
  if (mfaSetupRequired && !options?.allowMfaSetup) {
    throw new AppError(
      403,
      'MFA enrollment required for owner and manager accounts',
      'MFA_SETUP_REQUIRED'
    );
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
