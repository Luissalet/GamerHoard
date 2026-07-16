import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { colors, radius, space } from './theme';

// Pulsing placeholder shown while content loads — feels faster than a spinner and
// keeps the layout stable (no jump when the real content arrives).
export function Skeleton({ width, height, style, rounded = radius.md }: { width?: number | `${number}%`; height?: number; style?: any; rounded?: number }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width: width ?? '100%', height: height ?? 16, borderRadius: rounded, backgroundColor: colors.surfaceAlt, opacity: pulse }, style]} />;
}

/** A horizontal row of card-shaped skeletons (Explore sections, carousels). */
export function SkeletonRow({ count = 5, cardWidth = 120, ratio = 16 / 9 }: { count?: number; cardWidth?: number; ratio?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: space(3), paddingHorizontal: space(4) }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: cardWidth }}>
          <Skeleton width={cardWidth} height={cardWidth / ratio} />
          <Skeleton width={cardWidth * 0.8} height={10} style={{ marginTop: 6 }} rounded={5} />
        </View>
      ))}
    </View>
  );
}

/** A grid of cover-shaped skeletons (library / search results). */
export function SkeletonGrid({ columns = 3, rows = 3, itemWidth = 120, ratio = 16 / 9 }: { columns?: number; rows?: number; itemWidth?: number; ratio?: number }) {
  return (
    <View style={s.grid}>
      {Array.from({ length: columns * rows }).map((_, i) => (
        <View key={i} style={{ width: itemWidth, padding: space(1.5) }}>
          <Skeleton height={(itemWidth - space(3)) / ratio} />
          <Skeleton width="70%" height={10} style={{ marginTop: 6 }} rounded={5} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: space(1) },
});
