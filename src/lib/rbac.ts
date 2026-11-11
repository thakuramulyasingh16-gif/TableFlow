import { RoleName } from '@prisma/client';

export function checkAllowedRole(
  role: string | undefined | null,
  allowedRoles: RoleName[]
): boolean {
  if (!role || allowedRoles.length === 0) return false;
  return (allowedRoles as string[]).includes(role);
}
