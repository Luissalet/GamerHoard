import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { setRemember } from '../lib/authStorage';
import { colors, radius, space, font } from '../theme';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const RESEND_SECONDS = 120; // cooldown before a confirmation email can be re-sent
type HandleStatus = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';
type Mode = 'signin' | 'signup';

export function AuthScreen({ initialMode = 'signup', onBack }: { initialMode?: Mode; onBack?: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [remember, setRememberState] = useState(true); // "Keep me signed in" — ON by default
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hStatus, setHStatus] = useState<HandleStatus>('idle');
  // After a sign-up that needs email confirmation we swap the form for a dedicated
  // "check your email" view and gate the resend button behind a countdown.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // Live @handle availability (debounced) — only while registering.
  useEffect(() => {
    if (mode !== 'signup') { setHStatus('idle'); return; }
    const h = handle.trim().toLowerCase();
    if (!h) { setHStatus('idle'); return; }
    if (!HANDLE_RE.test(h)) { setHStatus('invalid'); return; }
    setHStatus('checking');
    const tm = setTimeout(async () => {
      const { data, error } = await supabase.rpc('is_handle_available', { p_handle: h });
      if (error) { setHStatus('idle'); return; }
      setHStatus(data ? 'ok' : 'taken');
    }, 450);
    return () => clearTimeout(tm);
  }, [handle, mode]);

  // Tick the resend cooldown down to zero while the confirmation view is showing.
  useEffect(() => {
    if (!pendingEmail) return;
    const id = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [pendingEmail]);

  async function submit() {
    setMsg(null);
    if (!email.trim() || !password) { setMsg(t('auth.enterEmailPw')); return; }
    if (mode === 'signup') {
      const h = handle.trim().toLowerCase();
      if (!HANDLE_RE.test(h)) { setMsg(t('auth.handleFormat')); return; }
      if (hStatus === 'taken') { setMsg(t('account.handleTaken')); return; }
      if (password !== confirm) { setMsg(t('auth.passwordsMismatch')); return; }
    }
    setBusy(true);
    try {
      // Route the session token to persistent vs ephemeral storage BEFORE auth writes it.
      await setRemember(remember);
      if (mode === 'signup') {
        const h = handle.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { handle: h, display_name: displayName.trim() || null } },
        });
        if (error) throw error;
        // Instant access: if a session appears the gate opens on its own. Otherwise the
        // account needs email confirmation, so swap in the dedicated "check your email" view.
        if (!data.session) {
          setPendingEmail(email.trim());
          setResendIn(RESEND_SECONDS);
          setResendMsg(null);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e: any) {
      setMsg(translateError(e?.message, t));
    } finally {
      setBusy(false);
    }
  }

  // Re-send the confirmation email, then restart the cooldown.
  async function resend() {
    if (!pendingEmail || resendIn > 0 || resendBusy) return;
    setResendBusy(true);
    setResendMsg(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });
      if (error) throw error;
      setResendMsg(t('auth.resendDone'));
      setResendIn(RESEND_SECONDS);
    } catch {
      setResendMsg(t('auth.resendErr'));
    } finally {
      setResendBusy(false);
    }
  }

  const canSubmit = !busy && (mode === 'signin' || hStatus === 'ok' || hStatus === 'idle');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space(6) }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
          {onBack && (
            <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: space(4) }}>
              <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>{t('auth.back')}</Text>
            </Pressable>
          )}

          <Text style={[font.display, { marginBottom: space(1) }]}>GamerHoard</Text>

          {pendingEmail ? (
            <CheckEmailView
              email={pendingEmail}
              secondsLeft={resendIn}
              busy={resendBusy}
              message={resendMsg}
              onResend={resend}
              onBack={() => { setPendingEmail(null); setMode('signin'); setMsg(null); setResendMsg(null); setConfirm(''); }}
            />
          ) : (
          <>
          <Text style={[font.muted, { marginBottom: space(6) }]}>
            {mode === 'signin' ? t('auth.signinSub') : t('auth.signupSub')}
          </Text>

          {!supabaseConfigured && (
            <Text style={{ color: colors.danger, marginBottom: space(4) }}>
              {t('auth.missingConfig')}
            </Text>
          )}

          {mode === 'signup' && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', ...inputStyle, paddingVertical: 0 }}>
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>@</Text>
                <TextInput
                  value={handle}
                  onChangeText={(v) => setHandle(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                  placeholder={t('auth.phUsername')} placeholderTextColor={colors.textMuted}
                  autoCapitalize="none" autoCorrect={false}
                  style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: space(4) }}
                />
                {hStatus === 'checking' && <ActivityIndicator size="small" color={colors.textMuted} />}
                {hStatus === 'ok' && <Text style={{ color: colors.success, fontWeight: '700' }}>{t('auth.free')}</Text>}
                {hStatus === 'taken' && <Text style={{ color: colors.danger, fontWeight: '700' }}>{t('auth.taken')}</Text>}
              </View>
              <HandleHint status={hStatus} />

              <TextInput value={displayName} onChangeText={setDisplayName} placeholder={t('auth.phDisplayName')} placeholderTextColor={colors.textMuted}
                style={[inputStyle, { marginTop: space(3) }]} />
            </>
          )}

          <TextInput value={email} onChangeText={setEmail} placeholder={t('auth.phEmail')} placeholderTextColor={colors.textMuted}
            autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
            style={[inputStyle, { marginTop: space(3) }]} />

          {/* Password with show/hide eye */}
          <PasswordField value={password} onChangeText={setPassword} placeholder={t('auth.phPassword')}
            show={showPw} onToggle={() => setShowPw((v) => !v)} marginTop={space(3)} />

          {mode === 'signin' && (
            <Pressable
              onPress={async () => {
                setMsg(null);
                const em = email.trim();
                if (!em) { setMsg(t('auth.resetNeedEmail')); return; }
                const origin = (globalThis as any)?.location?.origin ?? 'https://gamer-hoard.com';
                const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: origin + '/reset-password' });
                setMsg(error ? error.message : t('auth.resetSent'));
              }}
              style={{ alignSelf: 'flex-end', marginTop: space(2) }} hitSlop={6}
            >
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{t('auth.forgot')}</Text>
            </Pressable>
          )}

          {/* Repeat password (register only), with its own eye */}
          {mode === 'signup' && (
            <PasswordField value={confirm} onChangeText={setConfirm} placeholder={t('auth.phConfirmPassword')}
              show={showPw2} onToggle={() => setShowPw2((v) => !v)} marginTop={space(3)} />
          )}

          {/* Keep me signed in — ON by default */}
          <Pressable onPress={() => setRememberState((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(4) }}>
            <View style={{
              width: 22, height: 22, borderRadius: 6, borderWidth: 1,
              borderColor: remember ? colors.accent : colors.border,
              backgroundColor: remember ? colors.accent : 'transparent',
              alignItems: 'center', justifyContent: 'center', marginRight: space(3),
            }}>
              {remember && <Ionicons name="checkmark" size={16} color={colors.accentInk} />}
            </View>
            <Text style={{ color: colors.text, fontSize: 14 }}>{t('auth.rememberMe')}</Text>
          </Pressable>

          {msg && <Text style={{ color: colors.textMuted, marginTop: space(3) }}>{msg}</Text>}

          <Pressable onPress={submit} disabled={!canSubmit}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: space(4), alignItems: 'center', marginTop: space(5), opacity: canSubmit ? 1 : 0.5 }}>
            {busy ? <ActivityIndicator color={colors.accentInk} />
              : <Text style={{ color: colors.accentInk, fontWeight: '800', fontSize: 16 }}>{mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}</Text>}
          </Pressable>

          <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null); setConfirm(''); }} style={{ marginTop: space(5), alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted }}>
              {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}
              <Text style={{ color: colors.accent, fontWeight: '700' }}>{mode === 'signin' ? t('auth.signUpLink') : t('auth.signInLink')}</Text>
            </Text>
          </Pressable>
          </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Password input with a trailing eye toggle to reveal/hide the characters.
function PasswordField({ value, onChangeText, placeholder, show, onToggle, marginTop }: {
  value: string; onChangeText: (v: string) => void; placeholder: string;
  show: boolean; onToggle: () => void; marginTop?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', ...inputStyle, paddingVertical: 0, marginTop }}>
      <TextInput
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={colors.textMuted}
        secureTextEntry={!show} autoCapitalize="none" autoCorrect={false}
        style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: space(4) }}
      />
      <Pressable onPress={onToggle} hitSlop={8} style={{ paddingLeft: space(2) }} accessibilityRole="button">
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function HandleHint({ status }: { status: HandleStatus }) {
  const { t } = useTranslation();
  if (status === 'invalid') return <Text style={hint}>{t('auth.hintInvalid')}</Text>;
  if (status === 'taken') return <Text style={[hint, { color: colors.danger }]}>{t('auth.hintTaken')}</Text>;
  return <Text style={hint}>{t('auth.hintDefault')}</Text>;
}

// Post-signup confirmation: replaces the form so the user isn't left staring at filled
// fields. Offers a resend button gated by a visible countdown.
function CheckEmailView({ email, secondsLeft, busy, message, onResend, onBack }: {
  email: string; secondsLeft: number; busy: boolean; message: string | null;
  onResend: () => void; onBack: () => void;
}) {
  const { t } = useTranslation();
  const canResend = secondsLeft <= 0 && !busy;
  const time = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  return (
    <View style={{ marginTop: space(4) }}>
      <View style={{
        width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface,
        borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
        alignSelf: 'flex-start', marginBottom: space(5),
      }}>
        <Ionicons name="mail-outline" size={30} color={colors.accent} />
      </View>

      <Text style={[font.display, { fontSize: 24, marginBottom: space(2) }]}>{t('auth.checkEmailTitle')}</Text>
      <Text style={[font.muted, { marginBottom: space(2), lineHeight: 20 }]}>
        {t('auth.checkEmailBody', { email })}
      </Text>
      <Text style={[font.muted, { marginBottom: space(6), lineHeight: 20 }]}>
        {t('auth.checkEmailSpam')}
      </Text>

      <Pressable onPress={onResend} disabled={!canResend} accessibilityRole="button"
        style={{
          borderColor: colors.border, borderWidth: 1, borderRadius: radius.md,
          padding: space(4), alignItems: 'center', opacity: canResend ? 1 : 0.6,
        }}>
        {busy ? <ActivityIndicator color={colors.text} />
          : <Text style={{ color: canResend ? colors.accent : colors.textMuted, fontWeight: '700', fontSize: 15 }}>
              {secondsLeft > 0 ? t('auth.resendCountdown', { time }) : t('auth.resendCta')}
            </Text>}
      </Pressable>

      {message && <Text style={{ color: colors.textMuted, marginTop: space(3), textAlign: 'center' }}>{message}</Text>}

      <Pressable onPress={onBack} style={{ marginTop: space(6), alignItems: 'center' }} accessibilityRole="button">
        <Text style={{ color: colors.accent, fontWeight: '700' }}>{t('auth.backToSignIn')}</Text>
      </Pressable>
    </View>
  );
}

function translateError(m: string | undefined, t: TFunction) {
  if (!m) return t('auth.errGeneric');
  if (/already registered|already been registered/i.test(m)) return t('auth.errAlreadyRegistered');
  if (/invalid login credentials/i.test(m)) return t('auth.errInvalidCreds');
  if (/password should be at least/i.test(m)) return t('auth.errPasswordShort');
  if (/unable to validate email|invalid format/i.test(m)) return t('auth.errInvalidEmail');
  return m;
}

const inputStyle = {
  backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
  borderRadius: radius.md, paddingHorizontal: space(4), paddingVertical: space(4), color: colors.text, fontSize: 15,
} as const;
const hint = { color: colors.textMuted, fontSize: 12, marginTop: space(1), marginLeft: space(1) } as const;
