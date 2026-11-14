import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { checkDashboardAccess } from '@/lib/dashboard-guard';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const access = checkDashboardAccess('/kitchen', role);

  if (!access.allowed) {
    redirect(access.redirectUrl);
  }

  return <>{children}</>;
}
