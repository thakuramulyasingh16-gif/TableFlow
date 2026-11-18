import crypto from 'node:crypto';

/**
 * Checks whether database seeding or credential resetting is permitted in the current environment.
 * Refuses to run in production unless explicitly opted in with SEED_ALLOW_PRODUCTION=true.
 */
export function isSeedAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === 'production' && env.SEED_ALLOW_PRODUCTION !== 'true') {
    return false;
  }
  return true;
}

/**
 * Asserts that database seeding or credential resetting is permitted.
 * Throws an Error if attempting to run in production without SEED_ALLOW_PRODUCTION=true.
 */
export function assertSeedAllowed(env: Record<string, string | undefined> = process.env): void {
  if (!isSeedAllowed(env)) {
    throw new Error(
      'Refusing to run database seed or credential reset in production environment without explicit opt-in (SEED_ALLOW_PRODUCTION=true).'
    );
  }
}

/**
 * Generates a cryptographically strong random password.
 * Generates 18 random bytes in base64url (~24 chars) framed with uppercase, digit, and special characters.
 * Guarantees length >= 24 chars (typically 29 chars).
 */
export function generateStrongPassword(): string {
  const entropy = crypto.randomBytes(18).toString('base64url');
  return `Tf#${entropy}9!`;
}
