import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { assertSeedAllowed, generateStrongPassword } from '../prisma/seed-guard';

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

const demoAccounts = [
  { role: 'owner', email: 'owner@tableflow.local', username: 'owner' },
  { role: 'manager', email: 'manager@tableflow.local', username: 'manager' },
  { role: 'waiter', email: 'waiter@tableflow.local', username: 'waiter' },
  { role: 'chef', email: 'chef@tableflow.local', username: 'chef' },
];

async function main() {
  // Safety guard: refuse to run in production without explicit opt-in
  assertSeedAllowed(process.env);

  console.log('\n=== TableFlow Demo Password Reset ===');
  console.log('Regenerating passwords for demo staff accounts...\n');

  const updatedCredentials: { role: string; email: string; username: string; password: string }[] = [];

  for (const acc of demoAccounts) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: acc.email }, { username: acc.username }],
      },
    });

    if (!existing) {
      console.log(`- [${acc.role.toUpperCase()}] ${acc.email} not found in database (skipped).`);
      continue;
    }

    const plainPassword = generateStrongPassword();
    const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_COST);

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    updatedCredentials.push({
      role: acc.role,
      email: existing.email,
      username: existing.username || acc.username,
      password: plainPassword,
    });
  }

  if (updatedCredentials.length > 0) {
    console.log('\n======================================================================');
    console.log('  REGENERATED DEMO CREDENTIALS (printed ONCE — save now):             ');
    console.log('======================================================================');
    for (const c of updatedCredentials) {
      console.log(`  - [${c.role.toUpperCase()}] ID: ${c.username} (${c.email})`);
      console.log(`    New Temporary Password: ${c.password}`);
      console.log(`    (mustChangePassword=true enforced, tokenVersion bumped to invalidate old sessions)`);
    }
    console.log('======================================================================\n');
  } else {
    console.log('No demo accounts were found to update. Run `npm run db:seed` first to create accounts.');
  }
}

main()
  .catch((err) => {
    console.error('Reset demo passwords failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
