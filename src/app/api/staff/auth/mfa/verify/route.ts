import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp, enforceRateLimit } from '@/lib/rate-limit';
import { decryptMfaSecret, verifyTotpWithReplay } from '@/lib/totp';
import { parseJsonBody } from '@/lib/validators';

const verifyMfaSchema = z
  .object({
    code: z.string().trim().length(6, 'TOTP code must be 6 digits'),
  })
  .strict();

export const POST = withStaffAuth(
  ['owner', 'manager', 'waiter', 'chef'],
  async (req, { actor }) => {
    // Separate per-user and per-IP rate limits on TOTP verification
    const ip = getClientIp(req);
    await enforceRateLimit('mfa_verify_ip', ip);
    await enforceRateLimit('mfa_verify_user', String(actor.id));

    const body = await parseJsonBody(req, verifyMfaSchema);

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
    });
    if (!user || !user.mfaSecret) {
      throw new AppError(400, 'MFA setup has not been initiated.', 'MFA_NOT_CONFIGURED');
    }

    const plainSecret = decryptMfaSecret(user.mfaSecret);
    const verifyResult = verifyTotpWithReplay(body.code, plainSecret, user.mfaLastTimeStep);
    if (!verifyResult.valid) {
      throw new AppError(400, 'Invalid TOTP code.', 'INVALID_TOTP_CODE');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaLastTimeStep: verifyResult.timeStep,
      },
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
