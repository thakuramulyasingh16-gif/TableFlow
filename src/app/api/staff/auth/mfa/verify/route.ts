import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { verifyTotp } from '@/lib/totp';
import { parseJsonBody } from '@/lib/validators';

const verifyMfaSchema = z
  .object({
    code: z.string().trim().length(6, 'TOTP code must be 6 digits'),
  })
  .strict();

export const POST = withStaffAuth(
  ['owner', 'manager', 'waiter', 'chef'],
  async (req, { actor }) => {
    const body = await parseJsonBody(req, verifyMfaSchema);

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
    });
    if (!user || !user.mfaSecret) {
      throw new AppError(400, 'MFA setup has not been initiated.', 'MFA_NOT_CONFIGURED');
    }

    const valid = verifyTotp(body.code, user.mfaSecret);
    if (!valid) {
      throw new AppError(400, 'Invalid TOTP code.', 'INVALID_TOTP_CODE');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true },
    });

    await recordAuditLog({
      actorUserId: user.id,
      actorRole: actor.role,
      action: 'MFA_ENABLED',
      entityType: 'user',
      entityId: user.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, message: 'Two-factor authentication enabled successfully.' });
  },
  { allowMfaSetup: true }
);
