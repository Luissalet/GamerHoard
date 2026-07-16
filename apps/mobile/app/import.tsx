import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { importSteamLibrary, getSteamKey, setSteamKey } from '../src/steam';

export default function SteamImportScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [profile, setProfile] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ n: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getSteamKey().then((k) => { if (k) setKey(k); }); }, []);

  const run = async () => {
    setError(null); setResult(null);
    if (!profile.trim() || !key.trim()) { setError(t('steam.needBoth')); return; }
    setBusy(true); setProgress({ done: 0, total: 0 });
    try {
      await setSteamKey(key);
      const r = await importSteamLibrary(profile, key, (done, total) => setProgress({ done, total }));
      setResult({ n: r.imported, h: r.hours });
    } catch (e: any) {
      const code = e?.message;
      setError(code === 'PROFILE' ? t('steam.errProfile') : code === 'FETCH' ? t('steam.errFetch') : t('steam.errGeneric'));
    } finally {
      setBusy(false); setProgress(null);
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

        <View style={s.note}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
          <Text style={[font.muted, { flex: 1, marginLeft: space(2) }]}>{t('steam.privacy')}</Text>
        </View>

        {error ? <Text style={{ color: colors.danger, fontWeight: '700' }}>{error}</Text> : null}

        {result ? (
          <View style={s.result}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Text style={[font.h2, { flex: 1, marginLeft: space(2) }]}>{t('steam.done', { n: result.n, h: result.h })}</Text>
          </View>
        ) : null}

        {result ? (
          <Pressable style={s.primary} onPress={() => router.replace('/')}>
            <Text style={s.primaryText}>{t('steam.viewLibrary')}</Text>
          </Pressable>
        ) : (
          <Pressable style={[s.primary, busy && { opacity: 0.7 }]} onPress={run} disabled={busy}>
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                <ActivityIndicator color={colors.accentInk} />
                <Text style={s.primaryText}>{progress && progress.total > 0 ? t('steam.importing', { done: progress.done, total: progress.total }) : t('steam.importBtn')}</Text>
              </View>
            ) : (
              <Text style={s.primaryText}>{t('steam.importBtn')}</Text>
            )}
          </Pressable>
        )}

        {Platform.OS === 'web' ? <Text style={[font.muted, { fontSize: 12 }]}>{t('steam.webNote')}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(4) },
  label: { ...font.muted, marginBottom: space(2), fontWeight: '700' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), height: 46, color: colors.text, fontSize: 15, outlineStyle: 'none' } as any,
  linkRow: { flexDirection: 'row', alignItems: 'center', marginTop: space(2) },
  note: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space(3) },
  result: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.success, padding: space(4) },
  primary: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(4), alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.accentInk, fontWeight: '800', fontSize: 16 },
});
