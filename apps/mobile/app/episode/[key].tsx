// Legacy episode route from the Watch Hoard base. In GamerHoard, DLCs are managed inside the
// game detail screen, so this route is a stub kept only to satisfy a few remaining links.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../../src/theme';

export default function EpisodeStub() {
  const router = useRouter();
  return (
    <View style={s.wrap}>
      <Ionicons name="game-controller-outline" size={44} color={colors.textMuted} />
      <Text style={[font.h2, { marginTop: space(3), textAlign: 'center' }]}>GamerHoard</Text>
      <Text style={[font.muted, { marginTop: space(1), textAlign: 'center' }]}>Los DLCs se gestionan desde la ficha del juego.</Text>
      <Pressable style={s.btn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Text style={{ color: colors.accentInk, fontWeight: '800' }}>Volver</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(8) },
  btn: { marginTop: space(5), backgroundColor: colors.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.pill },
});
