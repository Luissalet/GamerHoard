// Legacy movie route from the Watch Hoard base. GamerHoard tracks games only, so this
// screen is a stub kept to satisfy a few remaining internal links (phase 2 will remove them).
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../../src/theme';

export default function MovieStub() {
  const router = useRouter();
  return (
    <View style={s.wrap}>
      <Ionicons name="game-controller-outline" size={44} color={colors.textMuted} />
      <Text style={[font.h2, { marginTop: space(3), textAlign: 'center' }]}>GamerHoard</Text>
      <Text style={[font.muted, { marginTop: space(1), textAlign: 'center' }]}>Esta sección no está disponible.</Text>
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
