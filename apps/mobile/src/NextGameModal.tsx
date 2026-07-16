import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, space, font, radius } from './theme';
import { data, type ShowRow } from './db';
import { posterFor } from './img';
import { genreNameMap, parseGenres, libraryGenres } from './genres';

// "What should I play next?" — smart backlog picker. Filters the backlog/paused pile by
// genre or favorites and draws a weighted random pick (favorites count triple, paused
// games — you already invested time — count double).

export function NextGameModal({ visible, games, onClose, onChanged }: {
  visible: boolean;
  games: ShowRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [genreFilter, setGenreFilter] = useState<number | 'all'>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [pick, setPick] = useState<ShowRow | null>(null);
  const [genreNames, setGenreNames] = useState<Record<number, string>>({});

  useEffect(() => { genreNameMap(i18n.language).then(setGenreNames).catch(() => {}); }, [i18n.language]);
  useEffect(() => { if (!visible) { setPick(null); setGenreFilter('all'); setFavOnly(false); } }, [visible]);

  const pool = useMemo(() => games.filter((g) =>
    (g.state === 'backlog' || g.state === 'stopped') &&
    (!favOnly || g.is_favorite === 1) &&
    (genreFilter === 'all' || parseGenres(g.genres).includes(genreFilter))
  ), [games, favOnly, genreFilter]);

  const poolGenres = useMemo(() => {
    const backloggy = games.filter((g) => g.state === 'backlog' || g.state === 'stopped');
    return libraryGenres(backloggy).filter((id) => genreNames[id]).sort((a, b) => (genreNames[a] || '').localeCompare(genreNames[b] || ''));
  }, [games, genreNames]);

  const roll = useCallback(() => {
    if (!pool.length) { setPick(null); return; }
    const weighted: ShowRow[] = [];
    for (const g of pool) {
      if (g.tvdb_id === pick?.tvdb_id && pool.length > 1) continue; // don't repeat the same pick
      const w = (g.is_favorite ? 3 : 1) * (g.state === 'stopped' ? 2 : 1);
      for (let i = 0; i < w; i++) weighted.push(g);
    }
    setPick(weighted[Math.floor(Math.random() * weighted.length)] ?? pool[0]);
  }, [pool, pick]);

  const play = useCallback(async () => {
    if (!pick) return;
    await data.ready();
    await data.setShowState(pick.tvdb_id, 'watching');
    onChanged(); onClose();
    router.push(`/show/${pick.tvdb_id}`);
  }, [pick, onChanged, onClose, router]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(2) }}>
            <Ionicons name="dice-outline" size={22} color={colors.accent} />
            <Text style={[font.h1, { fontSize: 20, flex: 1, marginLeft: space(2) }]}>{t('picker.title')}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
          </View>
          <Text style={[font.muted, { marginBottom: space(3) }]}>{t('picker.subtitle', { n: pool.length })}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space(2), paddingBottom: space(3) }}>
            <Pressable onPress={() => setFavOnly((v) => !v)} style={[s.chip, favOnly && s.chipOn, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <Ionicons name={favOnly ? 'heart' : 'heart-outline'} size={13} color={favOnly ? colors.accentInk : colors.danger} />
              <Text style={[s.chipText, favOnly && s.chipTextOn]}>{t('games.favorites')}</Text>
            </Pressable>
            <Pressable onPress={() => setGenreFilter('all')} style={[s.chip, genreFilter === 'all' && s.chipOn]}>
              <Text style={[s.chipText, genreFilter === 'all' && s.chipTextOn]}>{t('games.allGenres')}</Text>
            </Pressable>
            {poolGenres.map((id) => (
              <Pressable key={id} onPress={() => setGenreFilter(genreFilter === id ? 'all' : id)} style={[s.chip, genreFilter === id && s.chipOn]}>
                <Text style={[s.chipText, genreFilter === id && s.chipTextOn]}>{genreNames[id]}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {pick ? (
            <View style={{ alignItems: 'center' }}>
              <Pressable onPress={() => { onClose(); router.push(`/show/${pick.tvdb_id}`); }} style={{ width: '100%' }}>
                <Image source={{ uri: pick.poster ?? posterFor(pick.tvdb_id) }} style={s.pickCover} contentFit="cover" transition={200} />
              </Pressable>
              <Text style={[font.h1, { marginTop: space(3), textAlign: 'center' }]} numberOfLines={2}>{pick.title}</Text>
              <Text style={[font.muted, { marginTop: 2 }]}>
                {t('categories.' + (pick.state === 'stopped' ? 'paused' : 'not_started'))}
                {pick.is_favorite ? '  ·  ♥' : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(4), width: '100%' }}>
                <Pressable style={[s.bigBtn, { backgroundColor: colors.accent }]} onPress={play}>
                  <Ionicons name="play" size={18} color={colors.accentInk} />
                  <Text style={[s.bigBtnText, { color: colors.accentInk }]}>{t('picker.playNow')}</Text>
                </Pressable>
                <Pressable style={[s.bigBtn, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }]} onPress={roll}>
                  <Ionicons name="shuffle" size={18} color={colors.text} />
                  <Text style={s.bigBtnText}>{t('picker.another')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: space(4) }}>
              {pool.length === 0 ? (
                <Text style={[font.muted, { textAlign: 'center', lineHeight: 20 }]}>{t('picker.empty')}</Text>
              ) : (
                <Pressable style={[s.bigBtn, { backgroundColor: colors.accent, width: '100%' }]} onPress={roll}>
                  <Ionicons name="dice" size={20} color={colors.accentInk} />
                  <Text style={[s.bigBtnText, { color: colors.accentInk }]}>{t('picker.surprise')}</Text>
                </Pressable>
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: space(4) },
  sheet: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4) },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surfaceAlt },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: colors.accentInk },
  pickCover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  bigBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: space(3), borderRadius: radius.pill },
  bigBtnText: { color: colors.text, fontWeight: '800', fontSize: 15 },
});
