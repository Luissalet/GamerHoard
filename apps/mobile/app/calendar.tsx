import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { data, type ShowRow } from '../src/db';
import { posterFor } from '../src/img';
import { tvLite, seasonEpisodes } from '../src/tmdb';
import { localToday } from '../src/dates';

// Release calendar: next episodes of your shows + your upcoming movies, month by month.
type Entry = {
  date: string; kind: 'ep' | 'movie'; title: string; poster: string | null;
  season?: number; episode?: number; epName?: string | null; tvdb?: number; uuid?: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export default function CalendarScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const now = new Date();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: now.getUTCFullYear(), m: now.getUTCMonth() });
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | 'ep' | 'movie'>('all');

  const months = t('calendar.months').split(',');
  const weekdays = t('calendar.weekdays').split(',');

  useEffect(() => {
    let alive = true;
    setEntries(null); setSelected(null);
    (async () => {
      await data.ready();
      const start = iso(monthStart(ym.y, ym.m));
      const end = iso(new Date(Date.UTC(ym.y, ym.m, daysInMonth(ym.y, ym.m))));
      const out: Entry[] = [];

      // Shows: expand the airing season of every show that has a known upcoming episode.
      const shows = (await data.getShows()).filter((sh: ShowRow) => !!sh.next_air_date && !!sh.next_season);
      await Promise.all(shows.map(async (sh) => {
        try {
          const lite = await tvLite(sh.tvdb_id);
          if (!lite?.tmdbId) return;
          const eps = await seasonEpisodes(lite.tmdbId, sh.next_season as number);
          for (const e of eps) {
            if (e.air && e.air >= start && e.air <= end) {
              out.push({ date: e.air, kind: 'ep', title: sh.title, poster: sh.poster, season: sh.next_season as number, episode: e.number, epName: e.name, tvdb: sh.tvdb_id });
            }
          }
        } catch { /* ignore one show */ }
      }));

      // Movies: any unwatched movie whose release falls inside the visible month — including
      // dates that already passed (a July 3rd premiere still belongs to July). getMovies()
      // excludes future pendientes and getUpcomingMovies() excludes past ones, so merge both.
      const [libMovies, upMovies] = await Promise.all([data.getMovies(5000), data.getUpcomingMovies()]);
      const seenMovies = new Set<string>();
      for (const m of [...libMovies, ...upMovies]) {
        const k = m.uuid ?? `${m.title}:${m.year ?? ''}`;
        if (seenMovies.has(k)) continue;
        seenMovies.add(k);
        if (!m.watched_at && m.release_date && m.release_date >= start && m.release_date <= end) {
          out.push({ date: m.release_date, kind: 'movie', title: m.title, poster: m.poster, uuid: m.uuid ?? undefined });
        }
      }
      out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
      if (alive) setEntries(out);
    })();
    return () => { alive = false; };
  }, [ym]);

  // Filter feeds both the day-grid dots and the list below.
  const filtered = useMemo(() => (entries ?? []).filter((e) => kindFilter === 'all' || e.kind === kindFilter), [entries, kindFilter]);

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of filtered) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date)!.push(e); }
    return m;
  }, [filtered]);

  const grid = useMemo(() => {
    const first = monthStart(ym.y, ym.m);
    const lead = (first.getUTCDay() + 6) % 7; // Monday-first
    const total = daysInMonth(ym.y, ym.m);
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= total; d++) cells.push(iso(new Date(Date.UTC(ym.y, ym.m, d))));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [ym]);

  const todayIso = localToday();
  const list = selected ? (byDay.get(selected) ?? []) : filtered;
  const move = (d: number) => setYm(({ y, m }) => { const nm = m + d; return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={[font.h1, { flex: 1, textAlign: 'center' }]}>{t('calendar.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.monthRow}>
        <Pressable onPress={() => move(-1)} hitSlop={10}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
        <Text style={[font.h1, { fontSize: 18 }]}>{months[ym.m]} {ym.y}</Text>
        <Pressable onPress={() => move(1)} hitSlop={10}><Ionicons name="chevron-forward" size={22} color={colors.text} /></Pressable>
      </View>

      <View style={s.filterRow}>
        {([['all', 'calendar.filterAll'], ['ep', 'calendar.filterShows'], ['movie', 'calendar.filterMovies']] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setKindFilter(k)} style={[s.fChip, kindFilter === k && s.fChipOn]}>
            <Text style={[s.fChipText, kindFilter === k && s.fChipTextOn]}>{t(label)}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.weekRow}>{weekdays.map((w, i) => <Text key={i} style={s.weekday}>{w}</Text>)}</View>
      <View style={s.grid}>
        {grid.map((day, i) => {
          const has = day ? (byDay.get(day)?.length ?? 0) : 0;
          const sel = day === selected;
          const isToday = day === todayIso;
          return (
            <Pressable key={i} style={[s.cell, sel && { backgroundColor: colors.accent }]} disabled={!day} onPress={() => setSelected(sel ? null : day)}>
              {day ? (
                <>
                  <Text style={[s.cellNum, isToday && !sel && { color: colors.accent, fontWeight: '800' }, sel && { color: colors.accentInk, fontWeight: '800' }]}>{Number(day.slice(8, 10))}</Text>
                  {has > 0 ? <View style={[s.dot, sel && { backgroundColor: colors.accentInk }]}>{has > 1 ? <Text style={[s.dotText, sel && { color: colors.accent }]}>{has}</Text> : null}</View> : <View style={{ height: 14 }} />}
                </>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {entries == null ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : list.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="calendar-outline" size={38} color={colors.textMuted} />
          <Text style={[font.muted, { marginTop: space(2), textAlign: 'center' }]}>{selected ? t('calendar.emptyDay') : t('calendar.emptyMonth')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space(3), paddingBottom: space(8) }}>
          {list.map((e, i) => {
            const prev = list[i - 1];
            const showDate = !prev || prev.date !== e.date;
            return (
              <View key={`${e.date}-${e.kind}-${e.title}-${e.episode ?? ''}`}>
                {showDate ? <Text style={s.dateHead}>{e.date}</Text> : null}
                <Pressable style={s.row} onPress={() => (e.kind === 'ep' && e.tvdb ? router.push(`/episode/${e.tvdb}-${e.season}-${e.episode}`) : e.uuid ? router.push(`/movie/${e.uuid}`) : null)}>
                  <Image source={{ uri: e.poster ?? posterFor(e.title) }} style={s.rowPoster} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: space(3) }}>
                    <Text style={font.h2} numberOfLines={1}>{e.title}</Text>
                    {e.kind === 'ep'
                      ? <Text style={font.muted} numberOfLines={1}>{`T${String(e.season).padStart(2, '0')} | E${String(e.episode).padStart(2, '0')}`}{e.epName ? ` · ${e.epName}` : ''}</Text>
                      : <Text style={[font.muted, { color: colors.accent }]}>{t('calendar.premiere')}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(3) },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(6), marginTop: space(1) },
  filterRow: { flexDirection: 'row', justifyContent: 'center', gap: space(2), marginTop: space(3) },
  fChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.surface },
  fChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  fChipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  fChipTextOn: { color: colors.accentInk },
  weekRow: { flexDirection: 'row', paddingHorizontal: space(3), marginTop: space(3) },
  weekday: { flex: 1, textAlign: 'center', ...font.muted, fontSize: 11, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space(3), marginTop: space(1) },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6, borderRadius: radius.sm },
  cellNum: { ...font.body, fontSize: 14 },
  dot: { minWidth: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2, paddingHorizontal: 3 },
  dotText: { color: colors.accentInk, fontSize: 9, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  dateHead: { ...font.muted, fontWeight: '800', letterSpacing: 1, marginTop: space(3), marginBottom: space(2), textTransform: 'uppercase', fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(2.5), marginBottom: space(2) },
  rowPoster: { width: 42, height: 63, borderRadius: 6, backgroundColor: colors.surfaceAlt },
});
