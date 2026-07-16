import React, { useState } from 'react';
import { Pressable, Platform, Share, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

// Share a watchhoard.com link: Web Share API when available, clipboard fallback
// (icon flips to a checkmark as feedback), native share sheet on mobile.
export function ShareButton({ title, path, top }: { title: string; path: string; top: number }) {
  const [copied, setCopied] = useState(false);
  const url = `https://watchhoard.com${path}`;
  const onShare = async () => {
    if (Platform.OS === 'web') {
      const nav: any = (globalThis as any).navigator;
      if (nav?.share) { try { await nav.share({ title, url }); } catch { /* user cancelled */ } return; }
      try { await nav?.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
      return;
    }
    try { await Share.share({ message: `${title} — ${url}` }); } catch { /* ignore */ }
  };
  return (
    <Pressable onPress={onShare} style={[s.btn, { top }]} hitSlop={10}>
      <Ionicons name={copied ? 'checkmark' : 'share-social-outline'} size={20} color={copied ? colors.success : colors.text} />
    </Pressable>
  );
}
const s = StyleSheet.create({
  btn: { position: 'absolute', right: 12, zIndex: 30, width: 40, height: 40, borderRadius: 20, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center' },
});
