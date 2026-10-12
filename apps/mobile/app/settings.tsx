import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { exportData } from '../src/export';
import { LANGS } from '../src/i18n';
import { canPromptInstall, promptInstall, isStandalone, isIos } from '../src/pwa';

const DANGER = '#e5484d';

function Row({ icon, title, subtitle, onPress, danger }: { icon: any; title: string; subtitle?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={s.row} onPress={onPress}>
      <View style={[s.rowIcon, danger && { backgroundColor: '#e5484d22' }]}><Ionicons name={icon} size={20} color={danger ? DANGER : colors.text} /></View>
      <View style={{ flex: 1, marginLeft: space(3) }}>
        <Text style={[font.h2, danger && { color: DANGER }]}>{title}</Text>
        {subtitle ? <Text style={font.muted} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const currentLangLabel = LANGS.find((l) => i18n.language && i18n.language.startsWith(l.code))?.label ?? 'English';

  const [installHint, setInstallHint] = React.useState<string | null>(null);
  const onInstall = async () => {
    setInstallHint(null);
    if (canPromptInstall()) {
      const r = await promptInstall();
      if (r !== 'unavailable') return;
    }
    setInstallHint(isIos() ? t('settings.installHintIos') : t('settings.installHintGeneric'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={back} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('settings.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }}>
        <View style={s.group}>
          <Row icon="language-outline" title={t('settings.language')} subtitle={currentLangLabel} onPress={() => router.push('/language')} />
        </View>

        {Platform.OS === 'web' && !isStandalone() && (
          <>
            <Text style={s.section}>{t('settings.app')}</Text>
            <View style={s.group}>
              <Row icon="phone-portrait-outline" title={t('settings.installApp')} subtitle={t('settings.installAppSub')} onPress={onInstall} />
              {installHint ? <Text style={[font.muted, { paddingHorizontal: space(3), paddingBottom: space(3), lineHeight: 19 }]}>{installHint}</Text> : null}
            </View>
          </>
        )}

        <Text style={s.section}>{t('settings.data')}</Text>
        <View style={s.group}>
          <Row icon="logo-steam" title={t('settings.importSteam')} subtitle={t('settings.importSteamSub')} onPress={() => router.push('/import')} />
          <View style={s.sep} />
          <Row icon="download-outline" title={t('settings.exportData')} subtitle={t('settings.exportDataSub')} onPress={() => exportData()} />
        </View>
        <Text style={[font.muted, { textAlign: 'center', marginTop: space(4) }]}>{t('settings.footer')}</Text>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  section: { ...font.muted, textTransform: 'uppercase', fontSize: 12, letterSpacing: 1, marginLeft: space(1) },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: space(3) },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 60 },
});
