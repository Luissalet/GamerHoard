import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { LANGS, setLanguage, type LangCode } from '../src/i18n';

export default function LanguageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const current: LangCode = i18n.language && i18n.language.startsWith('es') ? 'es' : 'en';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={back} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('language.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }}>
        <Text style={s.section}>{t('language.subtitle')}</Text>
        <View style={s.group}>
          {LANGS.map((l, i) => (
            <React.Fragment key={l.code}>
              {i > 0 ? <View style={s.sep} /> : null}
              <Pressable style={s.row} onPress={() => setLanguage(l.code)}>
                <Text style={[font.h2, { flex: 1 }]}>{l.label}</Text>
                {current === l.code ? <Ionicons name="checkmark" size={22} color={colors.accent} /> : null}
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  section: { ...font.muted, textTransform: 'uppercase', fontSize: 12, letterSpacing: 1, marginLeft: space(1) },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: space(4) },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: space(4) },
});
