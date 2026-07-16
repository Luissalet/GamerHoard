import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, space, font, radius } from '../src/theme';
import { useQuery } from '../src/useData';
import { posterFor } from '../src/img';
import type { MovieRow } from '../src/db';

// Normalize a title so a TV Time comment's `movie_name` can be matched to an imported movie
// (accent- and punctuation-insensitive). Used only to attach a poster + link for context.
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function fmtDate(s: string | null, lang: string) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang || 'en', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Archive of the comments the user wrote on TV Time. This is intentionally SEPARATE from the
// movie's live comment/review surface — it only lets them re-read what they once wrote.
export default function TvTimeCommentsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { loading, data: d } = useQuery(async (src) => ({
    reviews: await src.getReviews(500),
    movies: await src.getMovies(5000),
  }));

  const movieByTitle = new Map<string, MovieRow>();
  for (const m of d?.movies ?? []) { const k = norm(m.title); if (k && !movieByTitle.has(k)) movieByTitle.set(k, m); }
  const reviews = d?.reviews ?? [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.head}>
        <Pressable onPress={back} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('oldComments.title')}</Text><View style={{ width: 26 }} />
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(10), gap: space(3) }}>
          <Text style={font.muted}>{t('oldComments.intro')}</Text>
          {reviews.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
              <Text style={[font.muted, { marginTop: space(2), textAlign: 'center' }]}>{t('oldComments.empty')}</Text>
            </View>
          ) : (
            reviews.map((r) => {
              const isMovie = r.entity_type === 'movie';
              const match = isMovie && r.title ? movieByTitle.get(norm(r.title)) : undefined;
              const uri = match?.poster ?? posterFor((r.title || 'comment') + (match?.year ?? ''));
              const go = match?.uuid ? () => router.push(`/movie/${match.uuid}`) : undefined;
              const Wrap: any = go ? Pressable : View;
              return (
                <Wrap key={r.id} style={s.card} onPress={go}>
                  <Image source={{ uri }} style={s.poster} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: space(3) }}>
                    {r.title ? <Text style={font.h2} numberOfLines={1}>{r.title}</Text> : null}
                    <Text style={[font.body, { marginTop: 2 }]}>{r.text}</Text>
                    <View style={s.meta}>
                      {r.created_at ? <Text style={s.metaText}>{fmtDate(r.created_at, i18n.language)}</Text> : null}
                      {r.is_spoiler ? <View style={s.chip}><Text style={s.chipText}>{t('oldComments.spoiler')}</Text></View> : null}
                      {r.like_count > 0 ? (
                        <Text style={s.metaText}>♥ {t(r.like_count === 1 ? 'oldComments.likes_one' : 'oldComments.likes_other', { n: r.like_count })}</Text>
                      ) : null}
                    </View>
                  </View>
                  {go ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
                </Wrap>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: space(10) },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(3) },
  poster: { width: 54, height: 81, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(2), flexWrap: 'wrap' },
  metaText: { ...font.muted, fontSize: 12 },
  chip: { backgroundColor: colors.danger + '22', paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.sm },
  chipText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
});
