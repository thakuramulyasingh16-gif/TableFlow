import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';
import { AppError } from './api-error';
import { getEnv } from './env';

type LimiterBucket =
  | 'global'
  | 'login'
  | 'login_ip'
  | 'login_email'
  | 'order'
  | 'waiter_call'
  | 'payment'
  | 'stock_toggle'
  | 'purchase'
  | 'table_pin';

const LIMITS: Record<LimiterBucket, { max: number; windowMs: number; windowStr: `${number} s` | `${number} m` }> = {
  global: { max: 300, windowMs: 15 * 60 * 1000, windowStr: '15 m' },
  login: { max: 10, windowMs: 15 * 60 * 1000, windowStr: '15 m' },
  login_ip: { max: 20, windowMs: 15 * 60 * 1000, windowStr: '15 m' },
  login_email: { max: 5, windowMs: 15 * 60 * 1000, windowStr: '15 m' },
  order: { max: 20, windowMs: 10 * 60 * 1000, windowStr: '10 m' },
  waiter_call: { max: 6, windowMs: 10 * 60 * 1000, windowStr: '10 m' },
  payment: { max: 20, windowMs: 10 * 60 * 1000, windowStr: '10 m' },
  stock_toggle: { max: 60, windowMs: 1 * 60 * 1000, windowStr: '1 m' },
  purchase: { max: 30, windowMs: 5 * 60 * 1000, windowStr: '5 m' },
  table_pin: { max: 5, windowMs: 10 * 60 * 1000, windowStr: '10 m' },
};

const memoryWindows = new Map<string, number[]>();
const upstashLimiters = new Map<LimiterBucket, Ratelimit>();

function getUpstashLimiter(bucket: LimiterBucket): Ratelimit | null {
  const env = getEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  const existing = upstashLimiters.get(bucket);
  if (existing) return existing;

  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  const cfg = LIMITS[bucket];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.max, cfg.windowStr),
    prefix: `tf_rl:${bucket}`,
  });
  upstashLimiters.set(bucket, limiter);
  return limiter;
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function enforceRateLimit(bucket: LimiterBucket, identifier: string): Promise<void> {
  const limiter = getUpstashLimiter(bucket);
  if (limiter) {
    const result = await limiter.limit(identifier);
    if (!result.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
      throw new AppError(429, 'Too many requests. Please slow down.', 'RATE_LIMITED', {
        retryAfterSeconds,
      });
    }
    return;
  }

  // Fallback sliding-window limiter for local dev/test without Upstash configured
  const cfg = LIMITS[bucket];
  const key = `${bucket}:${identifier}`;
  const now = Date.now();
  const cutoff = now - cfg.windowMs;
  const timestamps = (memoryWindows.get(key) || []).filter((ts) => ts > cutoff);
  if (timestamps.length >= cfg.max) {
    const oldest = timestamps[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + cfg.windowMs - now) / 1000));
    throw new AppError(429, 'Too many requests. Please slow down.', 'RATE_LIMITED', {
      retryAfterSeconds,
    });
  }
  timestamps.push(now);
  memoryWindows.set(key, timestamps);
}

export function resetMemoryRateLimits(): void {
  memoryWindows.clear();
}

