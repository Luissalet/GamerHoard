import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { useQuery } from '../src/useData';
import { posterFor } from '../src/img';
import type { RecentRow } from '../src/db';
import { localHm, localDay } from '../src/dates';

// Your watch history: imported TV Time events + everything you mark in Watch Hoard.
export default function HistoryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { loading, data: recent } = useQuery((d) => d.getRecent(200));

  const rows: (RecentRow | { header: string })[] = [];
  let lastDay = '';
  for (const r of recent ?? []) {
    const day = localDay(r.watched_at);
    if (day && day !== lastDay) { rows.push({ header: day }); lastDay = day; }
    rows.push(r);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('history.title')}</Text><View style={{ width: 26 }} />
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (rows.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="time-outline" size={40} color={colors.textMuted} />
          <Text style={[font.muted, { marginTop: space(2) }]}>{t('history.empty')}</Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          estimatedItemSize={64}
          getItemType={(i: any) => (i.header ? 'h' : 'r')}
          keyExtractor={(i: any, idx) => (i.header ? 'h' + i.header : 'r' + (i.id ?? idx))}
          contentContainerStyle={{ padding: space(3), paddingBottom: space(8) }}
          renderItem={({ item }: any) =>
            item.header ? (
              <Text style={s.day}>{item.header}</Text>
            ) : (() => {
              const target = item.show_tvdb ? `/show/${item.show_tvdb}` : null;
              return (
                <Pressable style={s.row} disabled={!target} onPress={() => target && router.push(target as any)}>
                  <Image source={{ uri: item.poster ?? posterFor(item.title) }} style={s.poster} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: space(3) }}>
                    <Text style={font.h2} numberOfLines={1}>{item.title}</Text>
                    <Text style={font.muted}>
                      {item.kind === 'episode' ? t('history.dlc') : t('history.game')}
                      {item.watched_at ? `  ·  ${localHm(String(item.watched_at))}` : ''}
                    </Text>
                  </View>
                  {target ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
                </Pressable>
              );
            })()
          }
        />
      ))}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(3) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  day: { ...font.muted, fontWeight: '800', letterSpacing: 1, fontSize: 11, textTransform: 'uppercase', marginTop: space(4), marginBottom: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(2.5), marginBottom: space(2) },
  poster: { width: 64, height: 36, borderRadius: 6, backgroundColor: colors.surfaceAlt },
});
