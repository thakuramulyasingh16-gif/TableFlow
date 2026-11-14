import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env';

/**
 * Returns an unguessable per-session realtime channel.
 * Derived using HMAC-SHA256 with server-side REALTIME_CHANNEL_SECRET.
 * External users cannot guess or sniff other tables' channels.
 */
export function getSessionRealtimeChannel(sessionId: number): string {
  const env = getEnv();
  const secret = env.REALTIME_CHANNEL_SECRET || env.GUEST_COOKIE_SECRET || 'tf_realtime_secret_default';
  const token = crypto
    .createHmac('sha256', secret)
    .update(`table_session:${sessionId}`)
    .digest('hex')
    .slice(0, 32);
  return `session_private_${sessionId}_${token}`;
}

/**
 * Returns an unguessable role realtime channel for staff, kitchen, or inventory.
 * Only authenticated staff with the appropriate role receive this channel name.
 */
export function getRoleRealtimeChannel(role: 'staff' | 'kitchen' | 'inventory'): string {
  const env = getEnv();
  const secret = env.REALTIME_CHANNEL_SECRET || env.GUEST_COOKIE_SECRET || 'tf_realtime_secret_default';
  const token = crypto
    .createHmac('sha256', secret)
    .update(`staff_role:${role}`)
    .digest('hex')
    .slice(0, 32);
  return `role_private_${role}_${token}`;
}

/**
 * Resolves legacy or human-readable channel names into unguessable private channels.
 */
export function resolveChannelName(channel: string): string {
  const sessionMatch = channel.match(/^table_session:(\d+)$/);
  if (sessionMatch) {
    return getSessionRealtimeChannel(parseInt(sessionMatch[1], 10));
  }
  if (channel === 'staff:updates' || channel === 'staff') {
    return getRoleRealtimeChannel('staff');
  }
  if (channel === 'kitchen:updates' || channel === 'kitchen') {
    return getRoleRealtimeChannel('kitchen');
  }
  if (channel === 'inventory:updates' || channel === 'inventory') {
    return getRoleRealtimeChannel('inventory');
  }
  return channel;
}

/**
 * Strips any staff personally identifiable information (e.g. staff names, emails)
 * from broadcast payloads to protect staff privacy on the wire.
 */
export function sanitizeRealtimePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const forbiddenKeyPatterns = [
    /staffname/i,
    /username/i,
    /useremail/i,
    /email$/i,
    /acknowledgedby$/i,
    /receivedby$/i,
    /changedby$/i,
    /resolvedby$/i,
    /^staff$/i,
  ];
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(payload)) {
    // Check if the key indicates a staff personal identifier
    if (typeof val === 'string' && forbiddenKeyPatterns.some((pattern) => pattern.test(key))) {
      // Redact staff name
      continue;
    } else if (key === 'name' && typeof val === 'string') {
      // If bare 'name' is provided and looks like a person's name or not a known entity name, redact
      continue;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitized[key] = sanitizeRealtimePayload(val as Record<string, unknown>);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

export async function broadcastRealtime(
  channelName: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  const resolved = resolveChannelName(channelName);
  const sanitized = sanitizeRealtimePayload(payload);

  try {
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = supabase.channel(resolved);
    await channel.httpSend(event, sanitized);
    await supabase.removeChannel(channel);
  } catch (err) {
    console.error('[Realtime Broadcast Error]', err instanceof Error ? err.message : err);
  }
}
