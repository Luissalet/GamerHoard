import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  // Edge-to-edge (obligatorio con targetSdk 36 / SDK 56): la tab bar crece con el
  // inset inferior para no quedar bajo la barra de gestos/navegación.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          height: 84 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.games'), tabBarIcon: ({ color, size }) => <Ionicons name="game-controller-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="explore" options={{ title: t('tabs.explore'), tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }} />
      {/* Legacy movies route from the Watch Hoard base, hidden in GamerHoard (games only). */}
      <Tabs.Screen name="movies" options={{ href: null }} />
    </Tabs>
  );
}
