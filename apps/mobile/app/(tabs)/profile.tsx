import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, space, font, radius } from '../../src/theme';
import { SectionHeader, StatCard } from '../../src/components';
import { DragScrollView } from '../../src/DragScrollView';
import { useQuery } from '../../src/useData';
import { posterFor } from '../../src/img';
import { categoryOf } from '../../src/categories';
import type { ShowRow } from '../../src/db';

function Count({ n, label }: { n: number; label: string }) {
  return <View style={{ flex: 1, alignItems: 'center' }}><Text style={font.h1}>{n}</Text><Text style={[font.muted, { textAlign: 'center' }]}>{label}</Text></View>;
}
function Thumb({ uri, title, onPress, width = 150 }: { uri: string; title: string; onPress: () => void; width?: number }) {
  return (
    <Pressable style={{ width }} onPress={onPress}>
      <Image source={{ uri }} style={{ width, aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }} contentFit="cover" transition={150} />
      <Text style={[font.muted, { marginTop: 4 }]} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { loading, data: d } = useQuery(async (src) => ({
    shows: await src.getShows(), recent: await src.getRecent(12), favs: await src.getFavorites(20),
  }), []);
  if (loading || !d) return <SafeAreaView style={s.center}><ActivityIndicator color={colors.accent} /></SafeAreaView>;

  const games: ShowRow[] = d.shows ?? [];
  const by = (c: string) => games.filter((g) => categoryOf(g) === c).length;
  const playing = games.filter((g) => categoryOf(g) === 'watching');
  const favs = d.favs ?? [];
  const stats = {
    total: games.length, playing: playing.length, completed: by('finished'), backlog: by('not_started'),
    paused: by('paused'), dropped: by('dropped'), favorites: games.filter((g) => g.is_favorite).length,
    dlcs: games.reduce((n, g) => n + (g.watched_episodes || 0), 0),
    hours: Math.round(games.reduce((n, g) => n + (g.playtime_minutes || 0), 0) / 60),
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: space(10) }}>
        <View style={s.headerRow}>
          <View style={s.avatar}>
            <Ionicons name="game-controller" size={28} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h1}>{t('profile.you')}</Text>
          </View>
          <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={s.iconBtn}><Ionicons name="settings-outline" size={20} color={colors.text} /></Pressable>
        </View>

        <View style={s.countRow}>
          <Count n={stats.total} label={t('profile.games')} />
          <Count n={stats.hours} label={t('profile.hours')} />
          <Count n={stats.completed} label={t('profile.completed')} />
          <Count n={stats.favorites} label={t('profile.favorites')} />
        </View>

        {stats.total === 0 ? (
          <>
            <Pressable style={s.cta} onPress={() => router.push('/import')}>
              <Ionicons name="logo-steam" size={22} color={colors.accentInk} />
              <View style={{ flex: 1, marginLeft: space(3) }}>
                <Text style={{ color: colors.accentInk, fontWeight: '800', fontSize: 15 }}>{t('steam.title')}</Text>
                <Text style={{ color: colors.accentInk, opacity: 0.8, fontSize: 12, marginTop: 2 }}>{t('steam.intro')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.accentInk} />
            </Pressable>
            <Pressable style={s.ctaAlt} onPress={() => router.push('/explore')}>
              <Ionicons name="compass-outline" size={22} color={colors.text} />
              <Text style={{ flex: 1, marginLeft: space(3), color: colors.text, fontWeight: '800', fontSize: 15 }}>{t('games.goExplore')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </>
        ) : null}

        <SectionHeader title={t('profile.statistics')} onPress={() => router.push('/stats')} />
        <View style={s.statGrid}>
          <StatCard icon="game-controller-outline" label={t('profile.playing')}><Text style={font.display}>{stats.playing}</Text></StatCard>
          <StatCard icon="time-outline" label={t('profile.backlog')}><Text style={font.display}>{stats.backlog}</Text></StatCard>
        </View>
        <View style={[s.statGrid, { marginTop: space(3) }]}>
          <StatCard icon="pause-outline" label={t('profile.paused')}><Text style={font.display}>{stats.paused}</Text></StatCard>
          <StatCard icon="cube-outline" label={t('profile.dlcsOwned')}><Text style={font.display}>{stats.dlcs}</Text></StatCard>
        </View>
        <View style={[s.statGrid, { marginTop: space(3) }]}>
          <StatCard icon="close-circle-outline" label={t('categories.dropped')}><Text style={font.display}>{stats.dropped}</Text></StatCard>
        </View>

        {(d.recent?.length ?? 0) > 0 && (
          <>
            <SectionHeader title={t('profile.recentActivity')} onPress={() => router.push('/history')} />
            <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
              {(d.recent ?? []).map((r) => {
                const target = r.show_tvdb ? `/show/${r.show_tvdb}` : null;
                return (
                  <Pressable key={r.id} style={{ width: 130 }} disabled={!target} onPress={() => target && router.push(target as any)}>
                    <Image source={{ uri: r.poster ?? posterFor(r.title) }} style={s.recImg} contentFit="cover" />
                    <Text style={[font.muted, { marginTop: 4, fontSize: 11 }]} numberOfLines={1}>{r.title}</Text>
                    <Text style={[font.muted, { fontSize: 10 }]} numberOfLines={1}>{(r.watched_at ?? '').slice(0, 10)}</Text>
                  </Pressable>
                );
              })}
            </DragScrollView>
          </>
        )}

        {playing.length > 0 && (
          <>
            <SectionHeader title={t('profile.playing')} onPress={() => router.push('/')} />
            <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
              {playing.map((g) => <Thumb key={g.tvdb_id} uri={g.poster ?? posterFor(g.tvdb_id)} title={g.title} onPress={() => router.push(`/show/${g.tvdb_id}`)} />)}
            </DragScrollView>
          </>
        )}

        {favs.length > 0 && (
          <>
            <SectionHeader title={t('profile.favoriteGames')} icon="heart" iconColor={colors.danger} onPress={() => router.push({ pathname: '/', params: { fav: '1', ts: String(Date.now()) } })} />
            <DragScrollView contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
              {favs.map((g) => <Thumb key={g.tvdb_id} uri={g.poster ?? posterFor(g.tvdb_id)} title={g.title} onPress={() => router.push(`/show/${g.tvdb_id}`)} />)}
            </DragScrollView>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4) },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  countRow: { flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: space(4), borderRadius: radius.md, paddingVertical: space(3), borderWidth: 1, borderColor: colors.border },
  cta: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, marginHorizontal: space(4), marginTop: space(3), borderRadius: radius.md, padding: space(4) },
  ctaAlt: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginHorizontal: space(4), marginTop: space(3), borderRadius: radius.md, padding: space(4) },
  statGrid: { flexDirection: 'row', gap: space(3), paddingHorizontal: space(4) },
  recImg: { width: 130, aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  listCard: { width: 150, backgroundColor: colors.surface, borderRadius: radius.md, padding: space(3), borderWidth: 1, borderColor: colors.border, justifyContent: 'space-between', minHeight: 84 },
});
