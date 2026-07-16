// Shared building blocks for the game-detail screen (GamerHoard).
// Adapted from Watch Hoard: "where to watch" -> "where to play", cast/director -> studio/publisher,
// TMDB score -> Metacritic, movie collection -> game saga/series.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Linking, Modal, ActivityIndicator, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { colors, space, font, radius } from './theme';
import { gameImg, collectionParts, posterOptions, type Details, type StoreLink, type PlatformRef, type NameRef, type RecItem, type PosterOption, type CollectionPart } from './rawg';

// ---------- meta line: year · playtime · #platforms · ESRB ----------
export function Meta({ det, fallbackYear }: { det: Details | null; fallbackYear?: number | null }) {
  const { t } = useTranslation();
  const parts: string[] = [];
  const y = det?.year || (fallbackYear ? String(fallbackYear) : null);
  if (y) parts.push(y);
  if (det?.playtime) parts.push(t('detail.playHours', { n: det.playtime }));
  if (det?.platforms?.length) parts.push(t('detail.platformCount', { n: det.platforms.length }));
  if (det?.esrb) parts.push(det.esrb);
  const rating = det?.rating ? det.rating.toFixed(1) : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
      {parts.length ? <Text style={font.muted}>{parts.join('  ·  ')}</Text> : null}
      {rating ? <Text style={{ color: colors.accent, fontWeight: '700', marginLeft: parts.length ? 8 : 0 }}>  ★ {rating}</Text> : null}
    </View>
  );
}

export function Genres({ genres }: { genres?: string[] }) {
  const router = useRouter();
  if (!genres?.length) return null;
  return (
    <View style={s.genreWrap}>
      {genres.map((g) => (
        <Pressable key={g} style={s.genre} onPress={() => router.push({ pathname: '/explore', params: { genre: g, ts: String(Date.now()) } })}>
          <Text style={s.genreText}>{g}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Where to PLAY (stores) ----------
export function WherePlay({ stores }: { stores?: StoreLink[] }) {
  const { t } = useTranslation();
  if (!stores?.length) return null;
  return (
    <View style={{ paddingHorizontal: space(4), marginTop: space(4) }}>
      <Text style={[font.h2, { marginBottom: space(2) }]}>{t('detail.whereToPlay')}</Text>
      <View style={s.rowWrap}>
        {stores.map((st) => (
          <Pressable key={st.id + st.slug} style={s.store} disabled={!st.url} onPress={() => st.url && Linking.openURL(st.url)}>
            <Ionicons name="cart-outline" size={15} color={colors.text} />
            <Text style={s.storeName}>{st.name}</Text>
            {st.url ? <Ionicons name="open-outline" size={13} color={colors.textMuted} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------- Platform ownership: chips you tap to mark which systems you own it on ----------
export function PlatformOwnership({ platforms, owned, onToggle }: { platforms?: PlatformRef[]; owned: Set<string>; onToggle: (slug: string) => void }) {
  const { t } = useTranslation();
  if (!platforms?.length) return null;
  return (
    <View style={{ paddingHorizontal: space(4), marginTop: space(4) }}>
      <Text style={[font.h2, { marginBottom: space(1) }]}>{t('detail.platforms')}</Text>
      <Text style={[font.muted, { marginBottom: space(2) }]}>{t('detail.platformsHint')}</Text>
      <View style={s.rowWrap}>
        {platforms.map((p) => {
          const on = owned.has(p.slug);
          return (
            <Pressable key={p.id + p.slug} style={[s.platChip, on && s.platChipOn]} onPress={() => onToggle(p.slug)}>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={on ? colors.accentInk : colors.textMuted} />
              <Text style={[s.platName, on && { color: colors.accentInk }]}>{p.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Studio / publisher (replaces director/creator + companies) ----------
export function StudioRow({ developers, publishers }: { developers?: NameRef[]; publishers?: NameRef[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const rows = [
    ...(developers ?? []).map((d) => ({ ...d, label: t('detail.developer') })),
    ...(publishers ?? []).map((p) => ({ ...p, label: t('detail.publisher') })),
  ];
  if (!rows.length) return null;
  // De-dupe (a studio can be both developer and publisher).
  const seen = new Set<string>();
  const uniq = rows.filter((r) => { const k = `${r.label}:${r.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return (
    <View style={{ paddingHorizontal: space(4), marginTop: space(4) }}>
      <View style={s.rowWrap}>
        {uniq.map((r) => (
          <Pressable key={`${r.label}:${r.id}`} style={s.studioChip} onPress={() => router.push(`/company/${r.id}`)}>
            <Ionicons name="business-outline" size={14} color={colors.textMuted} />
            <View>
              <Text style={s.studioName} numberOfLines={1}>{r.name}</Text>
              <Text style={s.studioRole}>{r.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Horizontal screenshot gallery. */
export function Screenshots({ gameId }: { gameId?: number | null }) {
  const { t } = useTranslation();
  const [imgs, setImgs] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    setImgs(null);
    if (gameId) posterOptions('tv', gameId).then((r) => { if (alive) setImgs(r.map((o) => o.path)); });
    return () => { alive = false; };
  }, [gameId]);
  if (!imgs?.length) return null;
  return (
    <View style={{ marginTop: space(5) }}>
      <Text style={[font.h2, { paddingHorizontal: space(4), marginBottom: space(3) }]}>{t('detail.screenshots')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
        {imgs.map((p) => (
          <Pressable key={p} onPress={() => Linking.openURL(p)}>
            <Image source={{ uri: p }} style={s.shot} contentFit="cover" transition={120} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function Trailer({ url }: { url?: string | null }) {
  const { t } = useTranslation();
  if (!url) return null;
  return (
    <Pressable style={s.trailer} onPress={() => Linking.openURL(url)}>
      <Ionicons name="play-circle" size={24} color={colors.text} />
      <Text style={[font.h2, { marginLeft: space(2) }]}>{t('detail.watchTrailer')}</Text>
    </Pressable>
  );
}

/** Open a game detail screen (kept named useOpenTmdb for compatibility with company/[id]). */
export function useOpenTmdb() {
  const router = useRouter();
  const [busyKey] = useState<string | null>(null);
  const open = useCallback((_kind: 'movie' | 'tv', id: number) => { router.push(`/show/${id}`); }, [router]);
  return { open, busyKey };
}
export const useOpenGame = useOpenTmdb;

export function AlsoPlayed({ items }: { items?: RecItem[] }) {
  const { t } = useTranslation();
  const { open } = useOpenTmdb();
  if (!items?.length) return null;
  return (
    <View style={{ marginTop: space(5) }}>
      <Text style={[font.h2, { paddingHorizontal: space(4), marginBottom: space(3) }]}>{t('detail.alsoPlayed')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
        {items.map((r) => (
          <Pressable key={`${r.kind}:${r.id}`} style={{ width: 150 }} onPress={() => open(r.kind, r.id)}>
            <Image source={{ uri: gameImg(r.poster) ?? undefined }} style={s.recShot} contentFit="cover" />
            <Text style={[font.muted, { marginTop: 4 }]} numberOfLines={1}>{r.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Game saga / series ("The Legend of Zelda", "Dark Souls", ...). */
export function SagaRow({ gameId, currentId }: { gameId?: number | null; currentId?: number | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [parts, setParts] = useState<CollectionPart[] | null>(null);
  useEffect(() => {
    let alive = true;
    setParts(null);
    if (gameId) collectionParts(gameId).then((p) => { if (alive) setParts(p); });
    return () => { alive = false; };
  }, [gameId]);
  if (!parts || parts.length < 1) return null;
  return (
    <View style={{ marginTop: space(5) }}>
      <Text style={[font.h2, { paddingHorizontal: space(4), marginBottom: space(3) }]}>{t('detail.saga')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
        {parts.map((p) => {
          const current = p.id === currentId;
          return (
            <Pressable key={p.id} style={{ width: 150, opacity: current ? 0.55 : 1 }} disabled={current} onPress={() => router.push(`/show/${p.id}`)}>
              <Image source={{ uri: gameImg(p.poster) ?? undefined }} style={[s.recShot, current && { borderWidth: 2, borderColor: colors.accent }]} contentFit="cover" />
              <Text style={[font.muted, { marginTop: 4 }]} numberOfLines={1}>{p.title}</Text>
              {p.year ? <Text style={[font.muted, { fontSize: 11 }]}>{p.year}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------- Your rating: 5 stars (tap = full star, long-press = half), stored 1-10 ----------
export function RatingStars({ value, onChange, size = 26 }: { value: number | null; onChange: (v: number | null) => void; size?: number }) {
  const { t } = useTranslation();
  return (
    <View style={s.ratingRow}>
      <Text style={[font.h2, { marginRight: space(2), fontSize: 14 }]}>{t('rating.your')}</Text>
      {[1, 2, 3, 4, 5].map((i) => {
        const v = value ?? 0;
        const icon: any = v >= i * 2 ? 'star' : v >= i * 2 - 1 ? 'star-half' : 'star-outline';
        return (
          <Pressable key={i} hitSlop={6} onPress={() => onChange(value === i * 2 ? null : i * 2)} onLongPress={() => onChange(i * 2 - 1)} delayLongPress={300}>
            <Ionicons name={icon} size={size} color={icon === 'star-outline' ? colors.textMuted : colors.accent} />
          </Pressable>
        );
      })}
      {value ? <Text style={[font.muted, { marginLeft: 8 }]}>{value}/10</Text> : null}
    </View>
  );
}

// ---------- Personal notes on a game ----------
export function NotesCard({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(value ?? '');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setText(value ?? ''); setDirty(false); }, [value]);
  return (
    <View style={{ paddingHorizontal: space(4), marginTop: space(5) }}>
      <Text style={[font.h2, { marginBottom: space(2) }]}>{t('notes.title')}</Text>
      <TextInput
        multiline
        value={text}
        onChangeText={(x) => { setText(x); setDirty(true); }}
        placeholder={t('notes.placeholder')}
        placeholderTextColor={colors.textMuted}
        style={[s.notesInput, { outlineStyle: 'none' } as any]}
      />
      {dirty && (
        <Pressable style={s.notesSave} onPress={() => { onSave(text.trim() || null); setDirty(false); }}>
          <Ionicons name="checkmark" size={16} color={colors.accentInk} />
          <Text style={{ color: colors.accentInk, fontWeight: '800' }}>  {t('notes.save')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------- Metacritic + game-site deep links ----------
export function Scores({ metacritic, rating, title, website }: { metacritic?: number | null; rating?: number | null; title: string; website?: string | null }) {
  const { t } = useTranslation();
  const q = encodeURIComponent(title);
  const links: { label: string; url: string }[] = [
    { label: 'Metacritic', url: `https://www.metacritic.com/search/${q}/?category=13` },
    { label: 'OpenCritic', url: `https://opencritic.com/search?q=${q}` },
    { label: 'HowLongToBeat', url: `https://howlongtobeat.com/?q=${q}` },
    { label: 'Backloggd', url: `https://backloggd.com/search/games/${q}/` },
  ];
  if (website) links.unshift({ label: t('detail.officialSite'), url: website });
  const mcColor = metacritic == null ? colors.textMuted : metacritic >= 75 ? colors.success : metacritic >= 50 ? colors.accent : colors.danger;
  return (
    <View style={{ paddingHorizontal: space(4), marginTop: space(5) }}>
      <Text style={[font.h2, { marginBottom: space(2) }]}>{t('detail.scores')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(2) }}>
        {metacritic != null ? (
          <View style={[s.mcBox, { borderColor: mcColor }]}>
            <Text style={[s.mcNum, { color: mcColor }]}>{metacritic}</Text>
            <Text style={s.mcLbl}>Metacritic</Text>
          </View>
        ) : null}
        {rating ? <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 16 }}>★ {rating.toFixed(1)}<Text style={font.muted}>  RAWG</Text></Text> : null}
      </View>
      <View style={s.rowWrap}>
        {links.map((l) => (
          <Pressable key={l.label} style={s.linkPill} onPress={() => Linking.openURL(l.url)}>
            <Ionicons name="open-outline" size={13} color={colors.textMuted} />
            <Text style={s.linkText}>{l.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------- Cover picker (choose from screenshots) ----------
export function PosterPickerModal({ visible, tmdbId, current, onClose, onPick }: {
  visible: boolean; kind?: 'tv' | 'movie'; tmdbId: number | null | undefined; current: string | null;
  onClose: () => void; onPick: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<PosterOption[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (visible && tmdbId) { setOptions(null); posterOptions('tv', tmdbId).then((o) => { if (alive) setOptions(o); }); }
    return () => { alive = false; };
  }, [visible, tmdbId]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.pickerOverlay}>
        <View style={s.pickerSheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(3) }}>
            <Text style={[font.h1, { fontSize: 20, flex: 1 }]}>{t('detail.chooseCover')}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
          </View>
          {!tmdbId ? <Text style={font.muted}>{t('detail.noCovers')}</Text> : options == null ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: space(6) }} />
          ) : options.length === 0 ? (
            <Text style={font.muted}>{t('detail.noCovers')}</Text>
          ) : (
            <ScrollView contentContainerStyle={s.pickerGrid}>
              {options.map((o) => {
                const url = o.path;
                const sel = current === url;
                return (
                  <Pressable key={o.path} onPress={() => { onPick(url); onClose(); }} style={[s.pickerCell, sel && { borderColor: colors.accent, borderWidth: 2 }]}>
                    <Image source={{ uri: o.path }} style={{ width: '100%', height: '100%', borderRadius: radius.sm }} contentFit="cover" />
                    {sel ? <View style={s.pickerSel}><Ionicons name="checkmark-circle" size={22} color={colors.accent} /></View> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  store: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingLeft: 12, paddingRight: 12, paddingVertical: 8 },
  storeName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  platChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  platChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  platName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  studioChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingLeft: 10, paddingRight: 10, paddingVertical: 6, maxWidth: 260 },
  studioName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  studioRole: { ...font.muted, fontSize: 10 },
  trailer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: space(4), marginTop: space(4), padding: space(3), backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  recShot: { width: 150, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  shot: { width: 240, height: 135, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  genreWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: space(4), marginTop: space(4) },
  genre: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  genreText: { ...font.muted, color: colors.text, fontSize: 12 },
  linkPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  linkText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  mcBox: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 4, minWidth: 64 },
  mcNum: { fontWeight: '800', fontSize: 22 },
  mcLbl: { ...font.muted, fontSize: 9, letterSpacing: 0.5 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space(4), marginTop: space(3) },
  notesInput: { minHeight: 84, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: 14, lineHeight: 20, padding: space(3), textAlignVertical: 'top' },
  notesSave: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, marginTop: space(2) },
  pickerOverlay: { flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: space(4) },
  pickerSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), width: '100%', maxWidth: 560, maxHeight: '85%' },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), justifyContent: 'center' },
  pickerCell: { width: 150, height: 84, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  pickerSel: { position: 'absolute', top: 4, right: 4, backgroundColor: '#000A', borderRadius: 11 },
});
