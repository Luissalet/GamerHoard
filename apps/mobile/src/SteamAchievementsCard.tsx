import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { data, type SteamAchievements } from './db';
import { useQuery } from './useData';
import { colors, space, font, radius } from './theme';

const PAGE_SIZE = 20;
type Filter = 'all' | 'unlocked' | 'locked';

export function SteamAchievementsCard({ gameId }: { gameId: number }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([gameId, query, filter, offset, retry]);
  const response = useQuery(async (source): Promise<{ key: string; result: SteamAchievements | null; error: string | null }> => {
    try {
      const result = source.getAchievements ? await source.getAchievements(gameId, {
        query, offset, limit: PAGE_SIZE, unlocked: filter === 'all' ? undefined : filter === 'unlocked',
      }) : null;
      return { key, result, error: null };
    } catch (error) { return { key, result: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [key]);
  const current = response.data?.key === key ? response.data : undefined;
  const result = current?.result;
  useEffect(() => { if (result && offset > 0 && offset >= result.total) setOffset(0); }, [result, offset]);
  if (!data.getAchievements) return null;
  const date = (value: string) => new Date(value).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const clear = () => { setQuery(''); setFilter('all'); setOffset(0); };

  return <View style={s.card} testID="steam-achievements-card">
    <Text style={font.h2}>{t('achievements.title')}</Text>
    <Text style={font.muted}>{t('achievements.saved')}</Text>
    {result?.syncedAt && <Text style={font.muted}>{t('achievements.snapshot', { date: date(result.syncedAt) })}</Text>}
    {result?.summary && <View style={s.summary}>
      <Text style={[font.body, { color: colors.success }]}>{t('achievements.progress', result.summary)}</Text>
      <View style={s.track} accessibilityRole="progressbar" accessibilityLabel={t('achievements.title')}
        accessibilityValue={{ min: 0, max: result.summary.total, now: result.summary.unlocked }}>
        <View style={[s.fill, { width: `${result.summary.total ? result.summary.unlocked / result.summary.total * 100 : 0}%` }]} />
      </View>
    </View>}
    <TextInput style={s.search} value={query} placeholder={t('achievements.search')} accessibilityLabel={t('achievements.search')}
      placeholderTextColor={colors.textMuted} onChangeText={(value) => { setQuery(value); setOffset(0); }} />
    <View style={s.controls}>
      {(['all', 'unlocked', 'locked'] as Filter[]).map((value) => <Pressable key={value} accessibilityRole="button"
        accessibilityState={{ selected: filter === value }} style={[s.button, filter === value && s.active]}
        onPress={() => { setFilter(value); setOffset(0); }}>
        <Text style={[font.muted, filter === value && s.activeText]}>{t(`achievements.${value}`)}</Text>
      </Pressable>)}
      {(query || filter !== 'all') && <Pressable accessibilityRole="button" onPress={clear} style={s.button}><Text style={s.link}>{t('achievements.clear')}</Text></Pressable>}
    </View>
    {!current ? <ActivityIndicator color={colors.accent} accessibilityLabel={t('achievements.loading')} />
      : current.error ? <View><Text style={s.error} accessibilityRole="alert">{current.error}</Text><Pressable onPress={() => setRetry(retry + 1)} style={s.button} accessibilityRole="button"><Text style={s.link}>{t('common.retry')}</Text></Pressable></View>
      : result && !result.available ? <Text style={font.muted}>{t(result.summary ? 'achievements.summaryOnly' : 'achievements.none')}</Text>
      : result && <>
        {result.achievements.length === 0 ? <Text style={font.muted}>{t('achievements.noMatches')}</Text>
          : result.achievements.map((item) => <View key={item.apiName} style={s.row}>
            <Text style={[font.body, { fontWeight: '700' }]}>{item.name || item.apiName}</Text>
            {!!item.description && <Text style={font.muted}>{item.description}</Text>}
            <Text style={[font.muted, { color: item.unlocked ? colors.success : colors.textMuted }]}>
              {t(item.unlocked ? 'achievements.unlocked' : 'achievements.locked')}
              {item.unlocked && item.unlockedAt ? ` · ${date(item.unlockedAt)}` : ''}
            </Text>
          </View>)}
        {result.total > 0 && <View style={s.controls}>
          <Text style={font.muted}>{t('achievements.page', { from: offset + 1, to: offset + result.achievements.length, total: result.total })}</Text>
          <Pressable style={s.button} disabled={offset === 0} accessibilityRole="button" accessibilityState={{ disabled: offset === 0 }} onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><Text style={offset === 0 ? font.muted : s.link}>{t('achievements.previous')}</Text></Pressable>
          <Pressable style={s.button} disabled={offset + PAGE_SIZE >= result.total} accessibilityRole="button" accessibilityState={{ disabled: offset + PAGE_SIZE >= result.total }} onPress={() => setOffset(offset + PAGE_SIZE)}><Text style={offset + PAGE_SIZE >= result.total ? font.muted : s.link}>{t('achievements.next')}</Text></Pressable>
        </View>}
      </>}
  </View>;
}

const s = StyleSheet.create({
  card: { marginHorizontal: space(4), marginTop: space(4), padding: space(3), borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: space(3) },
  summary: { gap: space(2) },
  track: { height: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.success },
  search: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: space(3), color: colors.text, fontSize: 14 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  button: { paddingVertical: space(2), paddingHorizontal: space(3), borderRadius: radius.sm },
  active: { backgroundColor: colors.accent },
  activeText: { color: colors.accentInk, fontWeight: '700' },
  row: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(3), gap: space(1) },
  link: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13 },
});
