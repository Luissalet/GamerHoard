import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { useQuery } from '../src/useData';
import type { BadgeRow } from '../src/db';

function Group({ title, items }: { title: string; items: BadgeRow[] }) {
  if (!items.length) return null;
  return (
    <View style={{ marginTop: space(4) }}>
      <Text style={[font.h2, { paddingHorizontal: space(4), marginBottom: space(2) }]}>{title} · {items.length}</Text>
      <View style={s.grid}>
        {items.map((b) => (
          <View key={b.id} style={s.badge}>
            <View style={s.coin}><Ionicons name="ribbon" size={22} color={colors.accent} /></View>
            <Text style={s.label} numberOfLines={2}>{b.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
export default function BadgesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { loading, data: badges } = useQuery((d) => d.getBadges());
  const discovery = (badges ?? []).filter((b) => b.grp === 'discovery');
  const watching = (badges ?? []).filter((b) => b.grp === 'watching');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('badges.title')}</Text><View style={{ width: 26 }} />
      </View>
      {loading ? <View style={s.center}><ActivityIndicator color={colors.accent} /></View> : (
        <ScrollView contentContainerStyle={{ paddingBottom: space(10) }}>
          <Text style={[font.muted, { paddingHorizontal: space(4), paddingTop: space(3) }]}>{t('badges.tvTimeNote')}</Text>
          <Group title={t('badges.discovery')} items={discovery} />
          <Group title={t('badges.watching')} items={watching} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space(2) },
  badge: { width: '33.33%', alignItems: 'center', padding: space(2) },
  coin: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  label: { ...font.muted, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
