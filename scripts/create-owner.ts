import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { PrismaClient, RoleName } from '@prisma/client';
import { generateStrongPassword } from '../prisma/seed-guard';

export interface CreateOwnerOptions {
  email?: string;
  username?: string;
  name?: string;
  password?: string;
  allowMultipleOwners?: boolean;
}

export const SYSTEM_ROLES: { name: RoleName; description: string }[] = [
  { name: 'owner', description: 'Restaurant owner and full administrator' },
  { name: 'manager', description: 'Floor manager, menu & table supervisor' },
  { name: 'waiter', description: 'Table service, order confirmation, and waiter calls' },
  { name: 'chef', description: 'Kitchen Display System operator' },
];

export async function createOwnerCore(
  options: CreateOwnerOptions,
  client: PrismaClient
) {
  // 1. Ensure system roles exist
  const roleMap: Record<string, number> = {};
  for (const r of SYSTEM_ROLES) {
    const role = await client.role.upsert({
      where: { name: r.name },
      update: {},
      create: r,
    });
    roleMap[r.name] = role.id;
  }

  // 2. Ensure default restaurant settings row exists
  const existingSettings = await client.restaurantSettings.findFirst();
  if (!existingSettings) {
    await client.restaurantSettings.create({
      data: {
        restaurantName: process.env.NEXT_PUBLIC_RESTAURANT_NAME || 'TableFlow Bistro',
        legalName: 'TableFlow Hospitality Private Limited',
        address: 'Plot 42, Sector 18, Gurugram, Haryana - 122002',
        phone: '+91 98765 43210',
        email: 'billing@tableflow.in',
        gstin: '06AAACT2727Q1ZB',
        fssaiNumber: '10822005000123',
        stateCode: '06',
        stateName: 'Haryana',
        hsnSacCode: '996331',
        cgstBps: 250,
        sgstBps: 250,
        paymentProvider: 'razorpay',
        upiId: 'tableflow@okaxis',
      },
    });
  }

  // 3. Check for existing owner
  const existingOwner = await client.user.findFirst({
    where: {
      role: { name: 'owner' },
      isActive: true,
    },
    include: { role: true },
  });

  if (existingOwner && !options.allowMultipleOwners) {
    throw new Error(
      `An active owner account already exists (${existingOwner.email}, ID: ${existingOwner.username || 'none'}). Pass --allow-multiple-owners to create another.`
    );
  }

  // 4. Resolve credentials
  const email = (options.email || 'owner@tableflow.local').trim().toLowerCase();
  const username = (options.username || 'owner').trim().toLowerCase();
  const name = (options.name || 'Restaurant Owner').trim();
  const plainPassword = options.password?.trim() || generateStrongPassword();

  if (plainPassword.length < 8) {
    throw new Error('Owner password must be at least 8 characters.');
  }

  const passwordHash = await bcrypt.hash(plainPassword, 12);

  const ownerRoleId = roleMap['owner'];
  if (!ownerRoleId) {
    throw new Error("Role 'owner' could not be initialized.");
  }

  const user = await client.user.create({
    data: {
      name,
      email,
      username,
      passwordHash,
      roleId: ownerRoleId,
      isActive: true,
      mustChangePassword: true,
    },
  });

  return {
    user,
    password: plainPassword,
  };
}

export function parseCliArgs(args: string[]): CreateOwnerOptions {
  const options: CreateOwnerOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--allow-multiple-owners' || arg === '--force') {
      options.allowMultipleOwners = true;
    } else if (arg === '--email' && args[i + 1]) {
      options.email = args[++i];
    } else if (arg === '--username' && args[i + 1]) {
      options.username = args[++i];
    } else if (arg === '--name' && args[i + 1]) {
      options.name = args[++i];
    } else if (arg === '--password' && args[i + 1]) {
      options.password = args[++i];
    }
  }
  return options;
}

async function promptQuestion(query: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      const val = ans.trim();
      resolve(val || defaultValue || '');
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
TableFlow Production Owner Creation Tool

Usage:
  npm run create-owner [--flags]

Flags:
  --name <string>             Display name for the owner (default: Restaurant Owner)
  --email <string>            Login email (default: owner@tableflow.local)
  --username <string>         Login username (default: owner)
  --password <string>         Password (optional; strong 24+ char password is generated if omitted)
  --allow-multiple-owners     Allow creating an additional owner if one already exists
  --help, -h                  Show this help text
`);
    return;
  }

  // Interactive prompt if run in an interactive terminal without required flags
  if (process.stdin.isTTY && !options.email && !options.username) {
    console.log('\n=== TableFlow Production Owner Setup ===\n');
    options.name = await promptQuestion('Owner Name [Restaurant Owner]: ', 'Restaurant Owner');
    options.email = await promptQuestion('Owner Email [owner@tableflow.local]: ', 'owner@tableflow.local');
    options.username = await promptQuestion('Owner Username [owner]: ', 'owner');
    const customPass = await promptQuestion('Owner Password (press enter to generate a secure random password): ');
    if (customPass) {
      options.password = customPass;
    }
  }

  const prisma = new PrismaClient();
  try {
    const result = await createOwnerCore(options, prisma);

    console.log('\n======================================================================');
    console.log('  TABLEFLOW PRODUCTION OWNER ACCOUNT CREATED SUCCESSFULLY             ');
    console.log('======================================================================');
    console.log(`  - Role:               Owner`);
    console.log(`  - Name:               ${result.user.name}`);
    console.log(`  - Email:              ${result.user.email}`);
    console.log(`  - Username:           ${result.user.username}`);
    console.log(`  - One-Time Password:  ${result.password}`);
    console.log(`  - Enforced Policy:    mustChangePassword = true`);
    console.log('----------------------------------------------------------------------');
    console.log('  IMPORTANT: Copy this temporary password now.');
    console.log('  It is printed ONCE and will not be displayed again.');
    console.log('  On first login at /login, you will be prompted to set a new password.');
    console.log('======================================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main().catch((err: unknown) => {
    console.error('\n[ERROR]', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
