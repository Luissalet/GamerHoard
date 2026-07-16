import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native';
import { colors, space, font, radius } from '../src/theme';
import { supabase } from '../src/lib/supabase';

// Landing page of the Supabase recovery email link (…/reset-password#access_token=…&type=recovery).
// detectSessionInUrl (web) turns the hash into a session; then updateUser({password}) completes the reset.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    // Give detectSessionInUrl a moment to consume the URL hash on web.
    const check = async (attempt: number) => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (data.session) setReady('ok');
      else if (attempt < 6) setTimeout(() => check(attempt + 1), 500);
      else setReady('invalid');
    };
    check(0);
    return () => { alive = false; };
  }, []);

  async function save() {
    setMsg(null);
    if (pw.length < 6) { setMsg(t('reset.tooShort')); return; }
    if (pw !== pw2) { setMsg(t('reset.mismatch')); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg(error.message);
    else { setDone(true); setTimeout(() => { if (Platform.OS === 'web') (globalThis as any).location?.assign('/'); else router.replace('/'); }, 1500); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(5) }}>
      <View style={s.card}>
        <Ionicons name="key-outline" size={34} color={colors.accent} style={{ alignSelf: 'center' }} />
        <Text style={[font.h1, { textAlign: 'center', marginTop: space(2) }]}>{t('reset.title')}</Text>

        {ready === 'checking' ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: space(5) }} />
        ) : ready === 'invalid' ? (
          <>
            <Text style={[font.muted, { textAlign: 'center', marginTop: space(3) }]}>{t('reset.invalid')}</Text>
            <Pressable style={s.btn} onPress={() => (Platform.OS === 'web' ? (globalThis as any).location?.assign('/') : router.replace('/'))}>
              <Text style={s.btnText}>{t('reset.backHome')}</Text>
            </Pressable>
          </>
        ) : done ? (
          <>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} style={{ alignSelf: 'center', marginTop: space(4) }} />
            <Text style={[font.h2, { textAlign: 'center', marginTop: space(2) }]}>{t('reset.done')}</Text>
          </>
        ) : (
          <>
            <Text style={[font.muted, { textAlign: 'center', marginTop: space(2) }]}>{t('reset.sub')}</Text>
            <View style={s.pwRow}>
              <TextInput value={pw} onChangeText={setPw} secureTextEntry={!show} placeholder={t('reset.newPassword')}
                placeholderTextColor={colors.textMuted} autoCapitalize="none" style={s.input} />
              <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}><Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} /></Pressable>
            </View>
            <View style={s.pwRow}>
              <TextInput value={pw2} onChangeText={setPw2} secureTextEntry={!show} placeholder={t('reset.repeatPassword')}
                placeholderTextColor={colors.textMuted} autoCapitalize="none" style={s.input} />
            </View>
            {msg ? <Text style={{ color: colors.danger, marginTop: space(3), textAlign: 'center' }}>{msg}</Text> : null}
            <Pressable style={[s.btn, { opacity: busy ? 0.6 : 1 }]} onPress={save} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.accentInk} /> : <Text style={s.btnText}>{t('reset.save')}</Text>}
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(5), width: '100%', maxWidth: 420 },
  pwRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: space(3), marginTop: space(3) },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: space(3) } as any,
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, padding: space(4), alignItems: 'center', marginTop: space(4) },
  btnText: { color: colors.accentInk, fontWeight: '800', fontSize: 16 },
});
