import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, space, font, radius } from '../src/theme';
import { getPendingRequests, respondFollowRequest, type UserResult } from '../src/social';

export default function RequestsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [reqs, setReqs] = useState<UserResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => setReqs(await getPendingRequests());
  useEffect(() => { load(); }, []);

  const respond = async (id: string, accept: boolean) => {
    setBusy(id);
    await respondFollowRequest(id, accept);
    setReqs((rs) => rs?.filter((r) => r.id !== id) ?? rs);
    setBusy(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('requests.title')}</Text>
      </View>
      {reqs == null ? <ActivityIndicator style={{ marginTop: space(8) }} color={colors.accent} /> : (
        <ScrollView contentContainerStyle={{ paddingVertical: space(2) }}>
          {reqs.length === 0
            ? <Text style={[font.muted, { padding: space(5), textAlign: 'center' }]}>{t('requests.empty')}</Text>
            : reqs.map((u) => {
              const initial = (u.display_name || u.handle || '?').trim().charAt(0).toUpperCase();
              return (
                <View key={u.id} style={s.row}>
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => router.push(`/u/${u.handle}`)}>
                    {u.avatar_url
                      ? <Image source={{ uri: u.avatar_url }} style={s.avatar} contentFit="cover" />
                      : <View style={[s.avatar, s.avatarFallback]}><Text style={{ color: colors.text, fontWeight: '800' }}>{initial}</Text></View>}
                    <View style={{ flex: 1, marginLeft: space(3) }}>
                      {u.display_name ? <Text style={font.h2} numberOfLines={1}>{u.display_name}</Text> : null}
                      <Text style={[font.muted, u.display_name ? null : { color: colors.text, fontWeight: '700' }]}>@{u.handle}</Text>
                    </View>
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: space(2) }}>
                    <Pressable onPress={() => respond(u.id, true)} disabled={busy === u.id} style={s.accept}><Text style={{ color: colors.accentInk, fontWeight: '800' }}>{t('requests.accept')}</Text></Pressable>
                    <Pressable onPress={() => respond(u.id, false)} disabled={busy === u.id} style={s.reject}><Ionicons name="close" size={18} color={colors.text} /></Pressable>
                  </View>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(3) },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  accept: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2), justifyContent: 'center' },
  reject: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, width: 38, alignItems: 'center', justifyContent: 'center' },
});
