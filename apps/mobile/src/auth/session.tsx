import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAccount(s: Session | null) {
    if (!s?.user) { setAccount(null); return; }
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
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadAccount(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      await loadAccount(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); setAccount(null); };
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
