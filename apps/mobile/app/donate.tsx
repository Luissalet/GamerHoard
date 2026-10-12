import React, { useEffect } from 'react';
import { View, Text, Pressable, Platform, Linking, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';

// watchhoard.com/donate -> GoFundMe. A stable short link for socials, the README and the
// campaign itself; redirects instantly on web and opens the browser on native.
const URL = 'https://www.gofundme.com/f/create-an-alternative-to-tv-time';

export default function Donate() {
  const { t } = useTranslation();
  const go = () => {
    if (Platform.OS === 'web') (globalThis as any).location?.replace(URL);
    else Linking.openURL(URL);
  };
  useEffect(() => { go(); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(6) }}>
      <Ionicons name="heart" size={44} color={colors.danger} />
      <ActivityIndicator color={colors.accent} style={{ marginTop: space(4) }} />
      <Pressable
        onPress={go}
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, marginTop: space(5) }}
      >
        <Ionicons name="open-outline" size={18} color={colors.accentInk} />
        <Text style={{ color: colors.accentInk, fontWeight: '800' }}>  {t('settings.donate')}</Text>
      </Pressable>
      <Text style={[font.muted, { marginTop: space(3), textAlign: 'center' }]}>{t('settings.donateSub')}</Text>
    </View>
  );
}
