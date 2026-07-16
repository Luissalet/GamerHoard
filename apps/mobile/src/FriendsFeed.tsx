import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { colors, space, font, radius } from './theme';
import { getFriendsActivity, type ActivityEvent } from './social';

function ago(iso: string, t: TFunction): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return t('reviews.agoNow');
  if (d < 3600) return t('reviews.agoMin', { n: Math.floor(d / 60) });
  if (d < 86400) return t('reviews.agoHour', { n: Math.floor(d / 3600) });
  if (d < 2592000) return t('reviews.agoDay', { n: Math.floor(d / 86400) });
  const dd = new Date(iso); return isNaN(dd.getTime()) ? '' : dd.toISOString().slice(0, 10);
}

const epCode = (meta: any) => meta?.season != null && meta?.episode != null
  ? `T${String(meta.season).padStart(2, '0')} | E${String(meta.episode).padStart(2, '0')}` : '';

function phrase(e: ActivityEvent, t: TFunction): string {
  const title = e.title ?? '';
  switch (e.verb) {
    case 'watched_episode':
      return e.meta?.count
        ? t('feed.vWatchedSeason', { season: e.meta.season, count: e.meta.count, title })
        : t('feed.vWatchedEp', { code: epCode(e.meta), title });
    case 'watched_movie': return t('feed.vWatchedMovie', { title });
    case 'reviewed': return t('feed.vReviewed', { title });
    case 'added_show': return t('feed.vAddedShow', { title });
    case 'added_movie': return t('feed.vAddedMovie', { title });
    case 'followed': return t('feed.vFollowed', { handle: e.meta?.targetHandle ?? '' });
    default: return title;
  }
}

export function FriendsFeed() {
  const router = useRouter();
  const { t } = useTranslation();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => { setEvents(await getFriendsActivity(80)); }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const openEntity = (e: ActivityEvent) => {
    const key = e.entity_key ?? '';
    if (e.entity_type === 'episode') { const [tv, se, ep] = key.split(':'); if (tv && se && ep) router.push(`/episode/${tv}-${se}-${ep}`); }
    else if (e.entity_type === 'show' && key) router.push(`/show/${key}`);
    else if (e.entity_type === 'movie' && key) router.push(`/movie/${key}`);
    else if (e.verb === 'followed' && e.meta?.targetHandle) router.push(`/u/${e.meta.targetHandle}`);
  };

  if (events == null) return <ActivityIndicator style={{ marginTop: space(8) }} color={colors.accent} />;
  if (events.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="people-outline" size={44} color={colors.textMuted} />
        <Text style={[font.muted, { marginTop: space(3), textAlign: 'center' }]}>{t('feed.empty')}</Text>
      </View>
    );
  }
  return (
    <FlashList
      data={events}
      estimatedItemSize={72}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={{ paddingVertical: space(2), paddingBottom: space(8) }}
      refreshing={refreshing}
      onRefresh={onRefresh}
      renderItem={({ item: e }) => {
        const initial = (e.actor.display_name || e.actor.handle || '?').trim().charAt(0).toUpperCase();
        return (
          <Pressable style={s.row} onPress={() => openEntity(e)}>
            <Pressable onPress={() => router.push(`/u/${e.actor.handle}`)} hitSlop={4}>
              {e.actor.avatar_url
                ? <Image source={{ uri: e.actor.avatar_url }} style={s.avatar} contentFit="cover" />
                : <View style={[s.avatar, s.avatarFallback]}><Text style={{ color: colors.text, fontWeight: '800' }}>{initial}</Text></View>}
            </Pressable>
            <View style={{ flex: 1, marginHorizontal: space(3) }}>
              <Text style={font.body}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{e.actor.display_name || '@' + e.actor.handle}</Text>
                <Text style={{ color: colors.textMuted }}> {phrase(e, t)}</Text>
              </Text>
              {e.meta?.rating ? <Text style={{ color: colors.accent, marginTop: 2 }}>{'★'.repeat(Math.min(5, Number(e.meta.rating)))}</Text> : null}
              <Text style={[font.muted, { fontSize: 11, marginTop: 2 }]}>{ago(e.created_at, t)}</Text>
            </View>
            {e.poster ? <Image source={{ uri: e.poster }} style={s.poster} contentFit="cover" /> : null}
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8) },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  poster: { width: 40, height: 60, borderRadius: 6, backgroundColor: colors.surfaceAlt },
});
