// Dynamic Expo config. Reads env from the monorepo ROOT .env (single source of truth),
// with apps/mobile/.env as an optional override, and exposes the values via `extra`
// so the app never needs the .env duplicated per package.
const fs = require('fs');
const path = require('path');
const appJson = require('./app.json');

function parseEnv(p) {
  const out = {};
  try {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch (_) { /* file may not exist */ }
  return out;
}

const rootEnv = parseEnv(path.resolve(__dirname, '../../.env'));   // GamerHoard/.env  (single source)
const localEnv = parseEnv(path.resolve(__dirname, '.env'));        // apps/mobile/.env (optional override)
// A non-empty local value wins; otherwise the root value; otherwise default.
const val = (k, d = '') => (localEnv[k] && localEnv[k].length ? localEnv[k] : (rootEnv[k] && rootEnv[k].length ? rootEnv[k] : d));

// Also mirror into process.env so any code reading process.env.EXPO_PUBLIC_* directly still works.
for (const k of ['EXPO_PUBLIC_RAWG_KEY', 'EXPO_PUBLIC_STEAM_KEY', 'EXPO_PUBLIC_STEAM_PROXY', 'EXPO_PUBLIC_BACKEND', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
  const v = val(k);
  if (v && (!process.env[k] || process.env[k].length === 0)) process.env[k] = v;
}

module.exports = {
  ...appJson.expo,
  extra: {
    ...(appJson.expo.extra || {}),
    rawgKey: val('EXPO_PUBLIC_RAWG_KEY'),
    steamKey: val('EXPO_PUBLIC_STEAM_KEY'),
    steamProxy: val('EXPO_PUBLIC_STEAM_PROXY'),
    backend: val('EXPO_PUBLIC_BACKEND', 'local'),
    supabaseUrl: val('EXPO_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: val('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  },
};
