import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../../src/theme';
import { companyDetails, companyTitles, tmdbImg, tmdbConfigured, type CompanyInfo, type DiscoverItem } from '../../src/tmdb';
import { useOpenTmdb } from '../../src/detail';

function TitlesRow({ title, items, onOpen, busyKey }: { title: string; items: DiscoverItem[]; onOpen: (kind: 'movie' | 'tv', id: number) => void; busyKey: string | null }) {
  if (!items.length) return null;
  return (
    <View style={{ marginTop: space(5) }}>
      <Text style={[font.h2, { paddingHorizontal: space(4), marginBottom: space(3) }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
        {items.map((it) => (
          <Pressable key={`${it.kind}:${it.id}`} style={{ width: 150 }} onPress={() => onOpen(it.kind, it.id)}>
            <Image source={{ uri: tmdbImg(it.poster, 'w342') ?? undefined }} style={s.poster} contentFit="cover" transition={120} />
            {busyKey === `tv:${it.id}` ? <View style={s.posterBusy}><ActivityIndicator color={colors.text} /></View> : null}
            <Text style={[font.muted, { marginTop: 4, color: colors.text }]} numberOfLines={1}>{it.title}</Text>
            {it.year ? <Text style={[font.muted, { fontSize: 11 }]}>{it.year}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function CompanyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { open, busyKey } = useOpenTmdb();
  const [info, setInfo] = useState<CompanyInfo | null>(null);
  const [titles, setTitles] = useState<{ movies: DiscoverItem[]; shows: DiscoverItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setInfo(null); setTitles(null);
    (async () => {
      const [ci, tl] = await Promise.all([companyDetails(Number(id) || 0), companyTitles(Number(id) || 0)]);
      if (!alive) return;
      setInfo(ci); setTitles(tl); setLoading(false);
    })();
    return () => { alive = false; };
  }, [id, nonce]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const empty = !loading && !info && !(titles && (titles.movies.length || titles.shows.length));
  const meta = [info?.headquarters, info?.country].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space(12), paddingBottom: space(10) }}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: space(10) }} />
        ) : empty ? (
          <View style={{ alignItems: 'center', marginTop: space(10), paddingHorizontal: space(4) }}>
            <Text style={font.muted}>{t('company.loadError')}</Text>
            {tmdbConfigured ? (
              <Pressable style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(3) }} onPress={() => setNonce((n) => n + 1)}>
                <Ionicons name="refresh" size={16} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '700' }}>  {t('common.retry')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', paddingHorizontal: space(4) }}>
              {info?.logo ? (
                <Image source={{ uri: tmdbImg(info.logo)! }} style={s.banner} contentFit="cover" transition={150} />
              ) : (
                <View style={[s.banner, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="business" size={40} color={colors.textMuted} /></View>
              )}
              <Text style={[font.display, { marginTop: space(3), textAlign: 'center' }]}>{info?.name ?? ''}</Text>
              {meta ? <Text style={[font.muted, { marginTop: 4, textAlign: 'center' }]}>{meta}</Text> : null}
            </View>
            <TitlesRow title={t('company.games')} items={titles?.shows ?? []} onOpen={open} busyKey={busyKey} />
          </>
        )}
      </ScrollView>
      <Pressable onPress={goBack} style={[s.back, { top: insets.top + space(2) }]} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  back: { position: 'absolute', left: space(3), zIndex: 30, width: 40, height: 40, borderRadius: 20, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center' },
  banner: { width: 240, height: 135, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  poster: { width: 150, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  posterBusy: { position: 'absolute', top: 0, left: 0, right: 0, height: 84, borderRadius: radius.md, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center' },
});
