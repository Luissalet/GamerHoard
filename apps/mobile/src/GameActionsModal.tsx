import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Platform, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, space, font, radius } from './theme';
import { data, type ShowRow } from './db';
import { posterFor } from './img';
import { categoryOf, type GameState } from './categories';

// Quick-actions sheet: long-press a game anywhere to change its state, favorite it,
// or remove it — without opening the detail screen. The core of "fast to use".

const STATES: { st: GameState; icon: keyof typeof Ionicons.glyphMap; key: string }[] = [
  { st: 'backlog', icon: 'time-outline', key: 'gameDetail.stBacklog' },
  { st: 'watching', icon: 'game-controller-outline', key: 'gameDetail.stPlaying' },
  { st: 'stopped', icon: 'pause-outline', key: 'gameDetail.stPaused' },
  { st: 'archived', icon: 'trophy-outline', key: 'gameDetail.stCompleted' },
];

const stateOf = (g: ShowRow): GameState => (['backlog', 'watching', 'stopped', 'archived'].includes(g.state) ? (g.state as GameState) : 'watching');

function confirmAsync(title: string, message: string, okLabel: string, cancelLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(!!(globalThis as any).confirm?.(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { onDismiss: () => resolve(false) });
  });
}

export function GameActionsModal({ game, onClose, onChanged }: {
  game: ShowRow | null;
  onClose: () => void;
  /** Called after any mutation so the caller can refresh its lists. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();

  const setState = useCallback(async (st: GameState) => {
    if (!game) return;
    await data.ready();
    await data.setShowState(game.tvdb_id, st);
    onChanged(); onClose();
  }, [game, onChanged, onClose]);

  const toggleFav = useCallback(async () => {
    if (!game) return;
    await data.ready();
    await data.setShowFavorite(game.tvdb_id, !game.is_favorite);
    onChanged(); onClose();
  }, [game, onChanged, onClose]);

  const remove = useCallback(async () => {
    if (!game) return;
    const ok = await confirmAsync(t('quick.removeTitle'), t('quick.removeConfirm', { title: game.title }), t('common.delete'), t('common.cancel'));
    if (!ok) return;
    await data.ready();
    await data.removeShow(game.tvdb_id);
    onChanged(); onClose();
  }, [game, onChanged, onClose, t]);

  if (!game) return null;
  const current = stateOf(game);
  const hours = game.playtime_minutes ? Math.round(game.playtime_minutes / 60) : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.headRow}>
            <Image source={{ uri: game.poster ?? posterFor(game.tvdb_id) }} style={s.cover} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: space(3) }}>
              <Text style={font.h2} numberOfLines={2}>{game.title}</Text>
              <Text style={[font.muted, { marginTop: 2 }]} numberOfLines={1}>
                {t('categories.' + categoryOf(game))}{hours ? `  ·  ${t('gameDetail.yourHours', { h: hours })}` : ''}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable>
          </View>

          <View style={s.stateGrid}>
            {STATES.map(({ st, icon, key }) => {
              const on = current === st;
              return (
                <Pressable key={st} style={[s.stateBtn, on && s.stateBtnOn]} onPress={() => setState(st)}>
                  <Ionicons name={icon} size={18} color={on ? colors.accentInk : colors.text} />
                  <Text style={[s.stateText, on && { color: colors.accentInk }]}>{t(key)}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.divider} />

          <Pressable style={s.row} onPress={toggleFav}>
            <Ionicons name={game.is_favorite ? 'heart' : 'heart-outline'} size={20} color={colors.danger} />
            <Text style={s.rowText}>{game.is_favorite ? t('quick.unfavorite') : t('quick.favorite')}</Text>
          </Pressable>
          <Pressable style={s.row} onPress={() => { onClose(); router.push(`/show/${game.tvdb_id}`); }}>
            <Ionicons name="information-circle-outline" size={20} color={colors.text} />
            <Text style={s.rowText}>{t('quick.openDetail')}</Text>
          </Pressable>
          <Pressable style={s.row} onPress={remove}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[s.rowText, { color: colors.danger }]}>{t('quick.remove')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), paddingBottom: space(8) },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space(4) },
  cover: { width: 84, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  stateGrid: { flexDirection: 'row', gap: space(2) },
  stateBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: space(3), borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  stateBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  stateText: { color: colors.text, fontWeight: '700', fontSize: 11 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  rowText: { ...font.body, fontWeight: '700' },
});
