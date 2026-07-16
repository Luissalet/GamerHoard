import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../src/theme';
import { fetchAnnouncements, getSeenIds, markSeen, pickText, type Announcement } from '../src/notifications';
import { localDay } from '../src/dates';

// Announcements inbox. Opening it marks everything as read (clears the bell dot),
// but cards that were unread when you arrived stay highlighted until you leave.
export default function NotificationsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [list, setList] = React.useState<Announcement[] | null>(null);
  const [wasUnseen, setWasUnseen] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [l, seen] = await Promise.all([fetchAnnouncements(true), getSeenIds()]);
      if (!alive) return;
      setWasUnseen(new Set(l.filter((a) => !seen.has(a.id)).map((a) => a.id)));
      setList(l);
      markSeen(l.map((a) => a.id));
    })();
    return () => { alive = false; };
  }, []);

  const open = (a: Announcement) => {
    if (!a.href) return;
    if (/^https?:/i.test(a.href)) {
      if (Platform.OS === 'web') (globalThis as any).open?.(a.href, '_blank');
      else Linking.openURL(a.href);
    } else {
      router.push(a.href as any);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={font.h1}>{t('notif.title')}</Text>
        <View style={{ width: 26 }} />
      </View>

      {list == null ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : list.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
          <Text style={[font.muted, { marginTop: space(2) }]}>{t('notif.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }}>
          {list.map((a) => (
            <Pressable key={a.id} style={[s.card, wasUnseen.has(a.id) && s.cardUnread]} onPress={() => open(a)}>
              <View style={s.iconWrap}>
                <Ionicons name={(a.icon || 'megaphone') as any} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{pickText(a.title, i18n.language)}</Text>
                <Text style={[font.muted, { marginTop: 4, lineHeight: 18 }]}>{pickText(a.body, i18n.language)}</Text>
                {a.created_at ? <Text style={s.date}>{localDay(a.created_at)}</Text> : null}
              </View>
              {a.href ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ alignSelf: 'center' }} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(3) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', gap: space(3), backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4) },
  cardUnread: { borderColor: colors.accent },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.h2, fontSize: 15 },
  date: { ...font.muted, fontSize: 11, marginTop: space(2) },
});
