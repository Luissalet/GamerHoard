import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';

// Community guidelines (published in-app: Play UGC + Apple 1.2 requirement).
export default function GuidelinesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const sections: { icon: any; title: string; body: string }[] = [
    { icon: 'people-outline', title: t('guidelines.s1t'), body: t('guidelines.s1b') },
    { icon: 'shield-outline', title: t('guidelines.s2t'), body: t('guidelines.s2b') },
    { icon: 'eye-off-outline', title: t('guidelines.s3t'), body: t('guidelines.s3b') },
    { icon: 'megaphone-outline', title: t('guidelines.s4t'), body: t('guidelines.s4b') },
    { icon: 'flag-outline', title: t('guidelines.s5t'), body: t('guidelines.s5b') },
    { icon: 'hammer-outline', title: t('guidelines.s6t'), body: t('guidelines.s6b') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('guidelines.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3), paddingBottom: space(8) }}>
        <Text style={[font.body, { color: colors.textMuted, lineHeight: 21 }]}>{t('guidelines.intro')}</Text>
        {sections.map((sec, i) => (
          <View key={i} style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(2) }}>
              <View style={s.iconWrap}><Ionicons name={sec.icon} size={18} color={colors.accent} /></View>
              <Text style={[font.h2, { flex: 1 }]}>{sec.title}</Text>
            </View>
            <Text style={[font.body, { color: colors.textMuted, lineHeight: 21 }]}>{sec.body}</Text>
          </View>
        ))}
        <Text style={[font.muted, { textAlign: 'center', marginTop: space(2), lineHeight: 19 }]}>{t('guidelines.footer')}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4) },
  iconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
