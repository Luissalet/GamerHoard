import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, font } from '../theme';

type Mode = 'signin' | 'signup';

// The first screen an unauthenticated user sees: brand, value prop, and the two
// ways in. Renders on web and native (Expo Router). Buttons hand control to the
// auth form via onStart(mode).
export function Landing({ onStart }: { onStart: (mode: Mode) => void }) {
  const { t } = useTranslation();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space(6) }}
    >
      <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
        {/* Brand */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(6) }}>
          <View style={{
            width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.accent,
            alignItems: 'center', justifyContent: 'center', marginRight: space(3),
          }}>
            <Text style={{ color: colors.accentInk, fontWeight: '900', fontSize: 22 }}>GH</Text>
          </View>
          <Text style={[font.display, { fontSize: 28 }]}>GamerHoard</Text>
        </View>

        {/* Headline + tagline */}
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 34, lineHeight: 40, marginBottom: space(3) }}>
          {t('landing.headline')}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23, marginBottom: space(7) }}>
          {t('landing.tagline')}
        </Text>

        {/* Feature highlights */}
        <Feature icon="download-outline" tint={colors.accent}
          title={t('landing.feat1Title')} sub={t('landing.feat1Sub')} />
        <Feature icon="shield-checkmark-outline" tint={colors.success}
          title={t('landing.feat2Title')} sub={t('landing.feat2Sub')} />
        <Feature icon="game-controller-outline" tint={colors.purple}
          title={t('landing.feat3Title')} sub={t('landing.feat3Sub')} />

        {/* CTAs */}
        <Pressable
          onPress={() => onStart('signup')}
          style={{
            backgroundColor: colors.accent, borderRadius: radius.md, padding: space(4),
            alignItems: 'center', marginTop: space(6),
          }}
        >
          <Text style={{ color: colors.accentInk, fontWeight: '800', fontSize: 16 }}>{t('landing.getStarted')}</Text>
        </Pressable>

        <Pressable
          onPress={() => onStart('signin')}
          style={{
            borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space(4),
            alignItems: 'center', marginTop: space(3),
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{t('landing.signInCta')}</Text>
        </Pressable>

        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: space(5) }}>
          {t('landing.footer')}
        </Text>
      </View>
    </ScrollView>
  );
}

function Feature({ icon, tint, title, sub }: { icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: space(4) }}>
      <View style={{
        width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surface,
        borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: space(3),
      }}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 2 }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>{sub}</Text>
      </View>
    </View>
  );
}
