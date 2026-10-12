import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, space, font, radius } from '../src/theme';
import { getBlockedUsers, unblockUser } from '../src/moderation';
import type { UserResult } from '../src/social';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { getBlockedUsers().then(setUsers); }, []);

  const unblock = async (u: UserResult) => {
    setBusy(u.id);
    const { error } = await unblockUser(u.id);
    if (!error) setUsers((xs) => (xs ?? []).filter((x) => x.id !== u.id));
    setBusy(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('block.blockedList')}</Text>
      </View>
      {users == null ? (
        <ActivityIndicator style={{ marginTop: space(8) }} color={colors.accent} />
      ) : users.length === 0 ? (
        <View style={{ padding: space(6), alignItems: 'center', gap: space(2) }}>
          <Ionicons name="ban-outline" size={40} color={colors.textMuted} />
          <Text style={[font.muted, { textAlign: 'center' }]}>{t('block.none')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space(4), gap: space(2) }}>
          <Text style={[font.muted, { marginBottom: space(2), lineHeight: 19 }]}>{t('block.blockedNote')}</Text>
          {users.map((u) => {
            const initial = (u.display_name || u.handle || '?').trim().charAt(0).toUpperCase();
            return (
              <View key={u.id} style={s.row}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => router.push(`/u/${u.handle}`)}>
                  {u.avatar_url
                    ? <Image source={{ uri: u.avatar_url }} style={s.avatar} contentFit="cover" />
                    : <View style={[s.avatar, s.avatarFallback]}><Text style={{ color: colors.text, fontWeight: '800' }}>{initial}</Text></View>}
                  <View style={{ flex: 1, marginLeft: space(3) }}>
                    <Text style={font.h2} numberOfLines={1}>{u.display_name || '@' + u.handle}</Text>
                    <Text style={font.muted} numberOfLines={1}>@{u.handle}</Text>
                  </View>
                </Pressable>
                <Pressable style={s.unblockBtn} onPress={() => unblock(u)} disabled={busy === u.id}>
                  {busy === u.id ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{t('block.unblock')}</Text>}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(3) },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  unblockBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2), marginLeft: space(2), minWidth: 92, alignItems: 'center' },
});
