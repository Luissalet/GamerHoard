import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, space, font, radius } from '../../src/theme';
import { NotificationBell } from '../../src/NotificationBell';
import { useQuery } from '../../src/useData';
import { data } from '../../src/db';
import { posterFor } from '../../src/img';
import { movieReleaseDate, resolveMovieRelease } from '../../src/tmdb';
import { genreNameMap, parseGenres, libraryGenres, backfillMovieGenres } from '../../src/genres';
import type { MovieRow } from '../../src/db';
import { daysUntil } from '../../src/dates';

const normQ = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const chunk = <T,>(arr: T[], n: number) => { const r: T[][] = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
// Labels resolved via i18n at render (`movies.<key>`).
const MCATS = [{ key: 'watched' }, { key: 'pending' }] as const;
type MCat = 'watched' | 'pending';

function MovieCell({ item, width, onPress }: { item: MovieRow; width: number; onPress: () => void }) {
  return (
    <Pressable style={{ width, padding: space(1.5) }} onPress={onPress}>
      <View>
        <Image source={{ uri: item.poster ?? posterFor(item.title + (item.year ?? '')) }} style={s.poster} contentFit="cover" transition={150} />
        {item.watched_at ? <View style={s.badge}><Ionicons name="checkmark" size={14} color={colors.accentInk} /></View> : null}
        {(item.rewatch_count ?? 0) > 0 ? <View style={s.rewatchBadge}><Text style={s.rewatchText}>×{(item.rewatch_count ?? 0) + 1}</Text></View> : null}
      </View>
      <Text style={s.title} numberOfLines={1}>{item.title}</Text>
      {item.year ? <Text style={s.year}>{item.year}</Text> : null}
    </Pressable>
  );
}

export default function MoviesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const numColumns = Math.max(3, Math.min(10, Math.floor(width / 170)));
  const itemWidth = width / numColumns;
  const [tab, setTab] = useState<'next' | 'all'>('all');
  const [nonce, setNonce] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<MCat | 'all'>('all');
  const [genreFilter, setGenreFilter] = useState<number | 'all'>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'az'>('recent');
  const [genreNames, setGenreNames] = useState<Record<number, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  const { loading, data: movies } = useQuery((d) => d.getMovies(2000), [nonce]);
  const { fav, ts } = useLocalSearchParams<{ fav?: string; ts?: string }>();
  React.useEffect(() => { if (fav === '1') { setFavOnly(true); setTab('all'); } }, [fav, ts]);
  React.useEffect(() => { genreNameMap(i18n.language).then(setGenreNames); }, [i18n.language]);
  const libGenreIds = useMemo(() => libraryGenres(movies ?? []).filter((id) => genreNames[id]).sort((a, b) => (genreNames[a] || '').localeCompare(genreNames[b] || '')), [movies, genreNames]);
  const { data: upcoming } = useQuery((d) => d.getUpcomingMovies(), [nonce]);

  // Auto-fill release dates for every added movie that lacks one, so the Upcoming tab loads the whole
  // library without opening each fiche. Runs on every focus of the Movies tab (tabs stay mounted).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await data.ready();
        const need = await data.getUncheckedPendientes();   // every saved-but-unwatched movie not yet resolved
        if (!need.length || !alive) return;
        setScanning(true);
        let changed = false;
        for (let i = 0; i < need.length && alive; i += 6) {
          await Promise.all(need.slice(i, i + 6).map(async (m) => {
            if (!alive || !m.uuid) return;
            let rd: string | null = null, poster: string | null = null;
            if (m.uuid.startsWith('tmdb:')) rd = await movieReleaseDate(Number(m.uuid.slice(5)));
            else { const r = await resolveMovieRelease((m.slug || m.title).replace(/-/g, ' '), m.year); rd = r?.releaseDate ?? null; poster = r?.poster ?? null; }
            if (!alive) return;
            if (rd) { await data.setMovieReleaseDate(m.uuid, rd); changed = true; }
            if (poster && !m.poster) await data.setMoviePoster(m.uuid, poster);
            await data.markMovieChecked(m.uuid);
          }));
        }
        if (alive) { setScanning(false); if (changed) setNonce((n) => n + 1); }
      })();
      return () => { alive = false; };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await data.ready();
        const gch = await backfillMovieGenres(movies ?? []);
        if (alive && gch) setNonce((n) => n + 1);
      })();
      return () => { alive = false; };
    }, [movies])
  );

  const items = useMemo(() => {
    const byCat: Record<MCat, MovieRow[]> = { watched: [], pending: [] };
    const term = normQ(q);
    const src = (movies ?? []).filter((m) => (genreFilter === 'all' || parseGenres(m.genres).includes(genreFilter)) && (!favOnly || m.is_favorite === 1) && (!term || normQ(m.title).includes(term)));
    if (sort === 'az') src.sort((a, b) => a.title.localeCompare(b.title));
    for (const m of src) byCat[m.watched_at ? 'watched' : 'pending'].push(m);
    const out: any[] = [];
    for (const { key } of MCATS) {
      if (filter !== 'all' && filter !== key) continue;
      const list = byCat[key];
      if (!list.length) continue;
      out.push({ kind: 'header', key, label: t('movies.' + key), count: list.length });
      for (const row of chunk(list, numColumns)) out.push({ kind: 'row', movies: row });
    }
    return out;
  }, [movies, filter, genreFilter, favOnly, q, sort, numColumns, i18n.language]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.tabs}>
        <Pressable onPress={() => setTab('next')}>
          <Text style={[s.tab, tab === 'next' && s.tabActive]}>{t('movies.upcoming')}{upcoming?.length ? ` · ${upcoming.length}` : ''}</Text>
        </Pressable>
        <Pressable onPress={() => setTab('all')}><Text style={[s.tab, tab === 'all' && s.tabActive]}>{t('movies.all')}</Text></Pressable>
        <View style={{ flex: 1 }} />
        {(movies ?? []).some((m) => !m.watched_at) && (
          <Pressable onPress={() => { const pend = (movies ?? []).filter((m) => !m.watched_at && m.uuid); const pick = pend[Math.floor(Math.random() * pend.length)]; if (pick?.uuid) router.push(`/movie/${pick.uuid}`); }} hitSlop={8} style={{ marginRight: space(4) }}>
            <Ionicons name="dice-outline" size={22} color={colors.text} />
          </Pressable>
        )}
        <Pressable onPress={() => router.push('/calendar')} hitSlop={8}><Ionicons name="calendar-outline" size={22} color={colors.text} /></Pressable>
        <NotificationBell style={{ marginLeft: space(4) }} />
      </View>

      {tab === 'next' ? (
        (upcoming ?? []).length === 0 ? (
          <View style={s.empty}>
            {scanning ? <><ActivityIndicator color={colors.accent} /><Text style={s.emptyText}>{t('movies.findingReleaseDates')}</Text></>
              : <><Ionicons name="calendar-outline" size={40} color={colors.textMuted} /><Text style={s.emptyText}>{t('movies.emptyUpcoming')}</Text></>}
          </View>
        ) : (
          <FlashList
            data={upcoming ?? []}
            estimatedItemSize={104}
            keyExtractor={(m) => m.uuid ?? m.title}
            contentContainerStyle={{ padding: space(3) }}
            ItemSeparatorComponent={() => <View style={{ height: space(3) }} />}
            renderItem={({ item }: { item: MovieRow }) => {
              const d = item.release_date ? daysUntil(item.release_date) : 0;
              return (
                <Pressable style={s.card} onPress={() => item.uuid && router.push(`/movie/${item.uuid}`)}>
                  <Image source={{ uri: item.poster ?? posterFor(item.title + (item.year ?? '')) }} style={s.cardPoster} contentFit="cover" transition={120} />
                  <View style={{ flex: 1, marginLeft: space(3), justifyContent: 'center', gap: 4 }}>
                    <Text style={font.h2} numberOfLines={2}>{item.title}</Text>
                    <Text style={font.muted}>{t('movies.releases', { date: item.release_date })}</Text>
                  </View>
                  <View style={s.soon}><Text style={s.soonNum}>{d}</Text><Text style={s.soonLbl}>{t(d === 1 ? 'common.dayUnit_one' : 'common.dayUnit_other')}</Text></View>
                </Pressable>
              );
            }}
          />
        )
      ) : loading ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (movies ?? []).length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="film-outline" size={44} color={colors.textMuted} />
          <Text style={[s.emptyText, { lineHeight: 20 }]}>{t('movies.emptyLibrary')}</Text>
          <Pressable style={s.exploreBtn} onPress={() => router.push('/explore')}>
            <Ionicons name="compass-outline" size={18} color={colors.accentInk} />
            <Text style={{ color: colors.accentInk, fontWeight: '800' }}>  {t('movies.goExplore')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={s.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('movies.searchLibrary')} placeholderTextColor={colors.textMuted} style={[s.searchInput, { outlineStyle: 'none' } as any]} autoCorrect={false} />
            {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={16} color={colors.textMuted} /></Pressable> : null}
            <Pressable onPress={() => setSort(sort === 'recent' ? 'az' : 'recent')} hitSlop={8} style={s.sortBtn}>
              <Ionicons name={sort === 'az' ? 'text-outline' : 'time-outline'} size={15} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}> {sort === 'az' ? 'A-Z' : t('shows.sortRecent')}</Text>
            </Pressable>
          </View>
          <FlashList
            key={numColumns}
            data={items}
            estimatedItemSize={itemWidth * 1.5}
            getItemType={(i) => i.kind}
            keyExtractor={(i, idx) => (i.kind === 'header' ? 'h' + i.key : 'r' + idx)}
            contentContainerStyle={{ padding: space(1), paddingBottom: 90 }}
            renderItem={({ item }) =>
              item.kind === 'header' ? (
                <View style={s.sectionHead}><Text style={s.sectionTitle}>{item.label}</Text><Text style={s.sectionCount}>{item.count}</Text></View>
              ) : (
                <View style={{ flexDirection: 'row' }}>
                  {item.movies.map((m: MovieRow) => <MovieCell key={m.uuid ?? m.title} item={m} width={itemWidth} onPress={() => m.uuid && router.push(`/movie/${m.uuid}`)} />)}
                </View>
              )
            }
          />
          {showFilters && (
            <View style={s.filterSheet}>
              <Pressable onPress={() => { setFavOnly((v) => !v); setShowFilters(false); }} style={[s.filterChip, favOnly && s.filterChipActive, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                <Ionicons name={favOnly ? 'heart' : 'heart-outline'} size={13} color={favOnly ? colors.accentInk : colors.danger} />
                <Text style={{ color: favOnly ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 13 }}>{t('movies.favorites')}</Text>
              </Pressable>
              {[{ key: 'all' as const }, ...MCATS].map((c) => (
                <Pressable key={c.key} onPress={() => { setFilter(c.key as any); setShowFilters(false); }} style={[s.filterChip, filter === c.key && s.filterChipActive]}>
                  <Text style={{ color: filter === c.key ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 13 }}>{c.key === 'all' ? t('categories.all') : t('movies.' + c.key)}</Text>
                </Pressable>
              ))}
              {libGenreIds.length > 0 && <View style={s.filterDivider} />}
              {libGenreIds.length > 0 && [{ id: 'all' as const }, ...libGenreIds.map((id) => ({ id }))].map((g) => (
                <Pressable key={'g' + g.id} onPress={() => { setGenreFilter(g.id as any); setShowFilters(false); }} style={[s.filterChip, genreFilter === g.id && s.filterChipActive]}>
                  <Text style={{ color: genreFilter === g.id ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 13 }}>{g.id === 'all' ? t('shows.allGenres') : genreNames[g.id as number]}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable style={s.fab} onPress={() => setShowFilters((v) => !v)}>
            <Ionicons name="options-outline" size={18} color={colors.accentInk} />
            <Text style={s.fabText}>  {filter === 'all' && genreFilter === 'all' && !favOnly ? t('shows.filters') : [favOnly ? t('movies.favorites') : null, filter !== 'all' ? t('movies.' + filter) : null, genreFilter !== 'all' ? genreNames[genreFilter] : null].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space(6), paddingHorizontal: space(4), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { ...font.h2, color: colors.textMuted },
  tabActive: { color: colors.text, borderBottomWidth: 2, borderBottomColor: colors.text, paddingBottom: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8), gap: space(3) },
  exploreBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, marginTop: space(1) },
  emptyText: { ...font.muted, textAlign: 'center', lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(2.5) },
  cardPoster: { width: 64, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  soon: { alignItems: 'center', minWidth: 52, paddingRight: space(2) },
  soonNum: { ...font.h1, fontSize: 22, color: colors.text },
  soonLbl: { ...font.muted, fontSize: 10, letterSpacing: 1 },
  poster: { width: '100%', aspectRatio: 2 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  title: { ...font.body, fontSize: 12, marginTop: 4 },
  year: { ...font.muted, fontSize: 11 },
  badge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  rewatchBadge: { position: 'absolute', top: 6, left: 6, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: '#000A', borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  rewatchText: { color: colors.accent, fontWeight: '800', fontSize: 11 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingTop: space(5), paddingBottom: space(2) },
  sectionTitle: { ...font.h1, fontSize: 20 },
  sectionCount: { ...font.muted, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  fab: { position: 'absolute', bottom: space(4), alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: colors.accentInk, fontWeight: '800' },
  filterSheet: { position: 'absolute', bottom: space(4) + 52, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(3), maxWidth: 520 },
  filterChip: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  filterChipActive: { backgroundColor: colors.accent },
  filterDivider: { width: '100%', height: 1, backgroundColor: colors.border, marginVertical: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space(3), marginTop: space(2), paddingHorizontal: space(3), height: 38, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
});
