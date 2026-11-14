import { NextResponse } from 'next/server';
import { withStaffAuth } from '@/lib/auth-guard';
import { getRoleRealtimeChannel } from '@/lib/realtime';

export const GET = withStaffAuth(['waiter', 'chef', 'manager', 'owner'], async (_req, { actor }) => {
  const channels: { staff?: string; kitchen?: string; inventory?: string } = {};

  if (['waiter', 'manager', 'owner'].includes(actor.role)) {
    channels.staff = getRoleRealtimeChannel('staff');
  }

  if (['chef', 'manager', 'owner'].includes(actor.role)) {
    channels.kitchen = getRoleRealtimeChannel('kitchen');
    channels.inventory = getRoleRealtimeChannel('inventory');
  }

  return NextResponse.json({
    role: actor.role,
    channels,
  });
});
