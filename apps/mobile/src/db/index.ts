// Native (iOS/Android) data source: on-device SQLite. Web uses index.web.ts instead, so
// expo-sqlite is never pulled into the web bundle.
import type { DataSource } from './types';
import { LocalSource } from './local';

export const data: DataSource = new LocalSource();
export * from './types';