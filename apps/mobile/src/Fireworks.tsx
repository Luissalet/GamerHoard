import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { colors, radius } from './theme';
import i18n from './i18n';

const COLORS = ['#F4C430', '#E5484D', '#57C84D', '#4C9AFF', '#8B5CF6', '#FF6AD5', '#FFD166', '#2EE6D6'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function Burst({ x, y, delay }: { x: number; y: number; delay: number }) {
  const N = 20;
  const particles = useMemo(
    () => Array.from({ length: N }, (_, i) => ({
      angle: (i / N) * Math.PI * 2 + rand(-0.12, 0.12),
      dist: rand(70, 160),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: rand(4, 9),
    })), []);
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1150, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, []);
  return (
    <>
      {particles.map((p, i) => {
        const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] });
        const ty = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.dist + 55] });
        const opacity = t.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] });
        const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1.1, 0.3] });
        return (
          <Animated.View key={i} pointerEvents="none"
            style={{ position: 'absolute', left: x, top: y, width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: p.color, opacity, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }} />
        );
      })}
    </>
  );
}

export function Fireworks({ onDone, label = i18n.t('showDetail.seriesCompleted') }: { onDone?: () => void; label?: string }) {
  const { width, height } = useWindowDimensions();
  const bursts = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ({ x: rand(0.12, 0.88) * width, y: rand(0.14, 0.5) * height, delay: i * 260 })),
    [width, height]);
  const banner = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(banner, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.delay(1400),
      Animated.timing(banner, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
    const total = 7 * 260 + 1200 + 400;
    const id = setTimeout(() => onDone?.(), total);
    return () => clearTimeout(id);
  }, []);
  const bScale = banner.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bursts.map((b, i) => <Burst key={i} x={b.x} y={b.y} delay={b.delay} />)}
      <Animated.View style={[s.banner, { opacity: banner, transform: [{ scale: bScale }] }]}>
        <Text style={s.bannerEmoji}>🎉</Text>
        <Text style={s.bannerText}>{label}</Text>
      </Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  banner: { position: 'absolute', alignSelf: 'center', top: '42%', alignItems: 'center', backgroundColor: '#000000CC', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 24, paddingVertical: 16 },
  bannerEmoji: { fontSize: 40 },
  bannerText: { color: colors.text, fontWeight: '800', fontSize: 18, marginTop: 6 },
});
