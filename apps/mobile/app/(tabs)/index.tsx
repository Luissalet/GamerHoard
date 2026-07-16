import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, TextInput, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../../src/theme';
import { NotificationBell } from '../../src/NotificationBell';
import { DragScrollView } from '../../src/DragScrollView';
import { useQuery } from '../../src/useData';
import { data, type ShowRow } from '../../src/db';
import { posterFor } from '../../src/img';
import { categoryOf, CATEGORIES, progress, type Category } from '../../src/categories';
import { genreNameMap, parseGenres, libraryGenres, backfillShowGenres } from '../../src/genres';
import { GameActionsModal } from '../../src/GameActionsModal';
import { NextGameModal } from '../../src/NextGameModal';
import { SkeletonGrid, SkeletonRow } from '../../src/Skeleton';

const normQ = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const chunk = <T,>(arr: T[], n: number) => { const r: T[][] = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
const barColor = { watching: colors.accent, up_to_date: colors.success, finished: colors.purple, none: 'transparent' } as const;
type SortMode = 'recent' | 'az' | 'hours';
type Tab = 'home' | 'all' | 'playing';

function GameCell({ game, width, onPress, onLongPress }: { game: ShowRow; width: number; onPress: () => void; onLongPress?: () => void }) {
  const pr = progress(game);
  const hours = game.playtime_minutes ? Math.round(game.playtime_minutes / 60) : null;
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      style={{ width, padding: space(1.5), transform: [{ scale: hover ? 1.03 : 1 }] }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
    >
      <View>
        <Image source={{ uri: game.poster ?? posterFor(game.tvdb_id) }} style={s.cover} contentFit="cover" transition={120} />
        {pr.color !== 'none' && (
          <View style={s.barTrack}><View style={{ height: 4, width: `${pr.frac * 100}%`, backgroundColor: barColor[pr.color] }} /></View>
        )}
        {game.is_favorite ? <View style={s.favDot}><Ionicons name="heart" size={11} color={colors.danger} /></View> : null}
        {hours ? <View style={s.hoursTag}><Text style={s.hoursTagText}>{hours}h</Text></View> : null}
        {game.user_rating ? <View style={s.rateTag}><Ionicons name="star" size={9} color={colors.accent} /><Text style={s.rateTagText}> {(game.user_rating / 2).toFixed(game.user_rating % 2 ? 1 : 0)}</Text></View> : null}
      </View>
      <Text style={s.cellTitle} numberOfLines={1}>{game.title}</Text>
    </Pressable>
  );
}

/** Wide "now playing" card for the Home carousel. */
function PlayingCard({ game, onPress, onLongPress }: { game: ShowRow; onPress: () => void; onLongPress?: () => void }) {
  const { t } = useTranslation();
  const pr = progress(game);
  const hours = game.playtime_minutes ? Math.round(game.playtime_minutes / 60) : null;
  return (
    <Pressable style={{ width: 230 }} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>
      <Image source={{ uri: game.poster ?? posterFor(game.tvdb_id) }} style={s.playingCover} contentFit="cover" transition={150} />
      <View style={s.playingBar}><View style={{ height: 4, width: `${Math.max(pr.frac * 100, 4)}%`, backgroundColor: barColor[pr.color] === 'transparent' ? colors.accent : barColor[pr.color] }} /></View>
      <Text style={[font.body, { fontWeight: '700', marginTop: 6 }]} numberOfLines={1}>{game.title}</Text>
      <Text style={[font.muted, { fontSize: 11, marginTop: 1 }]} numberOfLines={1}>
        {hours ? t('gameDetail.yourHours', { h: hours }) : t('categories.watching')}
        {(game.total_episodes ?? 0) > 0 ? `  ·  DLC ${game.watched_episodes}/${game.total_episodes}` : ''}
      </Text>
    </Pressable>
  );
}

function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space(5) }}>
      <View style={s.sectionRow}>
        <Text style={[font.h1, { fontSize: 20, flex: 1 }]}>{title}</Text>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{action}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default function GamesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const numColumns = Math.max(2, Math.min(6, Math.floor(width / 200)));
  const itemWidth = width / numColumns;

  const [tab, setTab] = useState<Tab>('home');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [genreFilter, setGenreFilter] = useState<number | 'all'>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [genreNames, setGenreNames] = useState<Record<number, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [actionsFor, setActionsFor] = useState<ShowRow | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const { loading: lAll, data: all } = useQuery((d) => d.getShows(), [nonce]);
  const { fav, ts } = useLocalSearchParams<{ fav?: string; ts?: string }>();
  const refresh = () => setNonce((n) => n + 1);

  React.useEffect(() => { if (fav === '1') { setFavOnly(true); setTab('all'); } }, [fav, ts]);
  React.useEffect(() => { genreNameMap(i18n.language).then(setGenreNames); }, [i18n.language]);

  // Web: "/" focuses the library search from anywhere on this screen.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const el = (globalThis as any).document?.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); setTab('all'); setTimeout(() => searchRef.current?.focus(), 50); }
    };
    (globalThis as any).document?.addEventListener('keydown', onKey);
    return () => (globalThis as any).document?.removeEventListener('keydown', onKey);
  }, []);

  const libGenreIds = useMemo(() => libraryGenres(all ?? []).filter((id) => genreNames[id]).sort((a, b) => (genreNames[a] || '').localeCompare(genreNames[b] || '')), [all, genreNames]);
  const playing = useMemo(() => (all ?? []).filter((g) => categoryOf(g) === 'watching').sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? '')), [all]);
  const backlogCount = useMemo(() => (all ?? []).filter((g) => g.state === 'backlog' || g.state === 'stopped').length, [all]);
  const recentlyAdded = useMemo(() => [...(all ?? [])].sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? '')).slice(0, 12), [all]);
  const almostDone = useMemo(() => (all ?? []).filter((g) => {
    const total = g.total_episodes ?? 0;
    return g.state !== 'archived' && total > 0 && g.watched_episodes > 0 && g.watched_episodes < total;
  }).sort((a, b) => (b.watched_episodes / (b.total_episodes || 1)) - (a.watched_episodes / (a.total_episodes || 1))).slice(0, 12), [all]);
  const homeStats = useMemo(() => {
    const games = all ?? [];
    return {
      total: games.length,
      hours: Math.round(games.reduce((n, g) => n + (g.playtime_minutes || 0), 0) / 60),
      completed: games.filter((g) => categoryOf(g) === 'finished').length,
    };
  }, [all]);

  // Backfill genres for library games (once), so the genre filter has data.
  useFocusEffect(React.useCallback(() => {
    let alive = true;
    (async () => { await data.ready(); const ch = await backfillShowGenres(all ?? []); if (alive && ch) refresh(); })();
    return () => { alive = false; };
  }, [all]));

  const items = useMemo(() => {
    const byCat = new Map<Category, ShowRow[]>();
    const term = normQ(q);
    const src = (all ?? []).filter((g) => (genreFilter === 'all' || parseGenres(g.genres).includes(genreFilter)) && (!favOnly || g.is_favorite === 1) && (!term || normQ(g.title).includes(term)));
    if (sort === 'az') src.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'hours') src.sort((a, b) => (b.playtime_minutes ?? 0) - (a.playtime_minutes ?? 0));
    for (const g of src) { const c = categoryOf(g); if (!byCat.has(c)) byCat.set(c, []); byCat.get(c)!.push(g); }
    const out: any[] = [];
    for (const { key } of CATEGORIES) {
      if (filter !== 'all' && filter !== key) continue;
      const list = byCat.get(key) ?? [];
      if (!list.length) continue;
      out.push({ kind: 'header', key, label: t('categories.' + key), count: list.length });
      for (const row of chunk(list, numColumns)) out.push({ kind: 'row', games: row });
    }
    return out;
  }, [all, filter, genreFilter, favOnly, q, sort, numColumns, i18n.language]);

  const openGame = (g: ShowRow) => router.push(`/show/${g.tvdb_id}`);
  const sortIcon: Record<SortMode, keyof typeof Ionicons.glyphMap> = { recent: 'time-outline', az: 'text-outline', hours: 'hourglass-outline' };
  const sortLabel: Record<SortMode, string> = { recent: t('games.sortRecent'), az: 'A-Z', hours: t('games.sortHours') };
  const nextSort: Record<SortMode, SortMode> = { recent: 'az', az: 'hours', hours: 'recent' };

  const EmptyLibrary = (
    <View style={s.empty}>
      <Ionicons name="game-controller-outline" size={44} color={colors.textMuted} />
      <Text style={[font.muted, { marginTop: space(2), textAlign: 'center', lineHeight: 20 }]}>{t('games.emptyLibrary')}</Text>
      <Pressable style={s.exploreBtn} onPress={() => router.push('/explore')}>
        <Ionicons name="compass-outline" size={18} color={colors.accentInk} />
        <Text style={{ color: colors.accentInk, fontWeight: '800' }}>  {t('games.goExplore')}</Text>
      </Pressable>
      <Pressable style={s.steamBtn} onPress={() => router.push('/import')}>
        <Ionicons name="logo-steam" size={18} color={colors.text} />
        <Text style={{ color: colors.text, fontWeight: '800' }}>  {t('steam.title')}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.tabs}>
        <Pressable onPress={() => setTab('home')}><Text style={[s.tab, tab === 'home' && s.tabActive]}>{t('games.homeTab')}</Text></Pressable>
        <Pressable onPress={() => setTab('all')}><Text style={[s.tab, tab === 'all' && s.tabActive]}>{t('games.allGames')}</Text></Pressable>
        <Pressable onPress={() => setTab('playing')}><Text style={[s.tab, tab === 'playing' && s.tabActive]}>{t('games.playing')}</Text></Pressable>
        <View style={{ flex: 1 }} />
        {backlogCount > 0 && (
          <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} style={{ marginRight: space(4) }}>
            <Ionicons name="dice-outline" size={22} color={colors.text} />
          </Pressable>
        )}
        <NotificationBell />
      </View>

      {tab === 'home' ? (
        lAll ? <View style={{ paddingTop: space(4) }}><SkeletonRow count={4} cardWidth={230} /><View style={{ height: space(6) }} /><SkeletonRow count={5} cardWidth={140} /></View>
        : (all ?? []).length === 0 ? EmptyLibrary : (
          <ScrollView contentContainerStyle={{ paddingBottom: space(10) }}>
            {/* Stats strip */}
            <Pressable style={s.statsStrip} onPress={() => router.push('/stats')}>
              <View style={s.statCell}><Text style={s.statNum}>{homeStats.total}</Text><Text style={s.statLbl}>{t('profile.games')}</Text></View>
              <View style={s.statDiv} />
              <View style={s.statCell}><Text style={s.statNum}>{homeStats.hours}</Text><Text style={s.statLbl}>{t('profile.hours')}</Text></View>
              <View style={s.statDiv} />
              <View style={s.statCell}><Text style={s.statNum}>{homeStats.completed}</Text><Text style={s.statLbl}>{t('profile.completed')}</Text></View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginRight: space(2) }} />
            </Pressable>

            {playing.length > 0 && (
              <Section title={t('games.playingNow')} action={t('games.seeAll')} onAction={() => setTab('playing')}>
                <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
                  {playing.map((g) => <PlayingCard key={g.tvdb_id} game={g} onPress={() => openGame(g)} onLongPress={() => setActionsFor(g)} />)}
                </DragScrollView>
              </Section>
            )}

            {backlogCount > 0 && (
              <Pressable style={s.pickCard} onPress={() => setPickerOpen(true)}>
                <View style={s.pickIcon}><Ionicons name="dice" size={24} color={colors.accentInk} /></View>
                <View style={{ flex: 1, marginLeft: space(3) }}>
                  <Text style={[font.h2, { color: colors.text }]}>{t('games.nextPick')}</Text>
                  <Text style={[font.muted, { marginTop: 2 }]}>{t('games.nextPickHint', { n: backlogCount })}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            )}

            {almostDone.length > 0 && (
              <Section title={t('games.almostDone')}>
                <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
                  {almostDone.map((g) => <PlayingCard key={g.tvdb_id} game={g} onPress={() => openGame(g)} onLongPress={() => setActionsFor(g)} />)}
                </DragScrollView>
              </Section>
            )}

            {recentlyAdded.length > 0 && (
              <Section title={t('games.recentlyAdded')} action={t('games.seeAll')} onAction={() => setTab('all')}>
                <DragScrollView contentContainerStyle={{ paddingHorizontal: space(2.5) }}>
                  {recentlyAdded.map((g) => <GameCell key={g.tvdb_id} game={g} width={150} onPress={() => openGame(g)} onLongPress={() => setActionsFor(g)} />)}
                </DragScrollView>
              </Section>
            )}
          </ScrollView>
        )
      ) : tab === 'playing' ? (
        lAll ? <SkeletonGrid columns={numColumns} rows={3} itemWidth={itemWidth} /> : playing.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="game-controller-outline" size={44} color={colors.textMuted} />
            <Text style={[font.muted, { marginTop: space(2), textAlign: 'center', lineHeight: 20 }]}>{(all ?? []).length === 0 ? t('games.emptyLibrary') : t('games.emptyPlaying')}</Text>
            {(all ?? []).length === 0 ? (
              <Pressable style={s.exploreBtn} onPress={() => router.push('/explore')}>
                <Ionicons name="compass-outline" size={18} color={colors.accentInk} />
                <Text style={{ color: colors.accentInk, fontWeight: '800' }}>  {t('games.goExplore')}</Text>
              </Pressable>
            ) : backlogCount > 0 ? (
              <Pressable style={s.exploreBtn} onPress={() => setPickerOpen(true)}>
                <Ionicons name="dice" size={18} color={colors.accentInk} />
                <Text style={{ color: colors.accentInk, fontWeight: '800' }}>  {t('games.nextPick')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <FlashList
            data={chunk(playing, numColumns)}
            estimatedItemSize={itemWidth}
            keyExtractor={(_row, idx) => 'p' + idx}
            contentContainerStyle={{ padding: space(1) }}
            renderItem={({ item: row }) => (
              <View style={{ flexDirection: 'row' }}>
                {row.map((g: ShowRow) => <GameCell key={g.tvdb_id} game={g} width={itemWidth} onPress={() => openGame(g)} onLongPress={() => setActionsFor(g)} />)}
              </View>
            )}
          />
        )
      ) : (
        <View style={{ flex: 1 }}>
          <View style={s.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput ref={searchRef} value={q} onChangeText={setQ} placeholder={t('games.searchLibrary')} placeholderTextColor={colors.textMuted} style={[s.searchInput, { outlineStyle: 'none' } as any]} autoCorrect={false} />
            {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={16} color={colors.textMuted} /></Pressable> : null}
            <Pressable onPress={() => setSort(nextSort[sort])} hitSlop={8} style={s.sortBtn}>
              <Ionicons name={sortIcon[sort]} size={15} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}> {sortLabel[sort]}</Text>
            </Pressable>
          </View>
          {lAll ? <SkeletonGrid columns={numColumns} rows={4} itemWidth={itemWidth} /> : (all ?? []).length === 0 ? EmptyLibrary : (
            <FlashList
              data={items}
              estimatedItemSize={itemWidth}
              getItemType={(i) => i.kind}
              keyExtractor={(i, idx) => (i.kind === 'header' ? 'h' + i.key : 'r' + idx)}
              contentContainerStyle={{ padding: space(1), paddingBottom: 90 }}
              renderItem={({ item }) =>
                item.kind === 'header' ? (
                  <View style={s.sectionHead}><Text style={s.sectionTitle}>{item.label}</Text><Text style={s.sectionCount}>{item.count}</Text></View>
                ) : (
                  <View style={{ flexDirection: 'row' }}>
                    {item.games.map((g: ShowRow) => <GameCell key={g.tvdb_id} game={g} width={itemWidth} onPress={() => openGame(g)} onLongPress={() => setActionsFor(g)} />)}
                  </View>
                )
              }
            />
          )}
          {showFilters && (
            <View style={s.filterSheet}>
              <Pressable onPress={() => { setFavOnly((v) => !v); setShowFilters(false); }} style={[s.filterChip, favOnly && s.filterChipActive, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                <Ionicons name={favOnly ? 'heart' : 'heart-outline'} size={13} color={favOnly ? colors.accentInk : colors.danger} />
                <Text style={{ color: favOnly ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 13 }}>{t('games.favorites')}</Text>
              </Pressable>
              {[{ key: 'all' as const }, ...CATEGORIES].map((c) => (
                <Pressable key={c.key} onPress={() => { setFilter(c.key as any); setShowFilters(false); }} style={[s.filterChip, filter === c.key && s.filterChipActive]}>
                  <Text style={{ color: filter === c.key ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 13 }}>{c.key === 'all' ? t('categories.all') : t('categories.' + c.key)}</Text>
                </Pressable>
              ))}
              {libGenreIds.length > 0 && <View style={s.filterDivider} />}
              {libGenreIds.length > 0 && [{ id: 'all' as const }, ...libGenreIds.map((id) => ({ id }))].map((g) => (
                <Pressable key={'g' + g.id} onPress={() => { setGenreFilter(g.id as any); setShowFilters(false); }} style={[s.filterChip, genreFilter === g.id && s.filterChipActive]}>
                  <Text style={{ color: genreFilter === g.id ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 13 }}>{g.id === 'all' ? t('games.allGenres') : genreNames[g.id as number]}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable style={s.fab} onPress={() => setShowFilters((v) => !v)}>
            <Ionicons name="options-outline" size={18} color={colors.accentInk} />
            <Text style={s.fabText}>  {filter === 'all' && genreFilter === 'all' && !favOnly ? t('games.filters') : [favOnly ? t('games.favorites') : null, filter !== 'all' ? t('categories.' + filter) : null, genreFilter !== 'all' ? genreNames[genreFilter] : null].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        </View>
      )}

      <GameActionsModal game={actionsFor} onClose={() => setActionsFor(null)} onChanged={refresh} />
      <NextGameModal visible={pickerOpen} games={all ?? []} onClose={() => setPickerOpen(false)} onChanged={refresh} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', alignItems: 'center', gap: space(5), paddingHorizontal: space(4), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { ...font.h2, color: colors.textMuted },
  tabActive: { color: colors.text, borderBottomWidth: 2, borderBottomColor: colors.text, paddingBottom: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space(3), marginTop: space(2), paddingHorizontal: space(3), height: 38, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  barTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: '#0007', borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, overflow: 'hidden' },
  favDot: { position: 'absolute', top: 6, right: 6, backgroundColor: '#000A', borderRadius: 10, padding: 3 },
  hoursTag: { position: 'absolute', top: 6, left: 6, backgroundColor: '#000A', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  hoursTagText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  rateTag: { position: 'absolute', bottom: 10, right: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: '#000A', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  rateTagText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  cellTitle: { ...font.body, fontSize: 12, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8) },
  exploreBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, marginTop: space(4) },
  steamBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, marginTop: space(3) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingTop: space(5), paddingBottom: space(2) },
  sectionTitle: { ...font.h1, fontSize: 20 },
  sectionCount: { ...font.muted, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), marginBottom: space(3) },
  statsStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginHorizontal: space(4), marginTop: space(4), paddingVertical: space(3) },
  statCell: { flex: 1, alignItems: 'center' },
  statNum: { ...font.h1, fontSize: 20 },
  statLbl: { ...font.muted, fontSize: 11 },
  statDiv: { width: 1, height: 28, backgroundColor: colors.border },
  playingCover: { width: 230, aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  playingBar: { height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  pickCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginHorizontal: space(4), marginTop: space(5), padding: space(3) },
  pickIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: space(4), alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: colors.accentInk, fontWeight: '800' },
  filterSheet: { position: 'absolute', bottom: space(4) + 52, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(3), maxWidth: 520 },
  filterChip: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  filterChipActive: { backgroundColor: colors.accent },
  filterDivider: { width: '100%', height: 1, backgroundColor: colors.border, marginVertical: 4 },
});
