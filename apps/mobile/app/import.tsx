import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { importSteam, getSteamKey, getSteamProfile, type SteamImportResult } from '../src/steam';

// Steam library import: profile (vanity name, URL or SteamID64) + Steam Web API key.
// The key stays on this device (never written to the library file shared with other tools).
export default function SteamImportScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SteamImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => {
    getSteamKey().then((k) => { if (k) setKey(k); });
    getSteamProfile().then((p) => { if (p) setProfile(p); });
  }, []);

  const mapErr = (code?: string) =>
    code === 'PRIVATE' ? t('steam.errPrivate')
    : code === 'NEEDBOTH' ? t('steam.needBoth')
    : code === 'PROFILE' ? t('steam.errProfile')
    : code === 'FETCH' ? t('steam.errFetch')
    : code === 'SERVER' ? t('steam.errServer')
    : t('steam.errGeneric');

  const run = async () => {
    setError(null); setResult(null); setBusy(true);
    try {
      setResult(await importSteam(profile, key));
    } catch (e: any) {
      setError(mapErr(e?.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('steam.title')}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(10), gap: space(4) }}>
        <View style={s.hero}>
          <Ionicons name="logo-steam" size={40} color={colors.text} />
          <Text style={[font.muted, { flex: 1, marginLeft: space(3), lineHeight: 20 }]}>{t('steam.intro')}</Text>
        </View>

        <View style={s.note}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
          <View style={{ flex: 1, marginLeft: space(2) }}>
            <Text style={font.muted}>{t('steam.privacy')}</Text>
            <Text style={[font.muted, { fontSize: 12, marginTop: space(1), opacity: 0.8 }]}>{t('steam.publicHint')}</Text>
          </View>
        </View>

        {error ? <Text testID="steam-error" style={{ color: colors.danger, fontWeight: '700' }}>{error}</Text> : null}

        {result ? (
          <View style={s.result}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Text testID="steam-done" style={[font.h2, { flex: 1, marginLeft: space(2) }]}>{t('steam.done', { added: result.added, existing: result.existing, total: result.total })}</Text>
          </View>
        ) : null}

        {result ? (
          <Pressable style={s.primary} onPress={() => router.replace('/')}>
            <Text style={s.primaryText}>{t('steam.viewLibrary')}</Text>
          </Pressable>
        ) : (
          <View style={s.box}>
            <View>
              <Text style={s.label}>{t('steam.profileLabel')}</Text>
              <TextInput value={profile} onChangeText={setProfile} placeholder={t('steam.profilePh')} placeholderTextColor={colors.textMuted} style={s.input} autoCapitalize="none" autoCorrect={false} editable={!busy} />
            </View>
            <View>
              <Text style={s.label}>{t('steam.keyLabel')}</Text>
              <TextInput value={key} onChangeText={setKey} placeholder={t('steam.keyPh')} placeholderTextColor={colors.textMuted} style={s.input} autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!busy} />
              <Pressable style={s.linkRow} onPress={() => Linking.openURL('https://steamcommunity.com/dev/apikey')} hitSlop={6}>
                <Ionicons name="open-outline" size={14} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>  {t('steam.getKey')}</Text>
              </Pressable>
            </View>
            <Pressable style={[s.primary, busy && { opacity: 0.7 }]} onPress={run} disabled={busy}>
              {busy ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                  <ActivityIndicator color={colors.accentInk} />
                  <Text style={s.primaryText}>{t('steam.importing')}</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                  <Ionicons name="logo-steam" size={20} color={colors.accentInk} />
                  <Text style={s.primaryText}>{t('steam.importBtn')}</Text>
                </View>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(4) },
  note: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space(3) },
  result: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.success, padding: space(4) },
  primary: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(4), alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.accentInk, fontWeight: '800', fontSize: 16 },
  box: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(4), gap: space(4) },
  label: { ...font.muted, marginBottom: space(2), fontWeight: '700' },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), height: 46, color: colors.text, fontSize: 15, outlineStyle: 'none' } as any,
  linkRow: { flexDirection: 'row', alignItems: 'center', marginTop: space(2) },
});
