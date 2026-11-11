import { GuestDiningClient } from '@/components/guest/GuestDiningClient';

export default async function GuestTableMenuPage({
  params,
}: {
  params: Promise<{ tableToken: string }>;
}) {
  const { tableToken } = await params;
  return <GuestDiningClient tableToken={tableToken} initialView="menu" />;
}
