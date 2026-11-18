import { PrismaClient } from '@prisma/client';
import { encryptMfaSecret } from '../src/lib/totp';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting MFA secret encryption backfill...');
  const users = await prisma.user.findMany({
    where: {
      mfaSecret: { not: null },
    },
    select: {
      id: true,
      email: true,
      mfaSecret: true,
    },
  });

  let encryptedCount = 0;
  for (const user of users) {
    if (user.mfaSecret && !user.mfaSecret.startsWith('enc:v1:')) {
      const encrypted = encryptMfaSecret(user.mfaSecret);
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaSecret: encrypted },
      });
      encryptedCount++;
      console.log(`Encrypted MFA secret for user ${user.id} (${user.email})`);
    }
  }

  console.log(`Backfill complete: ${encryptedCount} user(s) encrypted, ${users.length - encryptedCount} already encrypted.`);
}

main()
  .catch((e) => {
    console.error('Backfill error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
