import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { useQuery } from '../src/useData';
import { posterFor } from '../src/img';
import { genreNameMap, parseGenres } from '../src/genres';
import { categoryOf } from '../src/categories';

const PLAT: Record<string, string> = {
  pc: 'PC', playstation5: 'PlayStation 5', playstation4: 'PlayStation 4', playstation3: 'PlayStation 3',
  'xbox-series-x': 'Xbox Series X|S', 'xbox-one': 'Xbox One', xbox360: 'Xbox 360',
  'nintendo-switch': 'Nintendo Switch', 'nintendo-switch-2': 'Switch 2', ios: 'iOS', android: 'Android',
  macos: 'macOS', linux: 'Linux',
};
const prettyPlat = (slug: string) => PLAT[slug] ?? slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const parseArr = (j?: string | null): string[] => { if (!j) return []; try { const a = JSON.parse(j); return Array.isArray(a) ? a : []; } catch { return []; } };

function Card({ children, style }: any) { return <View style={[s.card, style]}>{children}</View>; }
function Big({ label, value }: { label: string; value: string | number }) {
  return <View style={{ flex: 1 }}><Text style={font.display}>{typeof value === 'number' ? value.toLocaleString() : value}</Text><Text style={font.muted}>{label}</Text></View>;
}
function Mini({ label, value }: { label: string; value: number }) {
  return <View style={s.mini}><Text style={font.h1}>{(value ?? 0).toLocaleString()}</Text><Text style={[font.muted, { fontSize: 12, textAlign: 'center' }]}>{label}</Text></View>;
}
function Bars({ rows, max }: { rows: [string, number][]; max: number }) {
  return (
    <Card style={{ gap: space(2) }}>
      {rows.map(([label, count]) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[font.muted, { width: 120 }]} numberOfLines={1}>{label}</Text>
          <View style={s.barTrack}><View style={[s.barFill, { width: `${(count / max) * 100}%` }]} /></View>
          <Text style={[font.muted, { width: 40, textAlign: 'right' }]}>{count.toLocaleString()}</Text>
        </View>
      ))}
    </Card>
  );
}

export default function StatsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { loading, data: shows } = useQuery((d) => d.getShows());
  const [genreNames, setGenreNames] = React.useState<Record<number, string>>({});
  React.useEffect(() => { genreNameMap(i18n.language).then(setGenreNames); }, [i18n.language]);

  if (loading || !shows) return <SafeAreaView style={s.center}><ActivityIndicator color={colors.accent} /></SafeAreaView>;

  const games = shows;
  const cnt = (c: string) => games.filter((g) => categoryOf(g) === c).length;
  const total = games.length;
  const playing = cnt('watching'), backlog = cnt('not_started'), paused = cnt('paused'), completed = cnt('finished');
  const favorites = games.filter((g) => g.is_favorite).length;
  const dlcs = games.reduce((n, g) => n + (g.watched_episodes || 0), 0);
  const hours = Math.round(games.reduce((n, g) => n + (g.playtime_minutes || 0), 0) / 60);
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  const mostDlc = [...games].filter((g) => (g.watched_episodes || 0) > 0).sort((a, b) => b.watched_episodes - a.watched_episodes).slice(0, 10);

  const rated = games.filter((g) => (g.user_rating ?? 0) > 0);
  const avgRating = rated.length ? rated.reduce((n, g) => n + (g.user_rating || 0), 0) / rated.length : 0;
  const topRated = [...rated].sort((a, b) => (b.user_rating || 0) - (a.user_rating || 0)).slice(0, 10);

  const genreCounts = new Map<number, number>();
  for (const g of games) for (const id of parseGenres(g.genres)) genreCounts.set(id, (genreCounts.get(id) ?? 0) + 1);
  const topGenres = [...genreCounts.entries()].filter(([id]) => genreNames[id]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, c]) => [genreNames[id], c] as [string, number]);
  const maxGenre = Math.max(1, ...topGenres.map((x) => x[1]));

  const platCounts = new Map<string, number>();
  for (const g of games) for (const slug of parseArr(g.owned_platforms)) platCounts.set(slug, (platCounts.get(slug) ?? 0) + 1);
  const topPlatforms = [...platCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([slug, c]) => [prettyPlat(slug), c] as [string, number]);
  const maxPlat = Math.max(1, ...topPlatforms.map((x) => x[1]));

  const studioCounts = new Map<string, number>();
  for (const g of games) if (g.network) studioCounts.set(g.network, (studioCounts.get(g.network) ?? 0) + 1);
  const topStudios = [...studioCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxStudio = Math.max(1, ...topStudios.map((x) => x[1]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('stats.title')}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(10), gap: space(3) }}>
        <Card style={{ flexDirection: 'row' }}>
          <Big label={t('stats.games')} value={total} />
          <Big label={t('stats.completionRate')} value={`${completionRate}%`} />
        </Card>
        <Card style={{ flexDirection: 'row' }}>
          <Big label={t('stats.hours')} value={hours} />
          <Big label={t('stats.dlcs')} value={dlcs} />
        </Card>
        {rated.length > 0 && (
          <Card style={{ flexDirection: 'row' }}>
            <Big label={t('stats.avgRating')} value={`★ ${avgRating.toFixed(1)}/10`} />
            <Big label={t('stats.rated')} value={rated.length} />
          </Card>
        )}

        <Text style={[font.h2, { marginTop: space(2) }]}>{t('stats.byStatus')}</Text>
        <Card style={{ flexDirection: 'row' }}>
          <Mini label={t('stats.playing')} value={playing} />
          <Mini label={t('stats.backlog')} value={backlog} />
          <Mini label={t('stats.paused')} value={paused} />
          <Mini label={t('stats.completed')} value={completed} />
        </Card>
        <Card style={{ flexDirection: 'row' }}>
          <Mini label={t('stats.favorites')} value={favorites} />
          <Mini label={t('stats.dlcs')} value={dlcs} />
        </Card>

        {topRated.length > 0 && (
          <>
            <Text style={[font.h2, { marginTop: space(2) }]}>{t('stats.topRated')}</Text>
            <Card style={{ paddingVertical: space(1) }}>
              {topRated.map((g, i) => (
                <View key={g.tvdb_id} style={s.listRow}>
                  <Text style={s.rank}>{i + 1}</Text>
                  <Image source={{ uri: g.poster ?? posterFor(g.tvdb_id) }} style={s.thumb} contentFit="cover" />
                  <Text style={[font.body, { flex: 1 }]} numberOfLines={1}>{g.title}</Text>
                  <Text style={[font.muted, { color: colors.accent, fontWeight: '700' }]}>★ {g.user_rating}/10</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {mostDlc.length > 0 && (
          <>
            <Text style={[font.h2, { marginTop: space(2) }]}>{t('stats.mostDlc')}</Text>
            <Card style={{ paddingVertical: space(1) }}>
              {mostDlc.map((g, i) => (
                <View key={g.tvdb_id} style={s.listRow}>
                  <Text style={s.rank}>{i + 1}</Text>
                  <Image source={{ uri: g.poster ?? posterFor(g.tvdb_id) }} style={s.thumb} contentFit="cover" />
                  <Text style={[font.body, { flex: 1 }]} numberOfLines={1}>{g.title}</Text>
                  <Text style={[font.muted, { color: colors.accent, fontWeight: '700' }]}>{t('stats.dlcUnit', { n: g.watched_episodes })}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {topGenres.length > 0 && <><Text style={[font.h2, { marginTop: space(2) }]}>{t('stats.topGenres')}</Text><Bars rows={topGenres} max={maxGenre} /></>}
        {topPlatforms.length > 0 && <><Text style={[font.h2, { marginTop: space(2) }]}>{t('stats.topPlatforms')}</Text><Bars rows={topPlatforms} max={maxPlat} /></>}
        {topStudios.length > 0 && <><Text style={[font.h2, { marginTop: space(2) }]}>{t('stats.topStudios')}</Text><Bars rows={topStudios} max={maxStudio} /></>}

        {total === 0 && <Text style={[font.muted, { textAlign: 'center', marginTop: space(6) }]}>{t('games.emptyLibrary')}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.border },
  mini: { flex: 1, alignItems: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(2), gap: space(3) },
  rank: { ...font.muted, width: 18, textAlign: 'center' },
  thumb: { width: 56, height: 32, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  barTrack: { flex: 1, height: 10, backgroundColor: colors.surfaceAlt, borderRadius: 5, marginHorizontal: space(2), overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: colors.accent, borderRadius: 5 },
});
