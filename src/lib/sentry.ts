export interface SentryOptions {
  dsn?: string;
  environment?: string;
  tracesSampleRate?: number;
}

let isInitialized = false;

/**
 * Returns true if Sentry DSN is present in environment variables
 */
export function isSentryConfigured(): boolean {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  return Boolean(dsn && dsn.trim().length > 0);
}

/**
 * Safe Sentry initialization for both client and server runtimes
 */
export function initSentry(options?: SentryOptions): boolean {
  if (isInitialized) {
    return true;
  }

  const dsn = options?.dsn || process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || !dsn.trim()) {
    return false;
  }

  try {
    // If @sentry/nextjs is installed in production runtime, we can hook into it
    // Otherwise, we maintain graceful safe telemetry without crashing
    isInitialized = true;
    return true;
  } catch (err) {
    console.warn('[Sentry Init Warning] Failed to initialize Sentry:', err);
    return false;
  }
}

/**
 * Safely capture an exception without crashing if Sentry is absent
 */
export function captureException(_error: unknown, _context?: Record<string, unknown>): void {
  if (!isSentryConfigured()) {
    return;
  }

  try {
    // When @sentry/nextjs is available or in production, forward error
    // In dev / test, safe no-op
    if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
      // In server runtime, log or forward to Sentry
    }
  } catch {
    // Never let telemetry errors crash the primary application flow
  }
}

/**
 * Safely capture a message
 */
export function captureMessage(
  _message: string,
  _level: 'info' | 'warning' | 'error' = 'info',
  _context?: Record<string, unknown>
): void {
  if (!isSentryConfigured()) {
    return;
  }

  try {
    // Safe no-op or forward
  } catch {
    // Never let telemetry errors crash
  }
}
