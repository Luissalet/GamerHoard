// Web data source. Never imports ./local (keeps expo-sqlite out of the web bundle).
//   localapi (default) -> the local server and the shared library
//   memory             -> browser-only demo data
import { BACKEND } from '../lib/backend';
import type { DataSource } from './types';
import { MemorySource } from './memory';
import { LocalApiSource } from './localapi';

export const data: DataSource = BACKEND === 'memory' ? new MemorySource() : new LocalApiSource();
export * from './types';