import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, space, font } from '../src/theme';
import { getProfileByHandle, getFollowers, getFollowing, type UserResult } from '../src/social';

function PersonRow({ u, onPress }: { u: UserResult; onPress: () => void }) {
  const initial = (u.display_name || u.handle || '?').trim().charAt(0).toUpperCase();
  return (
    <Pressable style={s.row} onPress={onPress}>
      {u.avatar_url
        ? <Image source={{ uri: u.avatar_url }} style={s.avatar} contentFit="cover" />
        : <View style={[s.avatar, s.avatarFallback]}><Text style={{ color: colors.text, fontWeight: '800' }}>{initial}</Text></View>}
      <View style={{ flex: 1, marginLeft: space(3) }}>
        {u.display_name ? <Text style={font.h2} numberOfLines={1}>{u.display_name}</Text> : null}
        <Text style={[font.muted, u.display_name ? null : { color: colors.text, fontWeight: '700' }]}>@{u.handle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function FollowsScreen() {
  const { handle, type } = useLocalSearchParams<{ handle: string; type: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isFollowers = type !== 'following';
  const [list, setList] = useState<UserResult[] | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getProfileByHandle(String(handle));
      if (!p) { setList([]); return; }
      setList(isFollowers ? await getFollowers(p.id) : await getFollowing(p.id));
    })();
  }, [handle, type]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={font.h1}>{isFollowers ? t('follows.followers') : t('follows.following')}</Text>
      </View>
      {list == null ? <ActivityIndicator style={{ marginTop: space(8) }} color={colors.accent} /> : (
        <ScrollView contentContainerStyle={{ paddingVertical: space(2) }}>
          {list.length === 0
            ? <Text style={[font.muted, { padding: space(5), textAlign: 'center' }]}>{isFollowers ? t('follows.emptyFollowers') : t('follows.emptyFollowing')}</Text>
            : list.map((u) => <PersonRow key={u.id} u={u} onPress={() => router.push(`/u/${u.handle}`)} />)}
        </ScrollView>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(3) },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
});
