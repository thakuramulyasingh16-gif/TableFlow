import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import { requireStaffAuth, withStaffAuth } from '@/lib/auth-guard';
import { getRestaurantSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { parseJsonBody, updateRestaurantSettingsSchema } from '@/lib/validators';
import { sanitizeUserText } from '@/lib/sanitize';

export async function GET() {
  await requireStaffAuth(['manager', 'owner']);
  const settings = await getRestaurantSettings();
  return NextResponse.json({ settings });
}

export const PATCH = withStaffAuth(['owner'], async (req, { actor }) => {
  const body = await parseJsonBody(req, updateRestaurantSettingsSchema);
  const current = await getRestaurantSettings();

  const data: Record<string, unknown> = {};
  if (body.restaurantName) data.restaurantName = sanitizeUserText(body.restaurantName, 120);
  if (body.legalName) data.legalName = sanitizeUserText(body.legalName, 190);
  if (body.address) data.address = sanitizeUserText(body.address, 255);
  if (body.phone !== undefined) data.phone = body.phone ? sanitizeUserText(body.phone, 20) : null;
  if (body.email !== undefined) data.email = body.email ? sanitizeUserText(body.email, 190) : null;
  if (body.gstin) data.gstin = body.gstin.toUpperCase();
  if (body.fssaiNumber) data.fssaiNumber = body.fssaiNumber;
  if (body.stateCode) data.stateCode = body.stateCode;
  if (body.stateName) data.stateName = sanitizeUserText(body.stateName, 60);
  if (body.hsnSacCode) data.hsnSacCode = body.hsnSacCode;
  if (body.cgstBps !== undefined) data.cgstBps = body.cgstBps;
  if (body.sgstBps !== undefined) data.sgstBps = body.sgstBps;
  if (body.paymentProvider) data.paymentProvider = body.paymentProvider;
  if (body.upiId !== undefined) data.upiId = body.upiId ? sanitizeUserText(body.upiId, 100) : null;

  const updated = await prisma.restaurantSettings.update({
    where: { id: current.id },
    data,
  });

  await recordAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'RESTAURANT_SETTINGS_UPDATED',
    entityType: 'RestaurantSettings',
    entityId: updated.id,
    metadata: { changedFields: Object.keys(data) },
  });

  return NextResponse.json({ settings: updated });
});
