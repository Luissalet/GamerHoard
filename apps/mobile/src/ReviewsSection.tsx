import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { colors, space, font, radius } from './theme';
import { useSession } from './auth/session';
import {
  getReviewsForEntity, getMyReview, upsertReview, deleteReview, ratingSummary,
  getMyLikedReviewIds, toggleReviewLike, logActivity, type Review, type EntityKind,
} from './social';
import { ReportSheet } from './ReportSheet';

function ago(iso: string, t: TFunction): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return t('reviews.agoNow');
  if (d < 3600) return t('reviews.agoMin', { n: Math.floor(d / 60) });
  if (d < 86400) return t('reviews.agoHour', { n: Math.floor(d / 3600) });
  if (d < 2592000) return t('reviews.agoDay', { n: Math.floor(d / 86400) });
  const dd = new Date(iso); return isNaN(dd.getTime()) ? '' : dd.toISOString().slice(0, 10);
}

function Stars({ value, size = 16, onChange }: { value: number | null; size?: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={4}>
          <Ionicons name={(value ?? 0) >= n ? 'star' : 'star-outline'} size={size} color={colors.accent} style={{ marginRight: 3 }} />
        </Pressable>
      ))}
    </View>
  );
}

export function ReviewsSection({ kind, entityKey, activityTitle, activityPoster }: { kind: EntityKind; entityKey: string; activityTitle?: string; activityPoster?: string | null }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { account } = useSession();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [myId, setMyId] = useState<string | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [myBody, setMyBody] = useState('');
  const [mySpoiler, setMySpoiler] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Review | null>(null);

  const load = useCallback(async () => {
    const [list, mine] = await Promise.all([getReviewsForEntity(kind, entityKey), getMyReview(kind, entityKey)]);
    setReviews(list);
    setLiked(await getMyLikedReviewIds(list.map((r) => r.id)));
    if (mine) { setMyId(mine.id); setMyRating(mine.rating); setMyBody(mine.body ?? ''); setMySpoiler(mine.contains_spoiler); }
    else { setMyId(null); setMyRating(null); setMyBody(''); setMySpoiler(false); }
  }, [kind, entityKey]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setErr(null); setSaving(true);
    const { error } = await upsertReview(kind, entityKey, myRating, myBody, mySpoiler);
    setSaving(false);
    if (error) setErr(error);
    else {
      if (!myId) logActivity('reviewed', { entityType: kind, entityKey, title: activityTitle, poster: activityPoster ?? null, meta: { rating: myRating } });
      await load();
    }
  };
  const remove = async () => { if (myId) { await deleteReview(myId); await load(); } };
  const like = async (r: Review) => {
    const isLiked = liked.has(r.id);
    setLiked((s) => { const n = new Set(s); isLiked ? n.delete(r.id) : n.add(r.id); return n; });
    setReviews((rs) => rs?.map((x) => (x.id === r.id ? { ...x, like_count: Math.max(0, x.like_count + (isLiked ? -1 : 1)) } : x)) ?? rs);
    await toggleReviewLike(r.id, isLiked);
  };

  const summary = reviews ? ratingSummary(reviews) : { avg: null as number | null, count: 0 };
  const others = (reviews ?? []).filter((r) => r.author_id !== account?.id);

  return (
    <View style={{ marginTop: space(5) }}>
      <View style={s.headerRow}>
        <Text style={[font.h1, { fontSize: 20 }]}>{t('reviews.ratings')}</Text>
        {summary.avg != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <Stars value={Math.round(summary.avg)} />
            <Text style={font.muted}>{summary.avg.toFixed(1)} · {summary.count}</Text>
          </View>
        ) : <Text style={font.muted}>{t('reviews.beFirst')}</Text>}
      </View>

      {/* Your rating */}
      <View style={s.myBox}>
        <Text style={[font.muted, { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space(2) }]}>{t('reviews.yourRating')}</Text>
        <Stars value={myRating} size={30} onChange={setMyRating} />
        <TextInput
          value={myBody} onChangeText={setMyBody}
          placeholder={t('reviews.placeholder')} placeholderTextColor={colors.textMuted}
          multiline style={s.input}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(3), gap: space(3) }}>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setMySpoiler((v) => !v)}>
            <Ionicons name={mySpoiler ? 'checkbox' : 'square-outline'} size={20} color={mySpoiler ? colors.accent : colors.textMuted} />
            <Text style={font.muted}>{t('reviews.containsSpoiler')}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {myId ? <Pressable onPress={remove} hitSlop={8} style={{ padding: space(2) }}><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable> : null}
          <Pressable onPress={save} disabled={saving} style={[s.saveBtn, { opacity: saving ? 0.6 : 1 }]}>
            {saving ? <ActivityIndicator color={colors.accentInk} size="small" /> : <Text style={{ color: colors.accentInk, fontWeight: '800' }}>{myId ? t('reviews.update') : t('reviews.publish')}</Text>}
          </Pressable>
        </View>
        {err ? <Text style={{ color: colors.danger, marginTop: space(2) }}>{err}</Text> : null}
      </View>

      {/* Other people's reviews */}
      {reviews == null ? (
        <ActivityIndicator style={{ marginTop: space(4) }} color={colors.accent} />
      ) : others.length === 0 ? (
        <Text style={[font.muted, { paddingHorizontal: space(4), marginTop: space(3) }]}>{t('reviews.noOthers')}</Text>
      ) : (
        others.map((r) => {
          const isLiked = liked.has(r.id);
          const hide = r.contains_spoiler && !revealed.has(r.id);
          const initial = (r.author.display_name || r.author.handle || '?').trim().charAt(0).toUpperCase();
          return (
            <View key={r.id} style={s.review}>
              <Pressable style={s.reviewHead} onPress={() => router.push(`/u/${r.author.handle}`)}>
                {r.author.avatar_url
                  ? <Image source={{ uri: r.author.avatar_url }} style={s.avatar} contentFit="cover" />
                  : <View style={[s.avatar, s.avatarFallback]}><Text style={{ color: colors.text, fontWeight: '800' }}>{initial}</Text></View>}
                <View style={{ flex: 1, marginLeft: space(2) }}>
                  <Text style={font.h2} numberOfLines={1}>{r.author.display_name || '@' + r.author.handle}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                    {r.rating != null ? <Stars value={r.rating} size={13} /> : null}
                    <Text style={[font.muted, { fontSize: 12 }]}>{ago(r.created_at, t)}</Text>
                  </View>
                </View>
              </Pressable>
              {r.body ? (
                hide ? (
                  <Pressable onPress={() => setRevealed((sv) => new Set(sv).add(r.id))} style={s.spoiler}>
                    <Ionicons name="eye-off-outline" size={16} color={colors.textMuted} />
                    <Text style={[font.muted, { marginLeft: 6 }]}>{t('reviews.spoilerTap')}</Text>
                  </Pressable>
                ) : <Text style={[font.body, { color: colors.text, marginTop: space(2), lineHeight: 20 }]}>{r.body}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(2) }}>
                <Pressable onPress={() => like(r)} style={[s.likeBtn, { marginTop: 0 }]} hitSlop={8}>
                  <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18} color={isLiked ? colors.danger : colors.textMuted} />
                  {r.like_count > 0 ? <Text style={[font.muted, { marginLeft: 6 }]}>{r.like_count}</Text> : null}
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => setReporting(r)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      {reporting ? (
        <ReportSheet
          visible={!!reporting}
          onClose={() => setReporting(null)}
          targetType="review"
          targetProfileId={reporting.author_id}
          targetReviewId={reporting.id}
          targetLabel={t('report.reviewBy', { handle: reporting.author.handle })}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), marginBottom: space(3) },
  myBox: { marginHorizontal: space(4), backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4) },
  input: { color: colors.text, fontSize: 15, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: space(3), marginTop: space(3), minHeight: 60, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(5), paddingVertical: space(3), minWidth: 96, alignItems: 'center' },
  review: { marginHorizontal: space(4), marginTop: space(3), paddingBottom: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  reviewHead: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  spoiler: { flexDirection: 'row', alignItems: 'center', marginTop: space(2), padding: space(3), backgroundColor: colors.surfaceAlt, borderRadius: radius.sm },
  likeBtn: { flexDirection: 'row', alignItems: 'center', marginTop: space(2), alignSelf: 'flex-start' },
});
