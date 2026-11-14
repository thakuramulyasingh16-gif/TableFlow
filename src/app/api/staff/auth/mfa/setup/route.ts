import { NextResponse } from 'next/server';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { generateRecoveryCodes, generateTotpSecret, encryptMfaSecret } from '@/lib/totp';

export const POST = withStaffAuth(
  ['owner', 'manager', 'waiter', 'chef'],
  async (_req, { actor }) => {
    const secret = generateTotpSecret();
    const { plainCodes, hashedCodes } = generateRecoveryCodes();

    await prisma.user.update({
      where: { id: actor.id },
      data: {
        mfaSecret: encryptMfaSecret(secret),
        mfaRecoveryCodes: JSON.stringify(hashedCodes),
        mfaLastTimeStep: null,
      },
    });

    const otpauthUrl = `otpauth://totp/TableFlow:${encodeURIComponent(actor.email)}?secret=${secret}&issuer=TableFlow`;

    return NextResponse.json({
      secret,
      otpauthUrl,
      recoveryCodes: plainCodes,
    });
  },
  { allowMfaSetup: true }
);
