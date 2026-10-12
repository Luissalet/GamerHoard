import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { useSession } from '../src/auth/session';
import { getReports, resolveReport, setBan, banInfo, type ModReport, type ReportStatus, type ModAction } from '../src/moderation';

// Staff-only report queue (Play UGC: reports must actually get reviewed).
// Actions: dismiss · remove content · suspend 7/30 days · permanent — bans on a review
// report also delete the reported review (delete_and_ban).
export default function ModerationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { account } = useSession();
  const isStaff = account?.role === 'moderator' || account?.role === 'admin';

  const [status, setStatus] = useState<ReportStatus>('pending');
  const [reports, setReports] = useState<ModReport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (st: ReportStatus) => {
    setReports(null);
    setReports(await getReports(st));
  }, []);
  useEffect(() => { if (isStaff) load(status); }, [isStaff, status, load]);

  const confirmThen = (title: string, body: string, go: () => void) => {
    if (Platform.OS === 'web') { if ((globalThis as any).confirm?.(title + '\n\n' + body)) go(); }
    else Alert.alert(title, body, [{ text: t('common.cancel'), style: 'cancel' }, { text: t('mod.confirmDo'), style: 'destructive', onPress: go }]);
  };

  const act = (r: ModReport, action: ModAction, banDays: number | null, label: string) => {
    confirmThen(label, t('mod.confirmBody', { handle: r.target?.handle ?? '?' }), async () => {
      setBusy(r.id);
      const { error } = await resolveReport(r.id, action, banDays);
      setBusy(null);
      if (!error) load(status);
    });
  };

  const unban = async (r: ModReport) => {
    setBusy(r.id);
    const { error } = await setBan(r.target_profile_id, 0);
    setBusy(null);
    if (!error) load(status);
  };

  if (!isStaff) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, alignItems: 'center', justifyContent: 'center', gap: space(3), padding: space(6) }}>
        <Ionicons name="shield-outline" size={40} color={colors.textMuted} />
        <Text style={[font.h2, { textAlign: 'center' }]}>{t('mod.notAuthorized')}</Text>
        <Pressable style={s.chip} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><Text style={{ color: colors.text, fontWeight: '700' }}>{t('common.back')}</Text></Pressable>
      </View>
    );
  }

  const STATUSES: ReportStatus[] = ['pending', 'actioned', 'dismissed'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={s.backBtn}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={font.h1}>{t('mod.title')}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: space(2), paddingHorizontal: space(4), paddingVertical: space(3) }}>
        {STATUSES.map((st) => (
          <Pressable key={st} style={[s.chip, status === st && s.chipActive]} onPress={() => setStatus(st)}>
            <Text style={{ color: status === st ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 13 }}>{t('mod.status_' + st)}</Text>
          </Pressable>
        ))}
      </View>

      {reports == null ? (
        <ActivityIndicator style={{ marginTop: space(8) }} color={colors.accent} />
      ) : reports.length === 0 ? (
        <View style={{ padding: space(6), alignItems: 'center', gap: space(2) }}>
          <Ionicons name="checkmark-done-outline" size={40} color={colors.textMuted} />
          <Text style={font.muted}>{t('mod.noReports')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3), paddingBottom: space(8) }}>
          {reports.map((r) => {
            const ban = banInfo(r.target?.banned_until);
            return (
              <View key={r.id} style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), flexWrap: 'wrap' }}>
                  <View style={s.reasonBadge}><Text style={{ color: colors.accentInk, fontWeight: '800', fontSize: 12 }}>{t('report.reason_' + r.reason)}</Text></View>
                  <Text style={[font.muted, { fontSize: 12 }]}>{t(r.target_type === 'user' ? 'mod.typeUser' : 'mod.typeReview')}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[font.muted, { fontSize: 12 }]}>{r.created_at.slice(0, 10)}</Text>
                </View>

                <Pressable onPress={() => r.target && router.push(`/u/${r.target.handle}`)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(2), gap: 6 }}>
                  <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                  <Text style={[font.h2, { color: colors.accent }]}>@{r.target?.handle ?? '?'}</Text>
                  {ban.active ? <View style={s.bannedBadge}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>{t('mod.bannedChip')}</Text></View> : null}
                </Pressable>

                {r.content_snapshot ? (
                  <View style={s.snapshot}><Text style={[font.body, { color: colors.textMuted, fontStyle: 'italic' }]} numberOfLines={6}>"{r.content_snapshot}"</Text></View>
                ) : null}
                {r.details ? <Text style={[font.body, { color: colors.text, marginTop: space(2) }]} numberOfLines={4}>{r.details}</Text> : null}
                <Text style={[font.muted, { fontSize: 12, marginTop: space(2) }]}>{t('mod.reportedBy', { handle: r.reporter?.handle ?? '?' })}</Text>

                {status === 'pending' ? (
                  busy === r.id ? <ActivityIndicator style={{ marginTop: space(3) }} color={colors.accent} /> : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(3) }}>
                      <Pressable style={s.actBtn} onPress={() => act(r, 'dismiss', null, t('mod.dismiss'))}>
                        <Text style={s.actText}>{t('mod.dismiss')}</Text>
                      </Pressable>
                      {r.target_review_id ? (
                        <Pressable style={s.actBtn} onPress={() => act(r, 'delete_content', null, t('mod.deleteContent'))}>
                          <Text style={s.actText}>{t('mod.deleteContent')}</Text>
                        </Pressable>
                      ) : null}
                      <Pressable style={[s.actBtn, s.actDanger]} onPress={() => act(r, r.target_review_id ? 'delete_and_ban' : 'ban', 7, t('mod.ban7'))}>
                        <Text style={[s.actText, { color: colors.danger }]}>{t('mod.ban7')}</Text>
                      </Pressable>
                      <Pressable style={[s.actBtn, s.actDanger]} onPress={() => act(r, r.target_review_id ? 'delete_and_ban' : 'ban', 30, t('mod.ban30'))}>
                        <Text style={[s.actText, { color: colors.danger }]}>{t('mod.ban30')}</Text>
                      </Pressable>
                      <Pressable style={[s.actBtn, s.actDanger]} onPress={() => act(r, r.target_review_id ? 'delete_and_ban' : 'ban', null, t('mod.banPerm'))}>
                        <Text style={[s.actText, { color: colors.danger }]}>{t('mod.banPerm')}</Text>
                      </Pressable>
                    </View>
                  )
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(3), gap: space(2), flexWrap: 'wrap' }}>
                    <Text style={[font.muted, { fontSize: 12 }]}>{t('mod.resolvedAs', { res: r.resolution ?? r.status })}</Text>
                    <View style={{ flex: 1 }} />
                    {ban.active ? (
                      busy === r.id ? <ActivityIndicator size="small" color={colors.accent} /> : (
                        <Pressable style={s.actBtn} onPress={() => unban(r)}><Text style={s.actText}>{t('mod.unban')}</Text></Pressable>
                      )
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2), backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4) },
  reasonBadge: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: 3 },
  bannedBadge: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6 },
  snapshot: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: space(3), marginTop: space(2) },
  actBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) },
  actDanger: { borderColor: colors.danger + '66' },
  actText: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
