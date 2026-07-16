import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions, Platform, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, space, font, radius } from '../../src/theme';
import { NotificationBell } from '../../src/NotificationBell';
import { DragScrollView } from '../../src/DragScrollView';
import { data } from '../../src/db';
import { isCloud } from '../../src/lib/backend';
import { searchUsers, type UserResult } from '../../src/social';
import { searchMulti, searchPeople, trending, newReleases, popularList, topRatedList, upcomingMovies, upcomingShows, detailsById, movieReleaseDate, tvdbForTmdb, tmdbImg, tmdbConfigured, genreList, discoverByGenres, platformList, discoverByPlatform, type DiscoverItem, type PersonHit, type PlatformDef } from '../../src/tmdb';
import { FriendsFeed } from '../../src/FriendsFeed';
import { SkeletonRow, SkeletonGrid } from '../../src/Skeleton';

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const chunk = <T,>(arr: T[], n: number) => { const r: T[][] = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
const slugify = (x: string) => norm(x).replace(/\s+/g, '-');

function Card({ item, onPress, onAdd, onAddLong, added, busy, width = 120 as number | string }: { item: DiscoverItem; onPress: () => void; onAdd: () => void; onAddLong?: () => void; added: boolean; busy: boolean; width?: number | string }) {
  const [hover, setHover] = useState(false);
  return (
    <View style={{ width: width as any, transform: [{ scale: hover ? 1.03 : 1 }] }}>
      <View>
        <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}>
          <Image source={{ uri: tmdbImg(item.poster, 'w342') ?? undefined }} style={s.poster} contentFit="cover" transition={120} />
        </Pressable>
        {/* Sibling of the poster press target — never nested inside it — so the tap can't be
            swallowed by the card press or trigger navigation. Long-press = choose the state. */}
        <Pressable style={[s.add, added && s.addOn]} onPress={onAdd} onLongPress={onAddLong} delayLongPress={350} hitSlop={8} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={added ? 'checkmark' : 'add'} size={18} color={added ? colors.accentInk : '#fff'} />}
        </Pressable>
      </View>
      <Pressable onPress={onPress}>
        <Text style={[font.body, { fontSize: 12, marginTop: 4 }]} numberOfLines={1}>{item.title}</Text>
        {item.year ? <Text style={[font.muted, { fontSize: 11 }]} numberOfLines={1}>{item.year}</Text> : null}
      </Pressable>
    </View>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={s.tabBtn} onPress={onPress}>
      <Text style={[font.h2, { color: active ? colors.text : colors.textMuted }]}>{label}</Text>
      <View style={[s.tabInd, { backgroundColor: active ? colors.accent : 'transparent' }]} />
    </Pressable>
  );
}

function PersonRow({ u, onPress }: { u: UserResult; onPress: () => void }) {
  const initial = (u.display_name || u.handle || '?').trim().charAt(0).toUpperCase();
  return (
    <Pressable style={s.personRow} onPress={onPress}>
      {u.avatar_url
        ? <Image source={{ uri: u.avatar_url }} style={s.avatar} contentFit="cover" />
        : <View style={[s.avatar, s.avatarFallback]}><Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{initial}</Text></View>}
      <View style={{ flex: 1, marginLeft: space(3) }}>
        {u.display_name ? <Text style={font.h2} numberOfLines={1}>{u.display_name}</Text> : null}
        <Text style={[font.muted, u.display_name ? null : { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>@{u.handle}</Text>
        {u.bio ? <Text style={font.muted} numberOfLines={1}>{u.bio}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const numColumns = Math.max(3, Math.min(10, Math.floor(width / 150)));
  const itemWidth = width / numColumns;
  const [query, setQuery] = useState('');
  const [mainTab, setMainTab] = useState<'discover' | 'friends'>('discover');
  const [tab, setTab] = useState<'content' | 'people'>('content');
  const [genres, setGenres] = useState<{ name: string; tvId?: number; movieId?: number }[]>([]);
  const [selGenre, setSelGenre] = useState<string | null>(null);
  const [genreSections, setGenreSections] = useState<{ titleKey: string; genre: string; items: DiscoverItem[] }[] | null>(null);
  const [platforms, setPlatforms] = useState<PlatformDef[]>([]);
  const [selPlatform, setSelPlatform] = useState<number | null>(null);
  const [platformSections, setPlatformSections] = useState<DiscoverItem[] | null>(null);
  const [results, setResults] = useState<DiscoverItem[] | null>(null);
  const [tmdbPeople, setTmdbPeople] = useState<PersonHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [people, setPeople] = useState<UserResult[] | null>(null);
  const [searchingPeople, setSearchingPeople] = useState(false);
  const [sections, setSections] = useState<{ titleKey: string; items: DiscoverItem[] }[]>([]);
  const [libChecked, setLibChecked] = useState<Set<string>>(new Set());
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [libVer, setLibVer] = useState(0);
  const [addFor, setAddFor] = useState<DiscoverItem | null>(null);
  const lib = useRef<{ movieTitles: Map<string, string>; movieSlugs: Map<string, string>; showTitles: Map<string, number> }>({ movieTitles: new Map(), movieSlugs: new Map(), showTitles: new Map() });
  const tvdbMap = useRef<Record<number, number>>({});
  const searchRef = useRef<TextInput>(null);

  // Web: "/" focuses the search box.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const el = (globalThis as any).document?.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
    };
    (globalThis as any).document?.addEventListener('keydown', onKey);
    return () => (globalThis as any).document?.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    (async () => {
      await data.ready();
      const [mv, up, sh] = await Promise.all([data.getMovies(5000), data.getUpcomingMovies(), data.getShows()]);
      const mt = new Map<string, string>(), ms = new Map<string, string>(), st = new Map<string, number>();
      for (const m of [...mv, ...up]) { if (m.title) mt.set(norm(m.title), m.uuid ?? ''); if (m.slug) ms.set(m.slug.toLowerCase(), m.uuid ?? ''); }
      for (const x of sh) { if (x.title) st.set(norm(x.title), x.tvdb_id); }
      lib.current = { movieTitles: mt, movieSlugs: ms, showTitles: st };
      setLibVer((v) => v + 1);
    })();
  }, []);

  const { genre: genreParam, ts: genreTs } = useLocalSearchParams<{ genre?: string; ts?: string }>();
  useEffect(() => {
    if (genreParam) { setSelGenre(String(genreParam)); setQuery(''); setMainTab('discover'); }
  }, [genreParam, genreTs]);

  const { i18n } = useTranslation();
  useEffect(() => {
    (async () => {
      const [gtv, gmv] = await Promise.all([genreList('tv', i18n.language), genreList('movie', i18n.language)]);
      const byName = new Map<string, { name: string; tvId?: number; movieId?: number }>();
      for (const g of gtv) byName.set(g.name, { name: g.name, tvId: g.id });
      for (const g of gmv) { const e = byName.get(g.name); if (e) e.movieId = g.id; else byName.set(g.name, { name: g.name, movieId: g.id }); }
      setGenres([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
  }, [i18n.language]);

  useEffect(() => { platformList().then(setPlatforms).catch(() => {}); }, []);

  useEffect(() => {
    if (!selGenre) { setGenreSections(null); return; }
    const g = genres.find((x) => x.name === selGenre);
    if (!g) return;
    let alive = true;
    setGenreSections(null);
    (async () => {
      const gid = g.tvId ?? g.movieId;
      const games = gid ? await discoverByGenres('tv', [gid]) : [];
      if (!alive) return;
      const out: { titleKey: string; genre: string; items: DiscoverItem[] }[] = [];
      if (games.length) out.push({ titleKey: 'explore.secGenreShows', genre: g.name, items: games });
      setGenreSections(out);
    })();
    return () => { alive = false; };
  }, [selGenre, genres]);

  useEffect(() => {
    if (selPlatform == null) { setPlatformSections(null); return; }
    let alive = true; setPlatformSections(null);
    discoverByPlatform(selPlatform).then((g) => { if (alive) setPlatformSections(g); });
    return () => { alive = false; };
  }, [selPlatform]);

  useEffect(() => {
    (async () => {
      const [tr, nr, upm, pop, top] = await Promise.all([trending(), newReleases(), upcomingMovies(), popularList('tv'), topRatedList('tv')]);
      setSections([
        { titleKey: 'explore.secTrending', items: tr },
        { titleKey: 'explore.secNewReleases', items: nr },
        { titleKey: 'explore.secPopularShows', items: pop },
        { titleKey: 'explore.secTopRatedShows', items: top },
        { titleKey: 'explore.secUpcomingMovies', items: upm },
      ]);
    })();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults(null); setTmdbPeople([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const [r, ppl] = await Promise.all([searchMulti(query), searchPeople(query)]);
      setResults(r); setTmdbPeople(ppl); setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // People search (cloud only — handles exist only with Supabase accounts).
  useEffect(() => {
    if (!isCloud) return;
    if (!query.trim()) { setPeople(null); return; }
    setSearchingPeople(true);
    const t = setTimeout(async () => { setPeople(await searchUsers(query)); setSearchingPeople(false); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const resultRows = useMemo(() => chunk(results ?? [], numColumns), [results, numColumns]);

  const inLib = (it: DiscoverItem) => it.kind === 'movie'
    ? (lib.current.movieTitles.has(norm(it.title)) || lib.current.movieSlugs.has(slugify(it.title)))
    : lib.current.showTitles.has(norm(it.title));

  useEffect(() => {
    const set = new Set<string>();
    for (const it of [...sections.flatMap((x) => x.items), ...(results ?? [])]) if (inLib(it)) set.add(`${it.kind}:${it.id}`);
    setLibChecked(set);
  }, [sections, results, libVer]);

  const isChecked = (it: DiscoverItem) => { const k = `${it.kind}:${it.id}`; return toggled.has(k) ? (toggled.get(k) as boolean) : libChecked.has(k); };
  const movieUuid = (it: DiscoverItem) => lib.current.movieTitles.get(norm(it.title)) || lib.current.movieSlugs.get(slugify(it.title)) || `tmdb:${it.id}`;
  const showTvdb = (it: DiscoverItem) => tvdbMap.current[it.id] ?? lib.current.showTitles.get(norm(it.title));

  const open = async (it: DiscoverItem) => {
    if (it.kind === 'movie') { router.push(`/movie/${movieUuid(it)}`); return; }
    setBusy((b) => new Set(b).add(`open:${it.id}`));
    const tvdb = showTvdb(it) ?? (await tvdbForTmdb(it.id));
    setBusy((b) => { const n = new Set(b); n.delete(`open:${it.id}`); return n; });
    if (tvdb) router.push(`/show/${tvdb}`);
  };

  // Cross-platform "couldn't add" feedback (RN Alert is a no-op on web).
  const notify = (msg: string) => {
    if (Platform.OS === 'web') (globalThis as any).alert?.(msg);
    else Alert.alert(msg);
  };

  const toggleAdd = async (it: DiscoverItem, state?: string) => {
    const key = `${it.kind}:${it.id}`;
    if (busy.has(key)) return;
    const currently = isChecked(it);
    setBusy((b) => new Set(b).add(key));
    try {
      await data.ready();
      if (currently && !state) {
        if (it.kind === 'movie') { const u = movieUuid(it); if (u) await data.removeMovie(u); }
        else { const tvdb = showTvdb(it); if (tvdb) await data.removeShow(tvdb); }
        setToggled((m) => new Map(m).set(key, false));
      } else if (currently && state) {
        // Already in the library: long-press just changes its state.
        const tvdb = showTvdb(it);
        if (tvdb) await data.setShowState(tvdb, state as any);
      } else {
        if (it.kind === 'movie') {
          const uuid = `tmdb:${it.id}`;
          await data.addMovie({ uuid, title: it.title, slug: null, year: it.year ? Number(it.year) : null, poster: tmdbImg(it.poster, 'w342'), release_date: null });
          movieReleaseDate(it.id).then((rd) => { if (rd) data.setMovieReleaseDate(uuid, rd); });
        } else {
          const r = await detailsById('tv', it.id);
          // No TVDB mapping → the show can't be tracked yet. Say so instead of
          // silently flipping the button to ✓ (the old behavior).
          if (!r?.add?.tvdb_id) { notify(t('explore.addUnsupported', { title: it.title })); return; }
          tvdbMap.current[it.id] = r.add.tvdb_id;
          await data.addShow({ tvdb_id: r.add.tvdb_id, title: r.add.title, poster: r.add.poster, tmdb_status: r.add.tmdb_status ?? null, total_episodes: r.add.total_episodes ?? null, network: r.add.network ?? null, last_aired_season: r.add.last_aired_season ?? null, last_aired_episode: r.add.last_aired_episode ?? null, state: state ?? 'backlog' });
        }
        setToggled((m) => new Map(m).set(key, true));
      }
    } catch {
      notify(t('explore.addFailed', { title: it.title }));
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    }
  };

  const cardProps = (it: DiscoverItem) => ({ item: it, onPress: () => open(it), onAdd: () => toggleAdd(it), onAddLong: () => setAddFor(it), added: isChecked(it), busy: busy.has(`${it.kind}:${it.id}`) });

  const showPeople = isCloud && tab === 'people';

  if (isCloud && mainTab === 'friends') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <View style={s.tabs}>
          <TabBtn label={t('explore.tabDiscover')} active={false} onPress={() => setMainTab('discover')} />
          <TabBtn label={t('explore.tabFriends')} active onPress={() => {}} />
        </View>
        <FriendsFeed />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {isCloud && (
        <View style={s.tabs}>
          <TabBtn label={t('explore.tabDiscover')} active onPress={() => {}} />
          <TabBtn label={t('explore.tabFriends')} active={false} onPress={() => setMainTab('friends')} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[s.searchWrap, { flex: 1, marginRight: 0 }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput ref={searchRef} value={query} onChangeText={setQuery} placeholder={isCloud ? t('explore.searchPlaceholderFull') : t('explore.searchPlaceholder')} placeholderTextColor={colors.textMuted} style={s.search} autoCorrect={false} autoCapitalize="none" />
          {query ? <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
        </View>
        <NotificationBell style={{ marginHorizontal: space(4) }} />
      </View>

      {!tmdbConfigured && !isCloud && <Text style={[font.muted, { padding: space(4) }]}>{t('explore.tmdbHint')}</Text>}

      {query.trim() ? (
        <View style={{ flex: 1 }}>
          {isCloud && (
            <View style={s.tabs}>
              <TabBtn label={t('explore.tabContent')} active={tab === 'content'} onPress={() => setTab('content')} />
              <TabBtn label={t('explore.tabPeople')} active={tab === 'people'} onPress={() => setTab('people')} />
            </View>
          )}

          {showPeople ? (
            searchingPeople && !people ? <ActivityIndicator style={{ marginTop: space(6) }} color={colors.accent} /> : (
              <ScrollView contentContainerStyle={{ paddingVertical: space(2) }}>
                {(people ?? []).map((u) => <PersonRow key={u.id} u={u} onPress={() => router.push(`/u/${u.handle}`)} />)}
                {people && people.length === 0 && <Text style={[font.muted, { padding: space(4) }]}>{t('explore.noPeople', { query: query.trim() })}</Text>}
              </ScrollView>
            )
          ) : (
            searching && !results ? <View style={{ paddingTop: space(4) }}><SkeletonGrid columns={numColumns} rows={3} itemWidth={itemWidth} /></View> : (
              <FlashList
                data={resultRows}
                estimatedItemSize={itemWidth * 1.5 + 40}
                keyExtractor={(row, idx) => 'r' + idx + (row[0] ? row[0].kind + row[0].id : '')}
                contentContainerStyle={{ padding: space(2), paddingBottom: space(8) }}
                ListHeaderComponent={tmdbPeople.length > 0 ? (
                  <View>
                    <Text style={[font.h1, { fontSize: 20, paddingHorizontal: space(2), marginTop: space(1), marginBottom: space(2) }]}>{t('explore.secPeople')}</Text>
                    <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(2), paddingBottom: space(2) }}>
                      {tmdbPeople.map((p) => (
                        <Pressable key={p.id} style={{ width: 84, alignItems: 'center' }} onPress={() => router.push(`/person/${p.id}`)}>
                          <Image source={{ uri: tmdbImg(p.profile, 'w185')! }} style={s.personFace} contentFit="cover" transition={120} />
                          <Text style={[font.body, { fontSize: 12, marginTop: 4, textAlign: 'center' }]} numberOfLines={1}>{p.name}</Text>
                        </Pressable>
                      ))}
                    </DragScrollView>
                  </View>
                ) : null}
                ListEmptyComponent={results && results.length === 0 ? <Text style={[font.muted, { padding: space(4) }]}>{t('explore.noResults')}</Text> : null}
                renderItem={({ item: row }) => (
                  <View style={{ flexDirection: 'row' }}>
                    {row.map((it) => (
                      <View key={it.kind + it.id} style={{ width: itemWidth, padding: space(1.5) }}><Card {...cardProps(it)} width="100%" /></View>
                    ))}
                  </View>
                )}
              />
            )
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: space(8) }}>
          {genres.length > 0 && (
            <DragScrollView contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4), paddingTop: space(2) }}>
              <Pressable onPress={() => { setSelGenre(null); setSelPlatform(null); }} style={[s.gChip, !selGenre && !selPlatform && s.gChipOn]}>
                <Text style={[s.gChipText, !selGenre && !selPlatform && s.gChipTextOn]}>{t('explore.genresAll')}</Text>
              </Pressable>
              {genres.map((g) => (
                <Pressable key={g.name} onPress={() => { setSelPlatform(null); setSelGenre(selGenre === g.name ? null : g.name); }} style={[s.gChip, selGenre === g.name && s.gChipOn]}>
                  <Text style={[s.gChipText, selGenre === g.name && s.gChipTextOn]}>{g.name}</Text>
                </Pressable>
              ))}
            </DragScrollView>
          )}
          {platforms.length > 0 && (
            <DragScrollView contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4), paddingTop: space(2) }}>
              {platforms.map((p) => (
                <Pressable key={p.id} onPress={() => { setSelGenre(null); setSelPlatform(selPlatform === p.id ? null : p.id); }} style={[s.pChip, selPlatform === p.id && s.gChipOn]}>
                  <Ionicons name="hardware-chip-outline" size={13} color={selPlatform === p.id ? colors.accentInk : colors.textMuted} />
                  <Text style={[s.gChipText, selPlatform === p.id && s.gChipTextOn]}>{p.name}</Text>
                </Pressable>
              ))}
            </DragScrollView>
          )}
          {selGenre ? (
            genreSections == null ? <View style={{ marginTop: space(6) }}><SkeletonRow /></View> :
            genreSections.map((sec) => (
              <View key={sec.titleKey} style={{ marginTop: space(4) }}>
                <Text style={[font.h1, { fontSize: 20, paddingHorizontal: space(4), marginBottom: space(2) }]}>{t(sec.titleKey, { genre: sec.genre })}</Text>
                <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
                  {sec.items.map((it) => <Card key={it.kind + it.id} {...cardProps(it)} />)}
                </DragScrollView>
              </View>
            ))
          ) : null}
          {selPlatform != null ? (
            platformSections == null ? <View style={{ marginTop: space(6) }}><SkeletonRow /></View> :
            platformSections.length ? (
              <View style={{ marginTop: space(4) }}>
                <Text style={[font.h1, { fontSize: 20, paddingHorizontal: space(4), marginBottom: space(2) }]}>{platforms.find((p) => p.id === selPlatform)?.name}</Text>
                <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
                  {platformSections.map((it) => <Card key={it.kind + it.id} {...cardProps(it)} />)}
                </DragScrollView>
              </View>
            ) : null
          ) : null}
          {!selGenre && selPlatform == null && sections.map((sec) => (
            <View key={sec.titleKey} style={{ marginTop: space(4) }}>
              <Text style={[font.h1, { fontSize: 20, paddingHorizontal: space(4), marginBottom: space(2) }]}>{t(sec.titleKey)}</Text>
              <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
                {sec.items.map((it) => <Card key={it.kind + it.id} {...cardProps(it)} />)}
              </DragScrollView>
            </View>
          ))}
          {!selGenre && selPlatform == null && !sections.length && tmdbConfigured && (
            <View style={{ gap: space(6), marginTop: space(6) }}>
              <SkeletonRow /><SkeletonRow /><SkeletonRow />
            </View>
          )}
        </ScrollView>
      )}

      {/* Long-press on + : add the game straight into a chosen state. */}
      {addFor && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setAddFor(null)}>
          <Pressable style={s.addOverlay} onPress={() => setAddFor(null)}>
            <Pressable style={s.addSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={[font.h2, { marginBottom: space(3) }]} numberOfLines={2}>{t('explore.addAs', { title: addFor.title })}</Text>
              {([
                { st: 'backlog', key: 'gameDetail.stBacklog', icon: 'time-outline' },
                { st: 'watching', key: 'gameDetail.stPlaying', icon: 'game-controller-outline' },
                { st: 'archived', key: 'gameDetail.stCompleted', icon: 'trophy-outline' },
              ] as const).map(({ st, key, icon }) => (
                <Pressable key={st} style={s.addRow} onPress={() => { const it = addFor; setAddFor(null); if (it) toggleAdd(it, st); }}>
                  <Ionicons name={icon} size={20} color={colors.text} />
                  <Text style={[font.body, { fontWeight: '700' }]}>{t(key)}</Text>
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: space(4), paddingHorizontal: space(3), height: 44, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.text, fontSize: 15, outlineStyle: 'none' } as any,
  poster: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  add: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF66' },
  addOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: space(2) },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: space(3), gap: space(2) },
  tabInd: { height: 3, width: '60%', borderRadius: 2 },
  personRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(3) },
  personFace: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceAlt },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  gChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.surface },
  gChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  gChipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  pChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface },
  gChipTextOn: { color: colors.accentInk },
  addOverlay: { flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: space(4) },
  addSheet: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4) },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3), borderTopWidth: 1, borderTopColor: colors.border },
});
