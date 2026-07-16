import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions, Platform, Alert, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../../src/theme';
import { useQuery } from '../../src/useData';
import { data, type ListItemRow } from '../../src/db';
import { posterFor } from '../../src/img';

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listId = Number(id);
  const numColumns = Math.max(3, Math.min(10, Math.floor(width / 120)));
  const gutter = space(3);
  const itemWidth = (width - gutter * (numColumns + 1)) / numColumns;

  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const { loading, data: d } = useQuery(async (src) => ({
    list: await src.getListById(listId),
    items: await src.getListItems(listId),
  }), [id, nonce]);

  const removeItem = async (it: ListItemRow) => {
    await data.removeFromList(listId, { kind: it.kind, tvdb: it.tvdb_id, uuid: it.uuid });
    setNonce((n) => n + 1);
  };
  const saveRename = async () => {
    const v = name.trim();
    if (v) { await data.renameList(listId, v); setNonce((n) => n + 1); }
    setRenaming(false);
  };
  const confirmDelete = () => {
    const go = async () => { await data.deleteList(listId); goBack(); };
    if (Platform.OS === 'web') { if ((globalThis as any).confirm?.(t('lists.deleteConfirm'))) go(); }
    else Alert.alert(t('lists.deleteList'), t('lists.deleteConfirm'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('lists.deleteList'), style: 'destructive', onPress: go }]);
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));
  const open = (it: ListItemRow) => {
    if (it.kind === 'series' && it.tvdb_id != null) router.push(`/show/${it.tvdb_id}`);
    else if (it.kind === 'movie' && it.uuid) router.push(`/movie/${it.uuid}`);
  };

  const list = d?.list;
  const items = d?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={goBack} hitSlop={10} style={s.back}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}>
          {renaming ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <TextInput value={name} onChangeText={setName} autoFocus onSubmitEditing={saveRename} style={[s.renameInput, { outlineStyle: 'none' } as any]} placeholderTextColor={colors.textMuted} />
              <Pressable onPress={saveRename} hitSlop={8}><Ionicons name="checkmark" size={22} color={colors.success} /></Pressable>
            </View>
          ) : (
          <Text style={font.h1} numberOfLines={1}>{list?.name?.trim() || t('listDetail.fallbackTitle')}</Text>
          )}
          {list ? (
            <Text style={font.muted}>
              {t(list.item_count === 1 ? 'profile.items_one' : 'profile.items_other', { n: list.item_count })}
              {' · '}{list.is_public ? t('listDetail.public') : t('listDetail.private')}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => { setName(list?.name ?? ''); setRenaming((v) => !v); }} hitSlop={8} style={{ padding: 6 }}><Ionicons name="pencil" size={18} color={colors.text} /></Pressable>
        <Pressable onPress={() => setEditing((v) => !v)} hitSlop={8} style={{ padding: 6 }}>
          <Text style={{ color: editing ? colors.accent : colors.text, fontWeight: '700' }}>{editing ? t('lists.done') : t('lists.edit')}</Text>
        </Pressable>
        <Pressable onPress={confirmDelete} hitSlop={8} style={{ padding: 6 }}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : items.length === 0 ? (
        <View style={s.center}><Text style={font.muted}>{t('listDetail.empty')}</Text></View>
      ) : (
        <FlashList
          data={items}
          key={numColumns}
          numColumns={numColumns}
          estimatedItemSize={itemWidth * 1.5}
          keyExtractor={(it, i) => `${it.kind}:${it.tvdb_id ?? it.uuid ?? i}`}
          contentContainerStyle={{ padding: gutter, paddingBottom: space(10) }}
          renderItem={({ item }) => {
            const uri = item.poster ?? posterFor(item.kind === 'series' ? (item.tvdb_id ?? item.title) : item.title + (item.year ?? ''));
            return (
              <Pressable style={{ width: itemWidth, marginBottom: gutter, marginRight: gutter }} onPress={() => (editing ? removeItem(item) : open(item))}>
                <View>
                  <Image source={{ uri }} style={{ width: itemWidth, height: itemWidth * 1.5, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, opacity: editing ? 0.6 : 1 } as any} contentFit="cover" transition={120} />
                  {item.kind === 'movie' && item.watched_at && !editing ? <View style={s.badge}><Ionicons name="checkmark" size={14} color={colors.accentInk} /></View> : null}
                  {editing ? <View style={[s.badge, { backgroundColor: colors.danger }]}><Ionicons name="close" size={14} color={colors.text} /></View> : null}
                </View>
                <Text style={[font.muted, { marginTop: 4 }]} numberOfLines={1}>{item.title}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), paddingVertical: space(3) },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  renameInput: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700', backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: space(2), paddingVertical: 6 },
});
