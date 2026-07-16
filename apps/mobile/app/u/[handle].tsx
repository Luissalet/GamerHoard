import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Modal, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, space, font, radius } from '../../src/theme';
import { getProfileByHandle, getFollowState, getFollowCounts, followUser, unfollowUser, getReviewsByAuthor, logActivity, type PublicProfile, type FollowStatus, type AuthoredReview } from '../../src/social';
import { useSession } from '../../src/auth/session';
import { ShareButton } from '../../src/ShareButton';
import { isBlockedByMe, blockUser, unblockUser } from '../../src/moderation';
import { ReportSheet } from '../../src/ReportSheet';

export default function UserProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { account } = useSession();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fstate, setFstate] = useState<FollowStatus>('none');
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState<AuthoredReview[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const loadFollow = useCallback(async (id: string) => {
    const [st, c] = await Promise.all([getFollowState(id), getFollowCounts(id)]);
    setFstate(st); setCounts(c);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const p = await getProfileByHandle(String(handle));
      if (!alive) return;
      setProfile(p); setLoading(false);
      if (p) {
        loadFollow(p.id);
        getReviewsByAuthor(p.id).then((r) => { if (alive) setReviews(r); });
        isBlockedByMe(p.id).then((b) => { if (alive) setBlocked(b); });
      }
    })();
    return () => { alive = false; };
  }, [handle]);

  const isMe = !!(account && profile && account.id === profile.id);

  const doBlock = useCallback(async () => {
    if (!profile) return;
    setMenuOpen(false);
    const go = async () => {
      const { error } = await blockUser(profile.id);
      if (!error) { setBlocked(true); setFstate('none'); setReviews([]); loadFollow(profile.id); }
    };
    if (Platform.OS === 'web') { if ((globalThis as any).confirm?.(t('block.confirmWeb', { handle: profile.handle }))) go(); }
    else Alert.alert(t('block.confirmTitle', { handle: profile.handle }), t('block.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('block.block'), style: 'destructive', onPress: go },
    ]);
  }, [profile, t, loadFollow]);

  const doUnblock = useCallback(async () => {
    if (!profile) return;
    setMenuOpen(false);
    const { error } = await unblockUser(profile.id);
    if (!error) {
      setBlocked(false);
      loadFollow(profile.id);
      getReviewsByAuthor(profile.id).then(setReviews);
    }
  }, [profile, loadFollow]);
  const initial = (profile?.display_name || profile?.handle || '?').trim().charAt(0).toUpperCase();

  const onFollow = useCallback(async () => {
    if (!profile || busy) return;
    setBusy(true);
    if (fstate === 'none') {
      const st = await followUser(profile.id); setFstate(st);
      if (st !== 'none') logActivity('followed', { entityType: 'user', entityKey: profile.id, title: profile.display_name ?? profile.handle, meta: { targetHandle: profile.handle } });
      if (st === 'accepted') getReviewsByAuthor(profile.id).then(setReviews);
    }
    else { await unfollowUser(profile.id); setFstate('none'); }
    await loadFollow(profile.id);
    setBusy(false);
  }, [profile, fstate, busy, loadFollow]);

  const goList = (type: 'followers' | 'following') => {
    if (profile) router.push({ pathname: '/follows', params: { handle: profile.handle, type } });
  };

  const followBtn = () => {
    const label = fstate === 'accepted' ? t('userProfile.following') : fstate === 'pending' ? t('userProfile.requested') : profile?.is_public ? t('userProfile.follow') : t('userProfile.requestFollow');
    const filled = fstate === 'none';
    return (
      <Pressable onPress={onFollow} disabled={busy} style={[filled ? s.btn : s.btnOutline, { opacity: busy ? 0.6 : 1, marginTop: space(4) }]}>
        {busy ? <ActivityIndicator color={filled ? colors.accentInk : colors.text} size="small" /> : (
          <>
            {fstate === 'accepted' ? <Ionicons name="checkmark" size={16} color={colors.text} /> : fstate === 'pending' ? <Ionicons name="time-outline" size={16} color={colors.text} /> : <Ionicons name="person-add-outline" size={16} color={colors.accentInk} />}
            <Text style={{ color: filled ? colors.accentInk : colors.text, fontWeight: '800', marginLeft: 6 }}>{label}</Text>
          </>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={[font.h1, { flex: 1 }]} numberOfLines={1}>{profile ? '@' + profile.handle : t('userProfile.profile')}</Text>
        {profile ? <ShareButton title={profile.display_name ?? '@' + profile.handle} path={`/u/${profile.handle}`} top={6} /> : null}
        {profile && !isMe && account ? (
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={s.backBtn}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space(8) }} color={colors.accent} />
      ) : !profile ? (
        <View style={{ padding: space(6), alignItems: 'center', gap: space(2) }}>
          <Ionicons name="person-outline" size={40} color={colors.textMuted} />
          <Text style={font.h2}>{t('userProfile.profileUnavailable')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: space(8) }}>
          {profile.banner_url ? (
            <View style={s.banner}><Image source={{ uri: profile.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" /><View style={s.bannerShade} /></View>
          ) : null}
          <View style={{ padding: space(5), paddingTop: profile.banner_url ? 0 : space(5), alignItems: 'center', gap: space(2), marginTop: profile.banner_url ? -space(10) : 0 }}>
          {profile.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} contentFit="cover" />
            : <View style={[s.avatar, s.avatarFallback]}><Text style={{ color: colors.text, fontSize: 40, fontWeight: '800' }}>{initial}</Text></View>}
          {profile.display_name ? <Text style={[font.h1, { marginTop: space(2) }]}>{profile.display_name}</Text> : null}
          <Text style={[font.muted, { fontSize: 15 }]}>@{profile.handle}{profile.is_public ? '' : t('userProfile.privateSuffix')}</Text>
          {profile.bio ? <Text style={[font.body, { textAlign: 'center', marginTop: space(2), color: colors.textMuted }]}>{profile.bio}</Text> : null}

          <View style={s.countsRow}>
            <Pressable style={s.count} onPress={() => goList('followers')}>
              <Text style={font.h1}>{counts.followers}</Text><Text style={font.muted}>{t('userProfile.followers')}</Text>
            </Pressable>
            <View style={s.countDiv} />
            <Pressable style={s.count} onPress={() => goList('following')}>
              <Text style={font.h1}>{counts.following}</Text><Text style={font.muted}>{t('userProfile.followingCount')}</Text>
            </Pressable>
          </View>

          {isMe
            ? <Pressable style={[s.btnOutline, { marginTop: space(4) }]} onPress={() => router.push('/account')}><Text style={{ color: colors.text, fontWeight: '700' }}>{t('userProfile.editProfile')}</Text></Pressable>
            : blocked
              ? <Pressable style={[s.btnOutline, { marginTop: space(4), borderColor: colors.danger }]} onPress={doUnblock}><Ionicons name="ban" size={16} color={colors.danger} /><Text style={{ color: colors.danger, fontWeight: '800', marginLeft: 6 }}>{t('block.unblock')}</Text></Pressable>
              : followBtn()}

          {!isMe && blocked && (
            <Text style={[font.muted, { fontSize: 12, marginTop: space(2), textAlign: 'center' }]}>{t('block.youBlocked')}</Text>
          )}
          {!isMe && !blocked && !profile.is_public && fstate !== 'accepted' && (
            <Text style={[font.muted, { fontSize: 12, marginTop: space(2), textAlign: 'center' }]}>{t('userProfile.privateNote')}</Text>
          )}
          </View>

          {(reviews?.length ?? 0) > 0 && (
            <View style={{ paddingHorizontal: space(4), gap: space(2) }}>
              <Text style={[font.h1, { fontSize: 20, marginBottom: space(1) }]}>{t('userProfile.recentReviews')}</Text>
              {(reviews ?? []).map((r) => (
                <Pressable
                  key={r.id}
                  style={s.reviewCard}
                  onPress={() => {
                    const k = r.entity_key;
                    if (r.entity_type === 'show') router.push(`/show/${k}`);
                    else if (r.entity_type === 'movie') router.push(`/movie/${k}`);
                    else if (r.entity_type === 'episode') { const [tv, se2, ep] = k.split(':'); router.push(`/episode/${tv}-${se2}-${ep}`); }
                  }}
                >
                  {r.rating != null ? <Text style={{ color: colors.accent }}>{'★'.repeat(Math.min(5, r.rating))}</Text> : null}
                  {r.body ? <Text style={[font.body, { color: colors.text, marginTop: 4 }]} numberOfLines={3}>{r.contains_spoiler ? '⚠️ ' : ''}{r.body}</Text> : null}
                  <Text style={[font.muted, { fontSize: 11, marginTop: 4 }]}>{r.created_at.slice(0, 10)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={s.menuSheet}>
            <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); setReportOpen(true); }}>
              <Ionicons name="flag-outline" size={20} color={colors.text} />
              <Text style={s.menuText}>{t('report.titleUser')}</Text>
            </Pressable>
            <View style={s.menuSep} />
            <Pressable style={s.menuItem} onPress={blocked ? doUnblock : doBlock}>
              <Ionicons name="ban-outline" size={20} color={colors.danger} />
              <Text style={[s.menuText, { color: colors.danger }]}>{blocked ? t('block.unblock') : t('block.block')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {reportOpen && profile ? (
        <ReportSheet
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="user"
          targetProfileId={profile.id}
          targetLabel={'@' + profile.handle}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  countsRow: { flexDirection: 'row', alignItems: 'center', marginTop: space(4), backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  count: { alignItems: 'center', paddingVertical: space(3), paddingHorizontal: space(6) },
  countDiv: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(6), paddingVertical: space(3), minWidth: 160 },
  btnOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space(6), paddingVertical: space(3), minWidth: 160 },
  banner: { height: 150, backgroundColor: colors.surfaceAlt },
  bannerShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,15,20,0.35)' },
  reviewCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(3) },
  menuOverlay: { flex: 1, backgroundColor: '#0007', alignItems: 'flex-end', paddingTop: space(12), paddingRight: space(3) },
  menuSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', minWidth: 210 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  menuText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  menuSep: { height: 1, backgroundColor: colors.border },
});
