export type Backend = 'localapi' | 'memory' | 'local' | 'supabase';

/** Keep the historical data sources alongside the shared local game library. */
export function selectBackend(requested: string, platform: string): Backend {
  if (requested === 'supabase') return 'supabase';
  if (platform !== 'web') return 'local';
  if (requested === 'memory' || requested === 'local') return requested;
  return 'localapi';
}
