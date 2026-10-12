import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image, type ImageStyle } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, font } from './theme';

export function Chip({ label }: { label: string }) {
  return (
    <View style={s.chip}>
      <Text style={s.chipText} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-forward" size={12} color={colors.text} />
    </View>
  );
}

const BADGES = {
  premiere: { text: 'PREMIERE', bg: 'transparent', fg: colors.text, border: colors.border },
  new: { text: 'NEW', bg: colors.accent, fg: colors.accentInk, border: colors.accent },
  last: { text: 'FINALE', bg: 'transparent', fg: colors.text, border: colors.border },
  aired: { text: 'AIRED', bg: colors.success, fg: colors.accentInk, border: colors.success },
} as const;
export function Badge({ kind }: { kind: keyof typeof BADGES }) {
  const b = BADGES[kind];
  return <View style={[s.badge, { backgroundColor: b.bg, borderColor: b.border }]}><Text style={[s.badgeText, { color: b.fg }]}>{b.text}</Text></View>;
}

export function WatchedCheck({ watched, onPress, size = 34 }: { watched?: boolean; onPress?: () => void; size?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={[s.check, { width: size, height: size, borderRadius: size / 2,
      backgroundColor: watched ? colors.success : 'transparent', borderColor: watched ? colors.success : colors.textMuted }]}>
      <Ionicons name="checkmark" size={size * 0.55} color={watched ? colors.accentInk : colors.textMuted} />
    </Pressable>
  );
}

export function Poster({ uri, width = 96, style }: { uri: string; width?: number; style?: ImageStyle }) {
  return <Image source={{ uri }} style={[{ width, height: width * 1.5, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }, style]} contentFit="cover" transition={200} />;
}

export function SectionHeader({ title, onPress, icon, iconColor }: { title: string; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap; iconColor?: string }) {
  return (
    <Pressable onPress={onPress} style={s.sectionHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        {icon ? <Ionicons name={icon} size={20} color={iconColor ?? colors.text} /> : null}
        <Text style={font.h1}>{title}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.text} /> : null}
    </Pressable>
  );
}

export function StatCard({ icon, label, children }: { icon: keyof typeof Ionicons.glyphMap; label: string; children: React.ReactNode }) {
  return (
    <View style={s.statCard}>
      <View style={s.statHead}><Ionicons name={icon} size={16} color={colors.textMuted} /><Text style={font.muted}>  {label}</Text></View>
      <View style={{ marginTop: space(2), flexDirection: 'row', alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.pill, { backgroundColor: active ? colors.accent : colors.surfaceAlt }]}>
      <Text style={{ color: active ? colors.accentInk : colors.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, maxWidth: 220 },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12, letterSpacing: 0.4 },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  check: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), marginTop: space(5), marginBottom: space(3) },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.border },
  statHead: { flexDirection: 'row', alignItems: 'center' },
  pill: { borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
});
