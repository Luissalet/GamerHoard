// PWA install support. The `beforeinstallprompt` event fires ONCE early in the page
// life (Chromium only), so this module is imported for its side effect from _layout
// and stashes the event for the Settings "Install app" row to fire later.
import { Platform } from 'react-native';

let deferred: any = null;
let installedFlag = false;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferred = e; });
    window.addEventListener('appinstalled', () => { installedFlag = true; deferred = null; });
  } catch { /* ignore */ }
}

export const isStandalone = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return installedFlag
      || window.matchMedia?.('(display-mode: standalone)')?.matches
      || (window.navigator as any)?.standalone === true;
  } catch { return false; }
};

export const isIos = (): boolean => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
};

export const canPromptInstall = () => deferred != null;

/** Fires the native install prompt when available. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  try {
    deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice?.outcome === 'accepted') { deferred = null; return 'accepted'; }
    return 'dismissed';
  } catch { return 'unavailable'; }
}
