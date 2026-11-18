import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z
    .string()
    .min(1, 'CORS_ORIGIN is required')
    .default('http://localhost:3000')
    .refine((val) => {
      if (process.env.NODE_ENV === 'production' && val.includes('*')) return false;
      return true;
    }, 'Wildcard CORS_ORIGIN is forbidden in production'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional().default(''),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  GUEST_COOKIE_SECRET: z.string().min(32, 'GUEST_COOKIE_SECRET must be at least 32 characters'),
  GUEST_SESSION_TTL_MINUTES: z.coerce.number().int().positive().max(720).default(120),
  MFA_ENCRYPTION_KEY: z
    .string()
    .optional()
    .default('')
    .refine((val) => {
      if (process.env.NODE_ENV === 'production' && !val) return false;
      if (!val) return true;
      try {
        const buf = Buffer.from(val, 'base64');
        return buf.length === 32;
      } catch {
        return false;
      }
    }, 'MFA_ENCRYPTION_KEY must be a 32-byte base64-encoded key'),
  REALTIME_CHANNEL_SECRET: z
    .string()
    .optional()
    .default('')
    .refine((val) => {
      if (process.env.NODE_ENV === 'production' && !val) return false;
      if (!val) return true;
      return val.length >= 32;
    }, 'REALTIME_CHANNEL_SECRET must be at least 32 characters, and is required in production'),

  CGST_BPS: z.coerce.number().int().min(0).max(2800).default(250),
  SGST_BPS: z.coerce.number().int().min(0).max(2800).default(250),

  UPSTASH_REDIS_REST_URL: z.string().optional().default(''),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(''),

  NEXT_PUBLIC_SUPABASE_URL: z.string().optional().default(''),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional().default(''),
  PAYMENTS_MOCK: z.string().optional().default('false'),

  RESEND_API_KEY: z.string().optional().default(''),
  RESEND_FROM: z.string().default('TableFlow Receipts <onboarding@resend.dev>'),

  SENTRY_DSN: z.string().optional().default(''),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional().default(''),
});

export type AppEnv = Readonly<
  z.infer<typeof envSchema> & {
    corsOrigins: string[];
    isProd: boolean;
    isTest: boolean;
    isPaymentsMock: boolean;
  }
>;

export function loadEnv(rawEnv: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }

  const data = parsed.data;
  if (data.NODE_ENV === 'production') {
    if (!data.RAZORPAY_KEY_ID || !data.RAZORPAY_KEY_SECRET || !data.RAZORPAY_WEBHOOK_SECRET) {
      throw new Error('Razorpay keys and webhook secret are required in production');
    }
    if (!data.UPSTASH_REDIS_REST_URL || !data.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Upstash Redis credentials are required in production');
    }
    if (!data.MFA_ENCRYPTION_KEY) {
      throw new Error('MFA_ENCRYPTION_KEY is required in production');
    }
    if (!data.REALTIME_CHANNEL_SECRET) {
      throw new Error('REALTIME_CHANNEL_SECRET is required in production');
    }
  }

  return Object.freeze({
    ...data,
    corsOrigins: data.CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    isProd: data.NODE_ENV === 'production',
    isTest: data.NODE_ENV === 'test',
    isPaymentsMock: data.NODE_ENV !== 'production' && data.PAYMENTS_MOCK === 'true',
  });
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = loadEnv(process.env);
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}

