import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Alert, Platform, Switch, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, space, font, radius } from '../src/theme';
import { useSession } from '../src/auth/session';
import { supabase } from '../src/lib/supabase';
import { deleteAccount } from '../src/moderation';
import { useQuery } from '../src/useData';
import { tvLite, movieLiteById, movieLiteByTitle, tmdbImg } from '../src/tmdb';
import { Modal } from 'react-native';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { session, account, updateAccount, signOut } = useSession();

  const [handle, setHandle] = useState(account?.handle ?? '');
  const [displayName, setDisplayName] = useState(account?.display_name ?? '');
  const [bio, setBio] = useState(account?.bio ?? '');
  const [avatar, setAvatar] = useState(account?.avatar_url ?? '');
  const [banner, setBanner] = useState(account?.banner_url ?? '');
  const [isPublic, setIsPublic] = useState(account?.is_public ?? true);
  const [uploading, setUploading] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerBusy, setBannerBusy] = useState<string | null>(null);
  const { data: libShows } = useQuery((d) => d.getShows());
  const { data: libMovies } = useQuery((d) => d.getMovies(200));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function save() {
    setMsg(null); setOk(false);
    const h = handle.trim().toLowerCase();
    if (!HANDLE_RE.test(h)) { setMsg(t('account.handleError')); return; }
    setBusy(true);
    if (h !== account?.handle) {
      const { data } = await supabase.rpc('is_handle_available', { p_handle: h });
      if (data === false) { setBusy(false); setMsg(t('account.handleTaken')); return; }
    }
    const { error } = await updateAccount({
      handle: h,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatar.trim() || null,
      banner_url: banner.trim() || null,
      is_public: isPublic,
    });
    setBusy(false);
    if (error) setMsg(error); else { setOk(true); setTimeout(() => setOk(false), 2000); }
  }

  // Web: real file picker -> Supabase Storage (bucket 'avatars', path {uid}/...). Native: URL field below.
  async function uploadAvatarWeb() {
    const doc: any = (globalThis as any).document;
    if (!doc || !account) return;
    const input = doc.createElement('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) { setMsg(t('account.avatarTooBig')); return; }
      setUploading(true); setMsg(null);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${account.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (error) setMsg(error.message);
      else {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        if (data?.publicUrl) setAvatar(data.publicUrl);
      }
      setUploading(false);
    };
    input.click();
  }

  // Banner = backdrop of a show/movie from your library, like TV Time.
  async function pickBanner(kind: 'tv' | 'movie', keyOrUuid: string, title: string, year: number | null) {
    setBannerBusy(keyOrUuid);
    try {
      const lite = kind === 'tv'
        ? await tvLite(Number(keyOrUuid))
        : keyOrUuid.startsWith('tmdb:') ? await movieLiteById(Number(keyOrUuid.slice(5))) : await movieLiteByTitle(title, year);
      const url = tmdbImg(lite?.backdrop ?? null, 'w780');
      if (url) { setBanner(url); setBannerOpen(false); }
      else setMsg(t('account.noBackdrop'));
    } finally { setBannerBusy(null); }
  }

  const onSignOut = () => {
    const go = async () => { await signOut(); if (Platform.OS === 'web') (globalThis as any).location?.reload(); else router.replace('/'); };
    if (Platform.OS === 'web') { if ((globalThis as any).confirm?.(t('settings.confirmSignOutWeb'))) go(); }
    else Alert.alert(t('settings.signOut'), t('account.confirmSignOutShort'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('settings.signOut'), style: 'destructive', onPress: go }]);
  };

  // Google Play requires in-app account deletion. Two-step confirm; on web the second
  // step asks to type the @handle to avoid accidental taps.
  const [deleting, setDeleting] = useState(false);
  const onDeleteAccount = () => {
    if (!account) return;
    const go = async () => {
      setDeleting(true);
      const { error } = await deleteAccount();
      setDeleting(false);
      if (error) { setMsg(t('account.deleteErr')); return; }
      await signOut();
      if (Platform.OS === 'web') (globalThis as any).location?.reload(); else router.replace('/');
    };
    if (Platform.OS === 'web') {
      const typed = (globalThis as any).prompt?.(t('account.deleteConfirmWeb', { handle: account.handle }));
      if (typed != null && String(typed).trim().toLowerCase() === account.handle.toLowerCase()) go();
      else if (typed != null) setMsg(t('account.deleteHandleMismatch'));
    } else {
      Alert.alert(t('account.deleteAccount'), t('account.deleteConfirm1'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('account.deleteContinue'), style: 'destructive',
          onPress: () => Alert.alert(t('account.deleteAccount'), t('account.deleteConfirm2'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('account.deleteForever'), style: 'destructive', onPress: go },
          ]),
        },
      ]);
    }
  };

  if (!account) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>;
  }

  const initial = (displayName || handle || '?').trim().charAt(0).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={back} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('account.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }} keyboardShouldPersistTaps="handled">
        {banner.trim() ? (
          <View style={s.bannerWrap}>
            <Image source={{ uri: banner.trim() }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <Pressable style={s.bannerRemove} onPress={() => setBanner('')} hitSlop={8}><Ionicons name="trash-outline" size={16} color={colors.text} /></Pressable>
          </View>
        ) : null}
        <View style={{ alignItems: 'center', gap: space(2), marginBottom: space(2), marginTop: banner.trim() ? -space(8) : 0 }}>
          {avatar.trim()
            ? <Image source={{ uri: avatar.trim() }} style={s.avatar} contentFit="cover" />
            : <View style={[s.avatar, s.avatarFallback]}><Text style={{ color: colors.text, fontSize: 34, fontWeight: '800' }}>{initial}</Text></View>}
          <Text style={font.h2}>@{account.handle}</Text>
          <Text style={font.muted}>{session?.user?.email}</Text>
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            {Platform.OS === 'web' && (
              <Pressable style={s.smallBtn} onPress={uploadAvatarWeb} disabled={uploading}>
                {uploading ? <ActivityIndicator size="small" color={colors.text} /> : <><Ionicons name="camera-outline" size={15} color={colors.text} /><Text style={s.smallBtnText}>  {t('account.uploadPhoto')}</Text></>}
              </Pressable>
            )}
            <Pressable style={s.smallBtn} onPress={() => setBannerOpen(true)}>
              <Ionicons name="image-outline" size={15} color={colors.text} />
              <Text style={s.smallBtnText}>  {t('account.chooseBanner')}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={s.section}>{t('account.profile')}</Text>
        <View style={s.group}>
          <Field label={t('account.fieldHandle')}>
            <TextInput value={handle} onChangeText={(v) => setHandle(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} autoCapitalize="none" autoCorrect={false} style={s.input} placeholder={t('account.phUsername')} placeholderTextColor={colors.textMuted} />
          </Field>
          <View style={s.sep} />
          <Field label={t('account.fieldName')}>
            <TextInput value={displayName} onChangeText={setDisplayName} style={s.input} placeholder={t('account.phName')} placeholderTextColor={colors.textMuted} />
          </Field>
          <View style={s.sep} />
          <Field label={t('account.fieldBio')}>
            <TextInput value={bio} onChangeText={setBio} style={[s.input, { minHeight: 60 }]} multiline placeholder={t('account.phBio')} placeholderTextColor={colors.textMuted} />
          </Field>
          <View style={s.sep} />
          <Field label={t('account.fieldAvatar')}>
            <TextInput value={avatar} onChangeText={setAvatar} autoCapitalize="none" autoCorrect={false} style={s.input} placeholder="https://…" placeholderTextColor={colors.textMuted} />
          </Field>
        </View>

        <View style={s.group}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, paddingRight: space(3) }}>
              <Text style={font.h2}>{t('account.publicProfile')}</Text>
              <Text style={font.muted}>{t('account.publicProfileSub')}</Text>
            </View>
            <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
          </View>
        </View>
        {account.is_public === false && (
          <View style={s.group}>
            <Pressable style={s.row} onPress={() => router.push('/requests')}>
              <View style={s.rowIcon}><Ionicons name="person-add-outline" size={20} color={colors.text} /></View>
              <View style={{ flex: 1, marginLeft: space(3) }}>
                <Text style={font.h2}>{t('account.followRequests')}</Text>
                <Text style={font.muted}>{t('account.followRequestsSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {msg && <Text style={{ color: colors.danger, textAlign: 'center' }}>{msg}</Text>}
        {ok && <Text style={{ color: colors.success, textAlign: 'center', fontWeight: '700' }}>{t('account.saved')}</Text>}

        <Pressable onPress={save} disabled={busy} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: space(4), alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color={colors.accentInk} /> : <Text style={{ color: colors.accentInk, fontWeight: '800', fontSize: 16 }}>{t('account.saveChanges')}</Text>}
        </Pressable>

        <View style={[s.group, { marginTop: space(2) }]}>
          <Pressable style={s.row} onPress={onSignOut}>
            <View style={[s.rowIcon, { backgroundColor: '#e5484d22' }]}><Ionicons name="log-out-outline" size={20} color={colors.danger} /></View>
            <Text style={[font.h2, { color: colors.danger, marginLeft: space(3) }]}>{t('account.signOut')}</Text>
          </Pressable>
        </View>

        <Text style={[s.section, { marginTop: space(2) }]}>{t('account.dangerZone')}</Text>
        <View style={[s.group, { borderColor: colors.danger + '55' }]}>
          <Pressable style={s.row} onPress={onDeleteAccount} disabled={deleting}>
            <View style={[s.rowIcon, { backgroundColor: '#e5484d22' }]}>
              {deleting ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={20} color={colors.danger} />}
            </View>
            <View style={{ flex: 1, marginLeft: space(3) }}>
              <Text style={[font.h2, { color: colors.danger }]}>{t('account.deleteAccount')}</Text>
              <Text style={font.muted}>{t('account.deleteAccountSub')}</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={bannerOpen} transparent animationType="fade" onRequestClose={() => setBannerOpen(false)}>
        <View style={s.pickOverlay}>
          <View style={s.pickSheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(2) }}>
              <Text style={[font.h1, { fontSize: 20, flex: 1 }]}>{t('account.fieldBanner')}</Text>
              <Pressable onPress={() => setBannerOpen(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
            </View>
            <Text style={[font.muted, { marginBottom: space(3) }]}>{t('account.bannerHint')}</Text>
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), justifyContent: 'center' }}>
              {(libShows ?? []).map((sh) => (
                <Pressable key={'s' + sh.tvdb_id} style={s.pickCell} onPress={() => pickBanner('tv', String(sh.tvdb_id), sh.title, null)}>
                  <Image source={{ uri: sh.poster ?? undefined }} style={s.pickImg} contentFit="cover" />
                  {bannerBusy === String(sh.tvdb_id) ? <View style={s.pickBusy}><ActivityIndicator color={colors.accent} /></View> : null}
                  <Text style={[font.muted, { fontSize: 10 }]} numberOfLines={1}>{sh.title}</Text>
                </Pressable>
              ))}
              {(libMovies ?? []).map((m) => m.uuid ? (
                <Pressable key={'m' + m.uuid} style={s.pickCell} onPress={() => pickBanner('movie', m.uuid as string, m.title, m.year)}>
                  <Image source={{ uri: m.poster ?? undefined }} style={s.pickImg} contentFit="cover" />
                  {bannerBusy === m.uuid ? <View style={s.pickBusy}><ActivityIndicator color={colors.accent} /></View> : null}
                  <Text style={[font.muted, { fontSize: 10 }]} numberOfLines={1}>{m.title}</Text>
                </Pressable>
              ) : null)}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ padding: space(3), gap: space(1) }}>
      <Text style={{ ...font.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  section: { ...font.muted, textTransform: 'uppercase', fontSize: 12, letterSpacing: 1, marginLeft: space(1) },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: space(3) },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  input: { color: colors.text, fontSize: 15, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: space(3), paddingVertical: space(3) },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: space(3) },
  bannerWrap: { height: 130, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  bannerRemove: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface },
  smallBtnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  pickOverlay: { flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: space(4) },
  pickSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), width: '100%', maxWidth: 620, maxHeight: '85%' },
  pickCell: { width: 92 },
  pickImg: { width: 92, height: 138, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  pickBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center' },
});
