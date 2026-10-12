import { Platform } from 'react-native';

// Switchable auth storage for "Keep me signed in".
//
// - Checked (default): the Supabase session is written to PERSISTENT storage
//   (localStorage on web, AsyncStorage on native) so it survives restarts.
// - Unchecked: the session goes to EPHEMERAL storage (sessionStorage on web,
//   in-memory on native), so closing the tab / restarting the app logs out.
//
// The choice itself is kept in persistent storage under REMEMBER_KEY, so on the
// next launch getItem() knows which backend holds the token. Missing = remember.

const REMEMBER_KEY = '@gamerhoard/remember';

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';

// In-memory fallback: native ephemeral, or any environment without window.
const mem = new Map<string, string>();

type KV = {
  getItem: (k: string) => string | null | Promise<string | null>;
  setItem: (k: string, v: string) => void | Promise<void>;
  removeItem: (k: string) => void | Promise<void>;
};

function asyncStorage(): KV | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-async-storage/async-storage').default as KV;
  } catch {
    return null;
  }
}

function memStore(): KV {
  return {
    getItem: (k) => (mem.has(k) ? (mem.get(k) as string) : null),
    setItem: (k, v) => { mem.set(k, v); },
    removeItem: (k) => { mem.delete(k); },
  };
}

function persistentStore(): KV {
  if (isWeb && hasWindow) {
    return {
      getItem: (k) => window.localStorage.getItem(k),
      setItem: (k, v) => window.localStorage.setItem(k, v),
      removeItem: (k) => window.localStorage.removeItem(k),
    };
  }
  return asyncStorage() ?? memStore();
}

function ephemeralStore(): KV {
  if (isWeb && hasWindow) {
    return {
      getItem: (k) => window.sessionStorage.getItem(k),
      setItem: (k, v) => window.sessionStorage.setItem(k, v),
      removeItem: (k) => window.sessionStorage.removeItem(k),
    };
  }
  return memStore(); // native ephemeral = memory, cleared on app restart
}

/** Persist the user's choice. Call this BEFORE signIn/signUp so the token lands
 *  in the right backend. */
export async function setRemember(remember: boolean): Promise<void> {
  const v = remember ? '1' : '0';
  await Promise.resolve(persistentStore().setItem(REMEMBER_KEY, v));
}

async function getRemember(): Promise<boolean> {
  const v = await Promise.resolve(persistentStore().getItem(REMEMBER_KEY));
  return v !== '0'; // default (missing) = remember
}

// Supabase GoTrue storage adapter (async is fully supported).
export const switchableAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const store = (await getRemember()) ? persistentStore() : ephemeralStore();
    return (await Promise.resolve(store.getItem(key))) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    const remember = await getRemember();
    const active = remember ? persistentStore() : ephemeralStore();
    const other = remember ? ephemeralStore() : persistentStore();
    await Promise.resolve(active.setItem(key, value));
    try { await Promise.resolve(other.removeItem(key)); } catch { /* ignore */ }
  },
  async removeItem(key: string): Promise<void> {
    try { await Promise.resolve(persistentStore().removeItem(key)); } catch { /* ignore */ }
    try { await Promise.resolve(ephemeralStore().removeItem(key)); } catch { /* ignore */ }
  },
};
