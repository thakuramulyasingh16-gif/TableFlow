import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { checkDashboardAccess } from '@/lib/dashboard-guard';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const access = checkDashboardAccess('/staff', role);

  if (!access.allowed) {
    redirect(access.redirectUrl);
  }

  return <>{children}</>;
}
