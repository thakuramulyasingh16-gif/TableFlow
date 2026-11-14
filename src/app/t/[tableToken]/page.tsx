import { Metadata } from 'next';
import { GuestDiningClient } from '@/components/guest/GuestDiningClient';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function GuestTableMenuPage({
  params,
}: {
  params: Promise<{ tableToken: string }>;
}) {
  const { tableToken } = await params;
  return <GuestDiningClient tableToken={tableToken} initialView="menu" />;
}
