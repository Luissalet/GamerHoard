import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, space, font, radius } from '../theme';
import { useSession } from './session';
import { banInfo } from '../moderation';

// Shown instead of the app while the signed-in account is suspended (banned_until in the
// future). Local data/mode is unaffected; this only gates the cloud session.
export function SuspendedScreen() {
  const { t } = useTranslation();
  const { account, signOut } = useSession();
  const ban = banInfo(account?.banned_until);

  return (
    <View style={s.wrap}>
      <View style={s.iconWrap}><Ionicons name="ban" size={40} color={colors.danger} /></View>
      <Text style={[font.h1, { textAlign: 'center' }]}>{t('suspended.title')}</Text>
      <Text style={[font.body, { color: colors.textMuted, textAlign: 'center', lineHeight: 21 }]}>
        {ban.permanent ? t('suspended.bodyPerm') : t('suspended.bodyTemp', { date: ban.until ? ban.until.toLocaleDateString() : '' })}
      </Text>
      <Text style={[font.muted, { textAlign: 'center', lineHeight: 19 }]}>{t('suspended.contact')}</Text>
      <Pressable style={s.btn} onPress={() => signOut()}>
        <Text style={{ color: colors.text, fontWeight: '800' }}>{t('settings.signOut')}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(6), gap: space(3) },
  iconWrap: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#e5484d22', alignItems: 'center', justifyContent: 'center' },
  btn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space(6), paddingVertical: space(3), marginTop: space(2) },
});
