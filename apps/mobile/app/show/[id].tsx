import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../../src/theme';
import i18n from '../../src/i18n';
import { useQuery } from '../../src/useData';
import { data, type ShowRow } from '../../src/db';
import { posterFor } from '../../src/img';
import { showDetails, movieDetails, seasonEpisodes, gameImg, type Details, type TmdbEpisode } from '../../src/rawg';
import { isSteamId, steamStoreUrl } from '../../src/steam';
import { Genres, Meta, WherePlay, PlatformOwnership, StudioRow, SagaRow, Trailer, AlsoPlayed, Screenshots, Scores, PosterPickerModal, RatingStars, NotesCard } from '../../src/detail';
import { ListPickerModal } from '../../src/ListPickerModal';
import { ShareButton } from '../../src/ShareButton';
import { Fireworks } from '../../src/Fireworks';
import { progress, categoryOf, type GameState } from '../../src/categories';

const addPayload = (g: ShowRow) => ({ tvdb_id: g.tvdb_id, title: g.title, poster: g.poster, tmdb_status: g.tmdb_status, total_episodes: g.total_episodes, network: g.network, last_aired_season: g.last_aired_season, last_aired_episode: g.last_aired_episode });
const virtualGame = (id: number, d: Details): ShowRow => ({
  tvdb_id: id, title: d.title ?? i18n.t('gameDetail.fallback'), state: 'backlog', is_favorite: 0, watched_episodes: 0,
  last_season: null, last_episode: null, last_watched_at: null, poster: gameImg(d.posterPath),
  tmdb_status: d.status ?? null, total_episodes: d.dlcCount ?? null, network: d.developers?.[0]?.name ?? null,
  last_aired_season: null, last_aired_episode: null, next_air_date: null, next_season: null, next_episode: null, na_checked: 0,
  owned_platforms: null, platforms: null,
});

const parseOwned = (json?: string | null): Set<string> => {
  if (!json) return new Set();
  try { const a = JSON.parse(json); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); }
};

export default function GameDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const gameId = Number(id) || 0;
  const { data: initial } = useQuery((d) => d.getShowById(gameId), [id]);
  const [game, setGame] = useState<ShowRow | null>(null);
  const [inLibrary, setInLibrary] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [det, setDet] = useState<Details | null>(null);
  const [detLoading, setDetLoading] = useState(true);
  const [tab, setTab] = useState<'info' | 'dlc'>('info');
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [dlcs, setDlcs] = useState<TmdbEpisode[] | null>(null);
  const [dlcDone, setDlcDone] = useState<Set<number>>(new Set());
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [detNonce, setDetNonce] = useState(0);

  useEffect(() => { if (initial) { setGame(initial); setInLibrary(true); setFavorite(!!initial.is_favorite); setOwned(parseOwned(initial.owned_platforms)); } }, [initial]);

  useEffect(() => {
    let alive = true;
    setDetLoading(true);
    // Steam-imported games use a synthetic id (no RAWG record), so resolve their metadata
    // by title. Native RAWG games load directly by id.
    const steam = isSteamId(gameId) || !!initial?.steam_appid;
    const load = steam ? (initial?.title ? movieDetails(initial.title) : Promise.resolve(null)) : showDetails(gameId);
    load.then((d) => {
      if (!alive) return;
      if (d && initial?.steam_appid && !(d.stores ?? []).some((x) => x.slug === 'steam')) {
        d = { ...d, stores: [...(d.stores ?? []), { id: 1, name: 'Steam', slug: 'steam', url: steamStoreUrl(initial.steam_appid) }] };
      }
      setDet(d); setDetLoading(false);
    });
    return () => { alive = false; };
  }, [gameId, detNonce, initial?.title, initial?.steam_appid]);

  useEffect(() => { if (det && !game) setGame(virtualGame(gameId, det)); }, [det]);

  // Keep the library row's metadata (DLC count, studio, platforms cache) fresh.
  useEffect(() => {
    if (!det || !initial) return;
    const meta = { tmdb_status: det.status ?? null, total_episodes: det.dlcCount ?? null, network: det.developers?.[0]?.name ?? det.publishers?.[0]?.name ?? null, last_aired_season: null, last_aired_episode: null };
    data.setShowMeta(gameId, meta);
    if (det.platforms?.length) data.setPlatforms(gameId, JSON.stringify(det.platforms.map((p) => p.slug)));
    setGame((g) => (g ? { ...g, ...meta } : g));
  }, [det, initial]);

  // Load DLC ownership/completion once the game is in the library.
  useEffect(() => {
    if (!det?.dlcCount || !initial) return;
    let alive = true;
    (async () => {
      const eps = await seasonEpisodes(gameId, 1);
      const w = await data.getWatchedEpisodes(gameId);
      if (!alive) return;
      setDlcs(eps);
      setDlcDone(new Set(w.filter((x) => x.season === 1).map((x) => x.episode)));
    })();
    return () => { alive = false; };
  }, [det?.dlcCount, initial]);

  const ensureInLibrary = useCallback(async () => {
    if (inLibrary || !game) return;
    await data.addShow(addPayload(game)); setInLibrary(true);
  }, [inLibrary, game]);

  const toggleLibrary = useCallback(async () => {
    if (!game) return;
    if (inLibrary) { await data.removeShow(game.tvdb_id); setInLibrary(false); setFavorite(false); setOwned(new Set()); }
    else { await data.addShow(addPayload(game)); setInLibrary(true); }
  }, [inLibrary, game]);

  const toggleFavorite = useCallback(async () => {
    if (!game) return;
    const next = !favorite; setFavorite(next);
    await ensureInLibrary();
    await data.setShowFavorite(game.tvdb_id, next);
    setGame((g) => (g ? { ...g, is_favorite: next ? 1 : 0 } : g));
  }, [favorite, game, ensureInLibrary]);

  const setState = useCallback(async (st: GameState) => {
    if (!game) return;
    await ensureInLibrary();
    await data.setShowState(game.tvdb_id, st);
    setGame((g) => (g ? { ...g, state: st } : g));
    if (st === 'archived') setCelebrate(t('gameDetail.completed'));
  }, [game, ensureInLibrary, t]);

  const setRating = useCallback(async (v: number | null) => {
    if (!game) return;
    await ensureInLibrary();
    await data.setShowRating(game.tvdb_id, v);
    setGame((g) => (g ? { ...g, user_rating: v } : g));
  }, [game, ensureInLibrary]);

  const saveNotes = useCallback(async (v: string | null) => {
    if (!game) return;
    await ensureInLibrary();
    await data.setShowNotes(game.tvdb_id, v);
    setGame((g) => (g ? { ...g, notes: v } : g));
  }, [game, ensureInLibrary]);

  const toggleOwnedPlatform = useCallback(async (slug: string) => {
    if (!game) return;
    await ensureInLibrary();
    const next = new Set(owned);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    setOwned(next);
    const json = next.size ? JSON.stringify([...next]) : null;
    await data.setOwnedPlatforms(game.tvdb_id, json);
    setGame((g) => (g ? { ...g, owned_platforms: json } : g));
  }, [owned, game, ensureInLibrary]);

  const toggleDlc = useCallback(async (num: number) => {
    if (!game) return;
    await ensureInLibrary();
    const on = !dlcDone.has(num);
    const next = new Set(dlcDone); on ? next.add(num) : next.delete(num);
    setDlcDone(next);
    await data.setEpisodeWatched(game.tvdb_id, 1, num, on);
    setGame((g) => (g ? { ...g, watched_episodes: next.size } : g));
    if (on && det?.dlcCount && next.size >= det.dlcCount) setCelebrate(t('gameDetail.allDlc'));
  }, [dlcDone, game, det, ensureInLibrary, t]);

  const pickCover = useCallback(async (url: string) => {
    if (!game) return;
    await ensureInLibrary();
    await data.setShowPoster(game.tvdb_id, url);
    setGame((g) => (g ? { ...g, poster: url } : g));
  }, [game, ensureInLibrary]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const pr = useMemo(() => (game ? progress(game) : { frac: 0, color: 'none' as const }), [game]);
  if (!game) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
  const prColor = ({ watching: colors.accent, up_to_date: colors.success, finished: colors.purple, none: colors.surfaceAlt } as const)[pr.color];
  const cover = game.poster ?? gameImg(det?.posterPath) ?? posterFor(game.tvdb_id);
  const hero = gameImg(det?.backdrop) ?? cover;
  const hasDlc = (det?.dlcCount ?? 0) > 0;
  const cat = categoryOf(game);

  const STATES: { st: GameState; key: string }[] = [
    { st: 'backlog', key: 'gameDetail.stBacklog' },
    { st: 'watching', key: 'gameDetail.stPlaying' },
    { st: 'stopped', key: 'gameDetail.stPaused' },
    { st: 'archived', key: 'gameDetail.stCompleted' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={{ uri: hero }} style={s.hero} contentFit="cover" blurRadius={det?.backdrop ? 0 : 3} />
      <View style={s.fade} />
      <View style={{ flex: 1, marginTop: 230 }}>
        <View style={s.headerRow}>
          <Pressable onPress={() => setPickerOpen(true)}>
            <Image source={{ uri: cover }} style={s.cover} contentFit="cover" />
            <View style={s.coverEdit}><Ionicons name="brush" size={12} color={colors.text} /></View>
          </Pressable>
          <View style={{ flex: 1, marginLeft: space(3), justifyContent: 'flex-end' }}>
            <Text style={font.display} numberOfLines={3}>{game.title}</Text>
            <Meta det={det} />
            {game.playtime_minutes ? <Text style={{ color: colors.accent, fontWeight: '700', marginTop: 2 }}>{t('gameDetail.yourHours', { h: Math.round((game.playtime_minutes || 0) / 60) })}</Text> : null}
            <Text style={[font.muted, { marginTop: 2 }]}>{inLibrary ? t('categories.' + cat) : t('gameDetail.notInLibrary')}</Text>
          </View>
        </View>
        <View style={s.headerBarTrack}><View style={{ height: 5, width: `${Math.max(pr.frac * 100, pr.color === 'none' ? 0 : 2)}%`, backgroundColor: prColor }} /></View>

        <View style={s.actionRow}>
          <Pressable style={[s.lib, { flex: 1, backgroundColor: inLibrary ? colors.surfaceAlt : colors.accent }]} onPress={toggleLibrary}>
            <Ionicons name={inLibrary ? 'checkmark-circle' : 'add-circle'} size={20} color={inLibrary ? colors.success : colors.accentInk} />
            <Text style={[s.libText, { color: inLibrary ? colors.text : colors.accentInk }]}>  {inLibrary ? t('gameDetail.inLibrary') : t('gameDetail.addToLibrary')}</Text>
          </Pressable>
          <Pressable style={[s.iconBtn, { borderColor: favorite ? colors.danger : colors.border }]} onPress={toggleFavorite} hitSlop={6}>
            <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={22} color={favorite ? colors.danger : colors.text} />
          </Pressable>
          <Pressable style={[s.iconBtn, { borderColor: colors.border }]} onPress={() => setListOpen(true)} hitSlop={6}>
            <Ionicons name="list" size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Always visible: tapping a state adds the game to the library in that state. */}
        <View style={s.stateRow}>
          {STATES.map(({ st, key }) => {
            const on = inLibrary && game.state === st;
            return (
              <Pressable key={st} style={[s.stateChip, on && s.stateChipOn]} onPress={() => setState(st)}>
                <Text style={{ color: on ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 12 }}>{t(key)}</Text>
              </Pressable>
            );
          })}
        </View>

        <RatingStars value={game.user_rating ?? null} onChange={setRating} />

        <View style={s.tabs}>
          <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setTab('info')}><Text style={[s.tab, tab === 'info' && s.tabActive]}>{t('gameDetail.info')}</Text></Pressable>
          {hasDlc && <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setTab('dlc')}><Text style={[s.tab, tab === 'dlc' && s.tabActive]}>{t('gameDetail.dlc')} ({det?.dlcCount})</Text></Pressable>}
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: space(10) }}>
          {tab === 'info' ? (
            <>
              <WherePlay stores={det?.stores} />
              <PlatformOwnership platforms={det?.platforms} owned={owned} onToggle={toggleOwnedPlatform} />
              <Genres genres={det?.genres} />
              {det?.overview ? <Text style={s.overview}>{det.overview}</Text> : detLoading ? <ActivityIndicator style={{ marginTop: space(4) }} color={colors.textMuted} /> : !det ? (
                <Pressable style={s.retryRow} onPress={() => setDetNonce((n) => n + 1)}>
                  <Ionicons name="refresh" size={16} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontWeight: '700' }}>  {t('detail.loadError')} · {t('common.retry')}</Text>
                </Pressable>
              ) : null}
              <NotesCard value={game.notes ?? null} onSave={saveNotes} />
              <StudioRow developers={det?.developers} publishers={det?.publishers} />
              <SagaRow gameId={det?.tmdbId} currentId={det?.tmdbId} />
              <Trailer url={det?.trailerUrl} />
              <Screenshots gameId={det?.tmdbId} />
              <AlsoPlayed items={det?.recommendations} />
              <Scores metacritic={det?.metacritic} rating={det?.rating} title={game.title} website={det?.website} />
            </>
          ) : (
            <View style={{ paddingTop: space(3) }}>
              <Text style={[font.muted, { paddingHorizontal: space(4), marginBottom: space(2) }]}>{t('gameDetail.dlcHint')}</Text>
              {dlcs == null ? <ActivityIndicator color={colors.accent} /> : dlcs.map((d) => {
                const on = dlcDone.has(d.number);
                return (
                  <Pressable key={d.number} style={s.dlcRow} onPress={() => toggleDlc(d.number)}>
                    <Image source={{ uri: gameImg(d.still) ?? cover }} style={s.dlcShot} contentFit="cover" />
                    <View style={{ flex: 1, marginHorizontal: space(3) }}>
                      <Text style={font.h2} numberOfLines={2}>{d.name}</Text>
                      {d.air ? <Text style={font.muted}>{d.air.slice(0, 4)}</Text> : null}
                    </View>
                    <View style={[s.check, { backgroundColor: on ? colors.success : 'transparent', borderColor: on ? colors.success : colors.textMuted }]}>
                      <Ionicons name="checkmark" size={18} color={on ? colors.accentInk : colors.textMuted} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>

      <PosterPickerModal visible={pickerOpen} tmdbId={det?.tmdbId} current={game.poster} onClose={() => setPickerOpen(false)} onPick={pickCover} />
      <ListPickerModal visible={listOpen} target={{ kind: 'series', tvdb: game.tvdb_id }} onEnsure={ensureInLibrary} onClose={() => setListOpen(false)} />
      {celebrate && <Fireworks label={celebrate} onDone={() => setCelebrate(null)} />}
      <Pressable onPress={goBack} style={[s.back, { top: insets.top + space(2) }]} hitSlop={10}><Ionicons name="chevron-down" size={26} color={colors.text} /></Pressable>
      <ShareButton title={game.title} path={`/show/${game.tvdb_id}`} top={insets.top + space(2)} />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
  fade: { position: 'absolute', top: 250, left: 0, right: 0, height: 90, backgroundColor: colors.bg, opacity: 0.65 },
  back: { position: 'absolute', left: space(3), zIndex: 30, width: 40, height: 40, borderRadius: 20, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', paddingHorizontal: space(4) },
  cover: { width: 120, height: 144, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  coverEdit: { position: 'absolute', bottom: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  headerBarTrack: { height: 5, backgroundColor: colors.surfaceAlt, marginTop: space(3) },
  actionRow: { flexDirection: 'row', alignItems: 'stretch', gap: space(2), marginHorizontal: space(4), marginTop: space(3) },
  lib: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: space(3), borderRadius: radius.pill },
  libText: { fontWeight: '800', fontSize: 15 },
  iconBtn: { width: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.5 },
  stateRow: { flexDirection: 'row', gap: space(2), marginHorizontal: space(4), marginTop: space(3) },
  stateChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stateChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: space(3) },
  tab: { ...font.h2, color: colors.textMuted, paddingVertical: space(3) },
  tabActive: { color: colors.text, borderBottomWidth: 2, borderBottomColor: colors.accent },
  overview: { ...font.body, color: colors.text, lineHeight: 22, paddingHorizontal: space(4), marginTop: space(2) },
  retryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), marginTop: space(3) },
  dlcRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(2), borderTopWidth: 1, borderTopColor: colors.border },
  dlcShot: { width: 72, height: 44, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
