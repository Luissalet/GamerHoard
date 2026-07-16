import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { data } from './db';

// Async-query hook over the local DataSource. Re-runs whenever the screen regains focus,
// so lists/stats reflect changes made on other screens (e.g. marking episodes on the detail).
export function useQuery<T>(fn: (d: typeof data) => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: unknown }>({ loading: true });
  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      let alive = true;
      (async () => {
        try { await data.ready(); const r = await fn(data); if (alive) setState((s) => ({ ...s, loading: false, data: r })); }
        catch (e) { if (alive) setState((s) => ({ ...s, loading: false, error: e })); }
      })();
      return () => { alive = false; };
    }, deps)
  );
  return state;
}
