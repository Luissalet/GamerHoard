import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, space, font, radius } from './theme';
import { data, type GameSession } from './db';
import { localDay } from './dates';
import { useCopilotView } from './copilotRegistry';

/** Play-session log for a game in the library (shared with the MCP library: minutes and notes per session). */
export function SessionsCard({ gameId, onLogged }: { gameId: number; onLogged?: () => void }) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const supported = !!data.logSession && !!data.getSessions;
  useCopilotView('session', { editor: { kind: 'game', fields: { session_minutes: minutes, session_notes: notes } } }, [minutes, notes]);

  const load = useCallback(async () => {
    if (!data.getSessions) return;
    try { setSessions(await data.getSessions(gameId)); } catch { setSessions([]); }
  }, [gameId]);
  useEffect(() => { load(); }, [load]);

  if (!supported) return null;
  const n = Math.round(Number(minutes));
  const valid = Number.isFinite(n) && n > 0;
  const log = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await data.logSession!(gameId, { minutes: n, notes: notes.trim() || undefined });
      setMinutes(''); setNotes('');
      await load();
      onLogged?.();
    } finally { setBusy(false); }
  };

  return (
    <View style={s.card} testID="sessions-card">
      <Text style={font.h2}>{t('sessions.title')}</Text>
      <View style={s.formRow}>
        <TextInput value={minutes} onChangeText={setMinutes} placeholder={t('sessions.minutes')} placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[s.input, { width: 130 }]} />
        <TextInput value={notes} onChangeText={setNotes} placeholder={t('sessions.notes')} placeholderTextColor={colors.textMuted} style={[s.input, { flex: 1 }]} />
      </View>
      <Pressable style={[s.btn, !valid && { opacity: 0.5 }]} onPress={log} disabled={!valid || busy}>
        <Text style={s.btnText}>{t('sessions.log')}</Text>
      </Pressable>
      {sessions.length === 0 ? <Text style={font.muted}>{t('sessions.none')}</Text> : sessions.slice(0, 8).map((x) => (
        <View key={x.sessionId} style={s.row}>
          <Text style={[font.muted, { width: 92 }]}>{localDay(x.playedAt)}</Text>
          <Text style={{ color: colors.accent, fontWeight: '700', width: 70 }}>{t('sessions.min', { n: x.minutes })}</Text>
          <Text style={[font.muted, { flex: 1 }]} numberOfLines={1}>{x.notes ?? ''}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: space(4), marginTop: space(4), padding: space(3), borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: space(2) },
  formRow: { flexDirection: 'row', gap: space(2) },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), height: 42, color: colors.text, fontSize: 14, outlineStyle: 'none' } as any,
  btn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(2.5), alignItems: 'center' },
  btnText: { color: colors.accentInk, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
