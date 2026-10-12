// In-app announcements shown under the bell icon. Cloud mode reads the public
// `announcements` table (publish/unpublish rows without redeploying); local mode —
// or a failed fetch — falls back to the built-in list so the bell always works.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type Announcement = {
  id: string;
  title: Record<string, string>;
  body: Record<string, string>;
  href: string | null;
  icon: string;
  created_at: string;
};

const BUILT_IN: Announcement[] = [
  {
    id: 'gofundme-2026',
    title: {
      en: 'Help us keep and grow the app ❤️',
      es: 'Ayúdanos a mantener y hacer crecer la app ❤️',
    },
    body: {
      en: 'Watch Hoard is live, but running on limited resources for now. Your support pays for faster data, more storage and more capacity — so everyone can bring their history over. Tap to chip in.',
      es: 'Watch Hoard está en marcha, pero de momento con recursos limitados. Tu apoyo paga datos más rápidos, más almacenamiento y más capacidad, para que todos puedan traerse su historial. Toca para colaborar.',
    },
    href: '/donate',
    icon: 'heart',
    created_at: '2026-07-11T00:00:00Z',
  },
];

// Small in-memory cache so the bell (which refetches on every tab focus) doesn't
// hammer the network. The notifications screen forces a fresh read.
let cache: { at: number; list: Announcement[] } | null = null;
const TTL = 5 * 60_000;

export async function fetchAnnouncements(force = false): Promise<Announcement[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.list;
  let list = BUILT_IN;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('id,title,body,href,icon,created_at')
        .eq('published', true)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      list = (data as Announcement[]) ?? [];
    } catch {
      list = BUILT_IN;
    }
  }
  cache = { at: Date.now(), list };
  return list;
}

// Resolve the best translation for the active language ('es-ES' → 'es' → 'en').
export function pickText(x: Record<string, string> | null | undefined, lang: string): string {
  if (!x) return '';
  return x[lang] ?? x[lang.split('-')[0]] ?? x.en ?? Object.values(x)[0] ?? '';
}

const SEEN_KEY = 'wh:seenAnnouncements';

export async function getSeenIds(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export async function markSeen(ids: string[]): Promise<void> {
  try {
    const seen = await getSeenIds();
    ids.forEach((i) => seen.add(i));
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    // non-fatal: worst case the dot shows again
  }
}

export async function unseenCount(): Promise<number> {
  const [list, seen] = await Promise.all([fetchAnnouncements(), getSeenIds()]);
  return list.filter((a) => !seen.has(a.id)).length;
}
