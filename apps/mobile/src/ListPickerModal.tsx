import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, space, font, radius } from './theme';
import { data, type ListRow } from './db';

export type ListTarget = { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null };

// TV Time-style "save to list" sheet: toggle membership per list + create a new list inline.
// `onEnsure` runs before the first mutation (fiches use it to add the title to the library).
export function ListPickerModal({ visible, target, onEnsure, onClose }: {
  visible: boolean; target: ListTarget; onEnsure?: () => Promise<void>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [membership, setMembership] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const ensured = React.useRef(false);

  const load = useCallback(async () => {
    await data.ready();
    const ls = await data.getLists();
    setLists(ls);
    const member = new Set<number>();
    await Promise.all(ls.map(async (l) => {
      const items = await data.getListItems(l.id);
      const inIt = items.some((it) => it.kind === target.kind && (target.kind === 'series' ? it.tvdb_id === (target.tvdb ?? null) : it.uuid === (target.uuid ?? null)));
      if (inIt) member.add(l.id);
    }));
    setMembership(member);
  }, [target.kind, target.tvdb, target.uuid]);

  useEffect(() => { if (visible) { ensured.current = false; setLists(null); load(); } }, [visible, load]);

  const ensureOnce = async () => { if (!ensured.current) { ensured.current = true; await onEnsure?.(); } };

  const toggle = async (l: ListRow) => {
    if (busy != null) return;
    setBusy(l.id);
    try {
      await ensureOnce();
      const item = { kind: target.kind, tvdb: target.tvdb ?? null, uuid: target.uuid ?? null };
      if (membership.has(l.id)) {
        await data.removeFromList(l.id, item);
        setMembership((s) => { const n = new Set(s); n.delete(l.id); return n; });
        setLists((ls) => ls?.map((x) => (x.id === l.id ? { ...x, item_count: Math.max(0, x.item_count - 1) } : x)) ?? ls);
      } else {
        await data.addToList(l.id, item);
        setMembership((s) => new Set(s).add(l.id));
        setLists((ls) => ls?.map((x) => (x.id === l.id ? { ...x, item_count: x.item_count + 1 } : x)) ?? ls);
      }
    } finally { setBusy(null); }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await ensureOnce();
      const id = await data.createList(name);
      if (id != null) {
        await data.addToList(id, { kind: target.kind, tvdb: target.tvdb ?? null, uuid: target.uuid ?? null });
        setNewName('');
        await load();
      }
    } finally { setCreating(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(3) }}>
            <Text style={[font.h1, { fontSize: 20, flex: 1 }]}>{t('lists.addTo')}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
          </View>

          {lists == null ? <ActivityIndicator color={colors.accent} style={{ marginVertical: space(5) }} /> : (
            <ScrollView style={{ maxHeight: 320 }}>
              {lists.length === 0 ? <Text style={[font.muted, { marginBottom: space(2) }]}>{t('lists.empty')}</Text> : null}
              {lists.map((l) => {
                const on = membership.has(l.id);
                return (
                  <Pressable key={l.id} style={s.row} onPress={() => toggle(l)} disabled={busy != null}>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h2} numberOfLines={1}>{l.name?.trim() || t('profile.untitledList')}</Text>
                      <Text style={font.muted}>{t(l.item_count === 1 ? 'profile.items_one' : 'profile.items_other', { n: l.item_count })}</Text>
                    </View>
                    {busy === l.id ? <ActivityIndicator size="small" color={colors.accent} /> : (
                      <View style={[s.check, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                        {on ? <Ionicons name="checkmark" size={16} color={colors.accentInk} /> : null}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={s.newRow}>
            <TextInput
              value={newName} onChangeText={setNewName} placeholder={t('lists.namePlaceholder')}
              placeholderTextColor={colors.textMuted} style={[s.input, { outlineStyle: 'none' } as any]}
              onSubmitEditing={create} returnKeyType="done"
            />
            <Pressable onPress={create} disabled={!newName.trim() || creating} style={[s.createBtn, { opacity: newName.trim() && !creating ? 1 : 0.5 }]}>
              {creating ? <ActivityIndicator size="small" color={colors.accentInk} /> : <Text style={{ color: colors.accentInk, fontWeight: '800' }}>{t('lists.create')}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: space(4) },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), width: '100%', maxWidth: 440 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  newRow: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  input: { flex: 1, color: colors.text, fontSize: 15, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: space(3), paddingVertical: space(3) },
  createBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: space(4), alignItems: 'center', justifyContent: 'center' },
});
