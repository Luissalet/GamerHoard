import React from 'react';
import { Pressable, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors } from './theme';
import { unseenCount } from './notifications';

// Bell shown in every tab header. Red dot while there are unread announcements;
// the count refreshes whenever the tab regains focus (e.g. coming back from /notifications).
export function NotificationBell({ style, size = 22 }: { style?: StyleProp<ViewStyle>; size?: number }) {
  const router = useRouter();
  const [unseen, setUnseen] = React.useState(0);
  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      unseenCount().then((n) => { if (alive) setUnseen(n); }).catch(() => {});
      return () => { alive = false; };
    }, [])
  );
  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={8} style={style}>
      <View>
        <Ionicons name={unseen > 0 ? 'notifications' : 'notifications-outline'} size={size} color={colors.text} />
        {unseen > 0 ? <View style={s.dot} /> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  dot: { position: 'absolute', top: -1, right: -1, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.bg },
});
