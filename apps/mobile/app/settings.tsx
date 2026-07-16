import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Platform, Linking, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { data } from '../src/db';
import { exportData } from '../src/export';
import { isCloud } from '../src/lib/backend';
import { useSession } from '../src/auth/session';
import { LANGS } from '../src/i18n';
import { canPromptInstall, promptInstall, isStandalone, isIos } from '../src/pwa';
import { getWatchRegion, setWatchRegion } from '../src/tmdb';

const DANGER = '#e5484d';
const DONATE_URL = 'https://www.gofundme.com/f/create-an-alternative-to-tv-time';
const REGIONS: { code: string; label: string }[] = [
  { code: 'ES', label: 'España' }, { code: 'MX', label: 'México' }, { code: 'AR', label: 'Argentina' },
  { code: 'CL', label: 'Chile' }, { code: 'CO', label: 'Colombia' }, { code: 'PE', label: 'Perú' },
  { code: 'US', label: 'United States' }, { code: 'GB', label: 'United Kingdom' }, { code: 'IE', label: 'Ireland' },
  { code: 'PT', label: 'Portugal' }, { code: 'BR', label: 'Brasil' }, { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Deutschland' }, { code: 'IT', label: 'Italia' }, { code: 'NL', label: 'Nederland' },
  { code: 'CA', label: 'Canada' }, { code: 'AU', label: 'Australia' }, { code: 'JP', label: '日本' }, { code: 'KR', label: '한국' },
];

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
  const { account, session, signOut } = useSession();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const currentLangLabel = LANGS.find((l) => i18n.language && i18n.language.startsWith(l.code))?.label ?? 'English';

  const openTvTimeExport = () => {
    const url = 'https://gdpr.tvtime.com/gdpr/self-service';
    if (Platform.OS === 'web') (globalThis as any).open?.(url, '_blank', 'noopener,noreferrer');
    else Linking.openURL(url);
  };

  const onSignOut = () => {
    const go = async () => { await signOut(); if (Platform.OS === 'web') (globalThis as any).location?.reload(); else router.replace('/'); };
    if (Platform.OS === 'web') { if ((globalThis as any).confirm?.(t('settings.confirmSignOutWeb'))) go(); }
    else Alert.alert(t('settings.signOut'), t('settings.confirmSignOutBody'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('settings.signOut'), style: 'destructive', onPress: go }]);
  };

  const doAndReload = async (fn: () => Promise<void>) => { await fn(); if (Platform.OS === 'web') (globalThis as any).location?.reload(); else router.replace('/'); };
  const onClear = () => {
    const go = () => doAndReload(() => data.clearData());
    if (Platform.OS === 'web') { if ((globalThis as any).confirm?.(t('settings.clearWeb'))) go(); }
    else Alert.alert(t('settings.clearData'), t('settings.clearBody'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('settings.clearAction'), style: 'destructive', onPress: go }]);
  };

  const openDonate = () => {
    if (Platform.OS === 'web') (globalThis as any).open?.(DONATE_URL, '_blank', 'noopener,noreferrer');
    else Linking.openURL(DONATE_URL);
  };

  const openX = () => {
    const url = 'https://x.com/MyBookHoard';
    if (Platform.OS === 'web') (globalThis as any).open?.(url, '_blank', 'noopener,noreferrer');
    else Linking.openURL(url);
  };
  const openMail = () => {
    const url = 'mailto:watchhoard@gmail.com';
    if (Platform.OS === 'web') { (globalThis as any).location.href = url; }
    else Linking.openURL(url);
  };

  const [region, setRegion] = React.useState<string | null>(getWatchRegion());
  const [regionOpen, setRegionOpen] = React.useState(false);
  const effectiveRegion = region ?? (i18n.language?.startsWith('es') ? 'ES' : 'US');
  const regionLabel = REGIONS.find((r) => r.code === effectiveRegion)?.label ?? effectiveRegion;
  const pickRegion = async (code: string | null) => { setRegion(code); setRegionOpen(false); await setWatchRegion(code); };

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
        {isCloud && (
          <>
            <Text style={s.section}>{t('settings.account')}</Text>
            <View style={s.group}>
              <Row icon="person-circle-outline" title={account ? '@' + account.handle : t('settings.yourAccount')} subtitle={t('settings.accountSub')} onPress={() => router.push('/account')} />
              <View style={s.sep} />
              <Row icon="ban-outline" title={t('settings.blockedUsers')} subtitle={t('settings.blockedUsersSub')} onPress={() => router.push('/blocked')} />
              {(account?.role === 'moderator' || account?.role === 'admin') && (
                <>
                  <View style={s.sep} />
                  <Row icon="shield-half-outline" title={t('settings.moderation')} subtitle={t('settings.moderationSub')} onPress={() => router.push('/moderation')} />
                </>
              )}
            </View>
          </>
        )}

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

        <Text style={s.section}>{t('settings.support')}</Text>
        <View style={s.group}>
          <Row icon="book-outline" title={t('settings.guidelines')} subtitle={t('settings.guidelinesSub')} onPress={() => router.push('/guidelines')} />
          <View style={s.sep} />
          <Row icon="logo-twitter" title={t('settings.contactX')} subtitle="@MyBookHoard" onPress={openX} />
          <View style={s.sep} />
          <Row icon="mail-outline" title={t('settings.contactEmail')} subtitle="watchhoard@gmail.com" onPress={openMail} />
        </View>

        <Text style={s.section}>{t('settings.data')}</Text>
        <View style={s.group}>
          <Row icon="logo-steam" title={t('settings.importSteam')} subtitle={t('settings.importSteamSub')} onPress={() => router.push('/import')} />
          <View style={s.sep} />
          <Row icon="download-outline" title={t('settings.exportData')} subtitle={t('settings.exportDataSub')} onPress={() => exportData()} />
        </View>
        <View style={s.group}>
          <Row icon="trash-outline" title={t('settings.clearData')} subtitle={t('settings.clearDataSub')} onPress={onClear} danger />
        </View>
        {isCloud && session && (
          <>
            <Text style={s.section}>{t('settings.session')}</Text>
            <View style={s.group}>
              <Row icon="log-out-outline" title={t('settings.signOut')} subtitle={account ? t('settings.signedInAs', { handle: account.handle }) : undefined} onPress={onSignOut} danger />
            </View>
          </>
        )}
        <Text style={[font.muted, { textAlign: 'center', marginTop: space(4) }]}>{t('settings.footer')}</Text>
      </ScrollView>
      <Modal visible={regionOpen} transparent animationType="fade" onRequestClose={() => setRegionOpen(false)}>
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(2) }}>
              <Text style={[font.h1, { fontSize: 18, flex: 1 }]}>{t('settings.watchRegion')}</Text>
              <Pressable onPress={() => setRegionOpen(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <Pressable style={s.regionRow} onPress={() => pickRegion(null)}>
                <Text style={[font.body, { flex: 1, color: colors.text }]}>{t('settings.watchRegionAuto')}</Text>
                {region == null ? <Ionicons name="checkmark" size={18} color={colors.accent} style={{ marginLeft: 8 }} /> : null}
              </Pressable>
              {REGIONS.map((r) => (
                <Pressable key={r.code} style={s.regionRow} onPress={() => pickRegion(r.code)}>
                  <Text style={[font.body, { flex: 1, color: colors.text }]}>{r.label}</Text>
                  <Text style={font.muted}>{r.code}</Text>
                  {region === r.code ? <Ionicons name="checkmark" size={18} color={colors.accent} style={{ marginLeft: 8 }} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  pickerOverlay: { flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: space(4) },
  pickerSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), width: '100%', maxWidth: 420 },
  regionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
});
