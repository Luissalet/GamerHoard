import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { data } from './db';

const listeners = new Set<() => void>();
/** Re-run every mounted query (used after another tool changed the shared library). Keeps the current data on screen. */
export function refreshAllQueries() { listeners.forEach((f) => f()); }

// Async-query hook over the local DataSource. Re-runs whenever the screen regains focus,
// so lists/stats reflect changes made on other screens (e.g. marking DLC on the detail),
// and when refreshAllQueries() is called.
export function useQuery<T>(fn: (d: typeof data) => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: unknown }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      let alive = true;
      (async () => {
        try { await data.ready(); const r = await fn(data); if (alive) setState((s) => ({ ...s, loading: false, data: r })); }
        catch (e) { if (alive) setState((s) => ({ ...s, loading: false, error: e })); }
      })();
      return () => { alive = false; };
    }, [...deps, tick])
  );
  return state;
}
