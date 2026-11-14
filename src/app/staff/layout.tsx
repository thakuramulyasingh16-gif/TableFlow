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

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as
    | {
        role?: string;
        mfaSetupRequired?: boolean;
        mustChangePassword?: boolean;
      }
    | undefined;

  const access = checkDashboardAccess('/staff', user?.role, {
    mfaSetupRequired: user?.mfaSetupRequired,
    mustChangePassword: user?.mustChangePassword,
  });

  if (!access.allowed) {
    redirect(access.redirectUrl);
  }

  return <>{children}</>;
}
