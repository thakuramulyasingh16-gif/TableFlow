import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env';

export async function broadcastRealtime(
  channelName: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  try {
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = supabase.channel(channelName);
    await channel.httpSend(event, payload);
    await supabase.removeChannel(channel);
  } catch (err) {
    console.error('[Realtime Broadcast Error]', err instanceof Error ? err.message : err);
  }
}

