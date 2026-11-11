'use client';

import { createClient } from '@supabase/supabase-js';

export function subscribeRealtime(
  channelName: string,
  events: string[],
  onEvent: () => void,
  pollIntervalMs = 8000
): () => void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let cleanupSupabase: (() => void) | null = null;

  if (url && anonKey) {
    const supabase = createClient(url, anonKey);
    const channel = supabase.channel(channelName);
    for (const ev of events) {
      channel.on('broadcast', { event: ev }, () => {
        onEvent();
      });
    }
    channel.subscribe();
    cleanupSupabase = () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }

  // Always pair with a lightweight safety poll in case Realtime isn't configured in local dev
  const timer = setInterval(onEvent, pollIntervalMs);

  return () => {
    clearInterval(timer);
    if (cleanupSupabase) cleanupSupabase();
  };
}
