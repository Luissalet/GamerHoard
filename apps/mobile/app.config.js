// Dynamic Expo config. Reads env from the repo ROOT .env (single source of truth), with
// apps/mobile/.env as an optional override, and exposes the values via `extra`.
// Nothing secret lives in this file: every key comes from the environment.
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

const rootEnv = parseEnv(path.resolve(__dirname, '../../.env'));   // GamerHoard/.env
const localEnv = parseEnv(path.resolve(__dirname, '.env'));        // apps/mobile/.env (optional override)

// Precedence: real environment > apps/mobile/.env > root .env > default.
const val = (k, d = '') => process.env[k] || localEnv[k] || rootEnv[k] || d;

// Backend: 'localapi' (web served by server/index.mjs; shares the Faustus library),
// 'memory' (browser-only demo data) or 'local' (on-device SQLite, native default).
const DEFAULTS = { EXPO_PUBLIC_BACKEND: 'localapi' };

module.exports = {
  ...appJson.expo,
  extra: {
    ...(appJson.expo.extra || {}),
    // A RAWG key only matters for native builds (the web app asks the local server, which
    // keeps the key out of the bundle). Leave it empty for web.
    rawgKey: val('EXPO_PUBLIC_RAWG_KEY'),
    backend: val('EXPO_PUBLIC_BACKEND', DEFAULTS.EXPO_PUBLIC_BACKEND),
  },
};
