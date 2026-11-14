import { NextResponse } from 'next/server';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { generateRecoveryCodes, generateTotpSecret } from '@/lib/totp';

export const POST = withStaffAuth(['owner', 'manager'], async (_req, { actor }) => {
  const secret = generateTotpSecret();
  const { plainCodes, hashedCodes } = generateRecoveryCodes();

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      mfaSecret: secret,
      mfaRecoveryCodes: JSON.stringify(hashedCodes),
    },
  });

  const otpauthUrl = `otpauth://totp/TableFlow:${encodeURIComponent(actor.email)}?secret=${secret}&issuer=TableFlow`;

  return NextResponse.json({
    secret,
    otpauthUrl,
    recoveryCodes: plainCodes,
  });
});
