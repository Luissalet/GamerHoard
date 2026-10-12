import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { switchableAuthStorage } from '../lib/authStorage';
import i18n from '../i18n';

// The social identity (public.profiles) — what comments/friends/lists reference.
export type StaffRole = 'user' | 'moderator' | 'admin';
export type Account = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  is_public: boolean;
  created_at: string;
  role: StaffRole;
  banned_until: string | null;
};

export type AccountPatch = Partial<Pick<Account, 'display_name' | 'bio' | 'avatar_url' | 'banner_url' | 'is_public' | 'handle'>>;

type Ctx = {
  session: Session | null;
  account: Account | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  updateAccount: (patch: AccountPatch) => Promise<{ error?: string }>;
};

const SessionContext = createContext<Ctx>({
  session: null, account: null, loading: true,
  signOut: async () => {}, refreshAccount: async () => {}, updateAccount: async () => ({}),
});
export const useSession = () => useContext(SessionContext);

async function fetchAccount(userId: string): Promise<Account | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as Account) ?? null;
}

function deriveHandle(session: Session): string {
  const md: any = session.user.user_metadata ?? {};
  const raw = String(md.handle ?? (session.user.email ?? 'user').split('@')[0] ?? 'user');
  const base = raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  return base.length >= 3 ? base : 'user' + session.user.id.replace(/-/g, '').slice(0, 8);
}

// Failsafe: read the persisted session straight from storage — no auth-js locks, no
// network. Used when getSession() itself is stuck (expired token + dead radio, or a
// lock deadlock) so the boot spinner is always bounded. A stale token here is fine:
// queries 401 until the refresh lands and onAuthStateChange delivers the fresh one.
async function readStoredSession(): Promise<Session | null> {
  try {
    const extra = (Constants.expoConfig?.extra ?? {}) as any;
    const supaUrl: string = extra.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const ref = supaUrl.replace(/^https?:\/\//, '').split('.')[0];
    if (!ref) return null;
    const raw = await switchableAuthStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const s = parsed?.currentSession ?? parsed; // v1 wrapped, v2 stores the session itself
    return s?.access_token && s?.user ? (s as Session) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  // Which user the current `account` belongs to — avoids refetching the profile on
  // every TOKEN_REFRESHED event.
  const accountFor = useRef<string | null>(null);

  async function loadAccount(s: Session | null) {
    if (!s?.user) { setAccount(null); accountFor.current = null; return; }
    let acc = await fetchAccount(s.user.id);
    if (!acc) {
      // Fallback: the DB trigger normally makes this row at signup. If the schema was
      // applied after this user signed up, create it now from the auth metadata.
      const md: any = s.user.user_metadata ?? {};
      const base = deriveHandle(s);
      let { error } = await supabase.from('profiles').insert({ id: s.user.id, handle: base, display_name: md.display_name ?? null });
      if (error && /duplicate|unique/i.test(error.message)) {
        await supabase.from('profiles').insert({ id: s.user.id, handle: base.slice(0, 15) + Math.floor(Math.random() * 100000), display_name: md.display_name ?? null });
      }
      acc = await fetchAccount(s.user.id);
    }
    setAccount(acc);
    accountFor.current = acc ? s.user.id : null;
  }

  useEffect(() => {
    let alive = true;
    let settled = false;
    // Unblock the UI as soon as the session is known. The account (profiles row) loads
    // in the background — the boot gate must NEVER wait on a network fetch.
    const finish = (s: Session | null) => {
      if (!alive || settled) return;
      settled = true;
      setSession(s);
      setLoading(false);
      void loadAccount(s).catch(() => {});
    };
    supabase.auth.getSession().then(({ data }) => finish(data.session)).catch(() => finish(null));
    // If getSession() hasn't resolved shortly (it normally resolves from storage in
    // milliseconds), fall back to reading storage directly so the spinner is bounded.
    const failsafe = setTimeout(() => { void readStoredSession().then(finish); }, 4000);
    // IMPORTANT: this callback must stay synchronous. auth-js runs subscribers while
    // holding its internal lock; awaiting another supabase call here (which needs that
    // same lock for the auth header) deadlocks the client — the old "stuck on spinner
    // until force-close" bug. Defer all work to a fresh task instead.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setTimeout(() => {
        if (!alive) return;
        settled = true;
        setSession(s);
        setLoading(false);
        if (event === 'SIGNED_OUT' || !s?.user) { setAccount(null); accountFor.current = null; return; }
        if (accountFor.current !== s.user.id) void loadAccount(s).catch(() => {});
      }, 0);
    });
    return () => { alive = false; clearTimeout(failsafe); sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); setAccount(null); accountFor.current = null; };
  const refreshAccount = async () => { if (session) await loadAccount(session); };
  const updateAccount = async (patch: AccountPatch): Promise<{ error?: string }> => {
    if (!session?.user) return { error: i18n.t('reviews.errNoSession') };
    const clean: AccountPatch = { ...patch };
    if (typeof clean.handle === 'string') clean.handle = clean.handle.trim().toLowerCase();
    const { error } = await supabase.from('profiles').update(clean).eq('id', session.user.id);
    if (error) return { error: /duplicate|unique/i.test(error.message) ? i18n.t('account.handleTaken') : error.message };
    await loadAccount(session);
    return {};
  };

  return (
    <SessionContext.Provider value={{ session, account, loading, signOut, refreshAccount, updateAccount }}>
      {children}
    </SessionContext.Provider>
  );
}
