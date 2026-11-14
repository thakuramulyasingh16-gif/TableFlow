'use client';

import { createClient, RealtimeChannel } from '@supabase/supabase-js';

export interface SubscribeOptions {
  basePollIntervalMs?: number; // Default 20,000ms (20s)
  jitterFraction?: number; // Default 0.25 (+/- 25%)
}

/**
 * Calculates a jittered poll interval around baseMs.
 * e.g. for baseMs = 20000 and jitterFraction = 0.25, produces a value between 15000 and 25000ms.
 */
export function calculatePollIntervalWithJitter(
  baseMs = 20000,
  jitterFraction = 0.25
): number {
  const safeBase = Math.max(5000, baseMs);
  const safeFraction = Math.max(0, Math.min(0.5, jitterFraction));
  // Random multiplier between -safeFraction and +safeFraction
  const delta = safeBase * safeFraction * (2 * Math.random() - 1);
  return Math.round(safeBase + delta);
}

/**
 * Resolves role-based channels via authenticated server endpoint to prevent
 * unauthorized guests from eavesdropping on staff broadcasts.
 */
export async function resolveClientChannel(name: string): Promise<string | null> {
  if (name.startsWith('session_private_') || name.startsWith('role_private_')) {
    return name;
  }

  if (name.startsWith('staff') || name.startsWith('kitchen') || name.startsWith('inventory')) {
    try {
      const res = await fetch('/api/staff/realtime-channel');
      if (!res.ok) {
        // Block unauthenticated guests from resolving staff role channels
        return null;
      }
      const data = await res.json();
      if (name.startsWith('kitchen')) return data.channels?.kitchen || null;
      if (name.startsWith('inventory')) return data.channels?.inventory || null;
      return data.channels?.staff || null;
    } catch {
      return null;
    }
  }

  return name;
}

export function subscribeRealtime(
  channelName: string,
  events: string[],
  onEvent: () => void,
  options?: number | SubscribeOptions
): () => void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const baseMs = typeof options === 'number' ? options : options?.basePollIntervalMs ?? 20000;
  const jitterFraction = typeof options === 'object' ? options?.jitterFraction ?? 0.25 : 0.25;

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let isSubscribed = false;
  let cleanedUp = false;
  let channel: RealtimeChannel | null = null;
  let supabaseClient: ReturnType<typeof createClient> | null = null;

  const scheduleNextPoll = () => {
    if (cleanedUp || isSubscribed) return;
    const interval = calculatePollIntervalWithJitter(baseMs, jitterFraction);
    pollTimer = setTimeout(() => {
      if (cleanedUp || isSubscribed) return;
      try {
        onEvent();
      } catch (err) {
        console.error('[Realtime Fallback Poll Error]', err);
      }
      scheduleNextPoll();
    }, interval);
  };

  const startFallbackPolling = () => {
    if (pollTimer) clearTimeout(pollTimer);
    scheduleNextPoll();
  };

  const stopFallbackPolling = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  if (url && anonKey) {
    void (async () => {
      const targetChannel = await resolveClientChannel(channelName);
      if (cleanedUp) return;

      if (!targetChannel) {
        // Unauthorized or unresolvable channel: do not join Supabase channel
        isSubscribed = false;
        startFallbackPolling();
        return;
      }

      try {
        supabaseClient = createClient(url, anonKey);
        // Strictly configure channel with broadcast: { self: false } to block client-side broadcasting
        channel = supabaseClient.channel(targetChannel, {
          config: {
            broadcast: { ack: false, self: false },
          },
        });

        for (const ev of events) {
          channel.on('broadcast', { event: ev }, () => {
            onEvent();
          });
        }

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Realtime connection is active and healthy: disable fallback polling
            isSubscribed = true;
            stopFallbackPolling();
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Realtime connection lost or degraded: activate jittered fallback polling
            isSubscribed = false;
            startFallbackPolling();
          }
        });
      } catch {
        isSubscribed = false;
        startFallbackPolling();
      }
    })();
  } else {
    // Supabase not configured in current environment: run fallback polling
    isSubscribed = false;
    startFallbackPolling();
  }

  return () => {
    cleanedUp = true;
    stopFallbackPolling();
    if (channel && supabaseClient) {
      supabaseClient.removeChannel(channel).catch(() => {});
    }
  };
}
