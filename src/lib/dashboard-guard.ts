export function getAuthorizedDashboard(role?: string): string {
  if (role === 'chef') return '/kitchen';
  if (role === 'owner' || role === 'manager') return '/admin';
  if (role === 'waiter') return '/staff';
  return '/login';
}

export interface DashboardAccessOptions {
  mustChangePassword?: boolean;
}

export function checkDashboardAccess(
  pathname: string,
  role?: string,
  options?: DashboardAccessOptions
): { allowed: boolean; redirectUrl: string } {
  if (!role) {
    return {
      allowed: false,
      redirectUrl: `/login?callbackUrl=${encodeURIComponent(pathname)}`,
    };
  }

  const normalized = pathname.toLowerCase();

  // Mandatory password change check (server-side enforcement)
  if (options?.mustChangePassword) {
    if (normalized === '/change-password' || normalized.startsWith('/change-password/')) {
      return { allowed: true, redirectUrl: '' };
    }
    return { allowed: false, redirectUrl: '/change-password' };
  }

  // /admin/audit-logs viewer (owner only)
  if (normalized === '/admin/audit-logs' || normalized.startsWith('/admin/audit-logs/')) {
    if (role === 'owner') {
      return { allowed: true, redirectUrl: '' };
    }
    return { allowed: false, redirectUrl: '/admin' };
  }

  // /admin dashboard (owner, manager)
  if (normalized === '/admin' || normalized.startsWith('/admin/')) {
    if (role === 'owner' || role === 'manager') {
      return { allowed: true, redirectUrl: '' };
    }
    return { allowed: false, redirectUrl: getAuthorizedDashboard(role) };
  }

  // /kitchen dashboard (chef, owner, manager)
  if (normalized === '/kitchen' || normalized.startsWith('/kitchen/')) {
    if (role === 'chef' || role === 'owner' || role === 'manager') {
      return { allowed: true, redirectUrl: '' };
    }
    return { allowed: false, redirectUrl: getAuthorizedDashboard(role) };
  }

  // /chef alias (chef, owner, manager)
  if (normalized === '/chef' || normalized.startsWith('/chef/')) {
    if (role === 'chef' || role === 'owner' || role === 'manager') {
      return { allowed: true, redirectUrl: '' };
    }
    return { allowed: false, redirectUrl: getAuthorizedDashboard(role) };
  }

  // /staff floor dashboard (waiter, owner, manager)
  if (normalized === '/staff' || normalized.startsWith('/staff/')) {
    if (role === 'waiter' || role === 'owner' || role === 'manager') {
      return { allowed: true, redirectUrl: '' };
    }
    return { allowed: false, redirectUrl: getAuthorizedDashboard(role) };
  }

  return { allowed: true, redirectUrl: '' };
}
