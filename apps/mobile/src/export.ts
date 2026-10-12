import { Platform } from 'react-native';
import { data } from './db';
import { BACKEND } from './lib/backend';

// Data ownership: download everything the library holds as JSON. With the local server this is the
// library file itself (the same one the MCP tools read); otherwise the games of the active data source.
export async function exportData(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  let payload: unknown;
  if (BACKEND === 'localapi') {
    const res = await fetch('/api/export');
    if (!res.ok) return false;
    payload = await res.json();
  } else {
    await data.ready();
    payload = { format: 'gamerhoard-export', version: 3, generatedAt: new Date().toISOString(), games: await data.getShows() };
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `gamerhoard-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  URL.revokeObjectURL(url);
  return true;
}
