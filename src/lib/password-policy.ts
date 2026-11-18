import { AppError } from './api-error';

export const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8u1l4P3z9b/3dY8/3L0S1p2nF2qKXe';

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '12345678901',
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'pass1234',
  'pass12345',
  'qwerty123',
  'qwertyuiop',
  'qwertzui',
  'asdfghjkl',
  'zxcvbnm1',
  'iloveyou',
  'iloveyou1',
  'tableflow',
  'tableflow123',
  'tableflow2026',
  'admin123',
  'admin1234',
  'admin12345',
  'administrator',
  'root1234',
  'welcome1',
  'welcome12',
  'welcome123',
  'welcome2026',
  'letmein1',
  'letmein123',
  'monkey123',
  'dragon123',
  'sunshine',
  'sunshine1',
  'princess',
  'princess1',
  'football',
  'football1',
  'baseball',
  'baseball1',
  'superman',
  'superman1',
  'shadow123',
  'master123',
  'michael1',
  'charlie1',
  'donald123',
  'jessica1',
  'jordan123',
  'mustang1',
  'trustno1',
  'secret123',
  'starwars',
  'starwars1',
  'testing1',
  'test1234',
  'test12345',
  'default1',
  'default123',
  'changeme',
  'changeme1',
  'changeme123',
  'kitchen1',
  'kitchen123',
  'waiter123',
  'manager123',
  'restaurant',
  'restaurant1',
  'restaurant123',
  'login123',
  'access123',
  'freedom1',
  'whatever',
  'whatever1',
  'cookie123',
  'pepper12',
  'computer',
  'computer1',
  'chocolate',
  'matrix123',
  'killer123',
  'pokemon1',
  'batman123',
  'chelsea1',
  'arsenal1',
  'liverpool',
  'barcelona',
  'mercedes',
  'database',
  'database1',
  'server123',
  'internet',
  'internet1',
  'guest123',
  'operator',
  'service1',
  'service123',
  'safety123',
  'security',
  'security1',
  'security123',
  'coffee123',
  'flower123',
  'diamond1',
  'superstar',
  'star1234',
  'hunter12',
  'hunter123',
  'master12',
  'blessed1',
  'harley12',
  'ginger12',
  'buster12',
  'bailey12',
  'whiskey1',
  'timber12',
]);

export interface PasswordContext {
  email?: string | null;
  username?: string | null;
  id?: string | number | null;
  name?: string | null;
}

export function validatePassword(
  password: string,
  context?: PasswordContext
): { valid: boolean; error?: string } {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string' };
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }

  if (password.length > 72) {
    return { valid: false, error: 'Password cannot exceed 72 characters' };
  }

  const lower = password.toLowerCase().trim();

  if (COMMON_PASSWORDS.has(lower)) {
    return { valid: false, error: 'Password is too common or easily guessable' };
  }

  if (context) {
    const identifiersToCheck: string[] = [];

    if (context.username) {
      identifiersToCheck.push(context.username.trim().toLowerCase());
    }

    if (context.email) {
      const emailLower = context.email.trim().toLowerCase();
      identifiersToCheck.push(emailLower);
      const emailPrefix = emailLower.split('@')[0];
      if (emailPrefix && emailPrefix.length >= 3) {
        identifiersToCheck.push(emailPrefix);
      }
    }

    if (context.id !== undefined && context.id !== null) {
      identifiersToCheck.push(String(context.id).trim().toLowerCase());
    }

    if (context.name) {
      const nameLower = context.name.trim().toLowerCase();
      if (nameLower.length >= 3) {
        identifiersToCheck.push(nameLower);
      }
    }

    for (const idStr of identifiersToCheck) {
      if (idStr && lower === idStr) {
        return {
          valid: false,
          error: 'Password cannot be the same as your username, email, or ID',
        };
      }
    }
  }

  return { valid: true };
}

export function assertValidPassword(
  password: string,
  context?: PasswordContext
): void {
  const result = validatePassword(password, context);
  if (!result.valid) {
    throw new AppError(400, result.error || 'Password does not meet security requirements', 'WEAK_PASSWORD');
  }
}
