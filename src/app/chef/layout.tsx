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

export default async function ChefLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const access = checkDashboardAccess('/chef', role);

  if (!access.allowed) {
    redirect(access.redirectUrl);
  }

  return <>{children}</>;
}
