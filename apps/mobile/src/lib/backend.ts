// Single source of truth for which DataSource is active.
//   localapi  web served by server/index.mjs: reads and writes the library Faustus uses (default on web)
//   memory    browser-only demo data (EXPO_PUBLIC_BACKEND=memory)
//   local     on-device SQLite (iOS and Android)
// There is no account and no cloud backend.
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type Backend = 'localapi' | 'memory' | 'local';
const extra = (Constants.expoConfig?.extra ?? {}) as any;
const requested = String(extra.backend || process.env.EXPO_PUBLIC_BACKEND || '');
export const BACKEND: Backend = Platform.OS === 'web' ? (requested === 'memory' ? 'memory' : 'localapi') : 'local';
/** Kept for screens written against the old cloud mode; always false. */
export const isCloud = false;