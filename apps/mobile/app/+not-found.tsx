import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';

// In-app 404 (unknown route after the SPA fallback serves index.html).
export default function NotFound() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <View style={s.center}>
      <Ionicons name="compass-outline" size={48} color={colors.textMuted} />
      <Text style={[font.h1, { marginTop: space(3) }]}>{t('notFound.title')}</Text>
      <Text style={[font.muted, { marginTop: space(1), textAlign: 'center' }]}>{t('notFound.body')}</Text>
      <Pressable style={s.btn} onPress={() => router.replace('/')}>
        <Text style={s.btnText}>{t('notFound.home')}</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  btn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(6), paddingVertical: space(3), marginTop: space(5) },
  btnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
