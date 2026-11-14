import { captureException as sentryCaptureException } from './sentry';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const PII_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'authsecret',
  'cookie',
  'cookies',
  'set-cookie',
  'authorization',
  'creditcard',
  'cardnumber',
  'cvv',
  'cvc',
  'pan',
  'pin',
  'totpsecret',
  'tablepin',
  'rawtoken',
  'guesttoken',
  'tf_guest',
  'tf_csrf',
  'next-auth.session-token',
  'sessiontoken',
]);

const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;
const BEARER_OR_JWT_REGEX = /\b(?:Bearer\s+[A-Za-z0-9._~+/-]+=*|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g;

/**
 * Recursively scrubs PII and sensitive data from log objects and strings
 */
export function scrubPii(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'string') {
    let sanitized = value.replace(CREDIT_CARD_REGEX, '[REDACTED_CARD]');
    sanitized = sanitized.replace(BEARER_OR_JWT_REGEX, '[REDACTED_TOKEN]');
    return sanitized;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubPii(value.message) as string,
      stack: value.stack ? (scrubPii(value.stack) as string) : undefined,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubPii(item, seen));
  }

  // Prevent circular structure infinite loops
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  const cleanObj: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();
    if (PII_KEYS.has(lowerKey)) {
      cleanObj[key] = '[REDACTED]';
    } else {
      cleanObj[key] = scrubPii(val, seen);
    }
  }

  return cleanObj;
}

/**
 * Format and write a structured log entry
 */
export function formatLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  requestId?: string,
  error?: unknown
): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: typeof message === 'string' ? (scrubPii(message) as string) : String(message),
  };

  if (requestId) {
    entry.requestId = requestId;
  }

  if (context && Object.keys(context).length > 0) {
    entry.context = scrubPii(context) as Record<string, unknown>;
  }

  if (error instanceof Error) {
    entry.error = {
      name: error.name,
      message: scrubPii(error.message) as string,
      stack: error.stack ? (scrubPii(error.stack) as string) : undefined,
    };
  } else if (error) {
    entry.error = {
      name: 'Error',
      message: String(scrubPii(error)),
    };
  }

  return entry;
}

function writeLog(entry: StructuredLogEntry) {
  const jsonStr = JSON.stringify(entry);
  if (entry.level === 'error') {
    console.error(jsonStr);
  } else if (entry.level === 'warn') {
    console.warn(jsonStr);
  } else {
    console.log(jsonStr);
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>, requestId?: string) {
    if (process.env.NODE_ENV !== 'production' || process.env.LOG_LEVEL === 'debug') {
      const entry = formatLog('debug', message, context, requestId);
      writeLog(entry);
    }
  },

  info(message: string, context?: Record<string, unknown>, requestId?: string) {
    const entry = formatLog('info', message, context, requestId);
    writeLog(entry);
  },

  warn(message: string, context?: Record<string, unknown>, requestId?: string, error?: unknown) {
    const entry = formatLog('warn', message, context, requestId, error);
    writeLog(entry);
  },

  error(message: string, error?: unknown, context?: Record<string, unknown>, requestId?: string) {
    const entry = formatLog('error', message, context, requestId, error);
    writeLog(entry);

    // Forward to Sentry if available
    if (error) {
      sentryCaptureException(error, { message, requestId, ...context });
    }
  },
};
