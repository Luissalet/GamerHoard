// Numeric ids for the web app. The Expo screens identify a game with a number (a RAWG id, or
// 2_000_000_000 + Steam app id), while the shared library keys games by string id. The numbers
// are derived, never stored, so the library file stays what the MCP tools write.

export const STEAM_OFFSET = 2_000_000_000;
const MANUAL_BASE = 1_000_000_000;
const MANUAL_SPAN = 900_000_000;

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The number the web app uses for a library game. */
export function tvdbIdOf(game) {
  const rawg = Number(game.rawgId);
  if (Number.isInteger(rawg) && rawg > 0 && rawg < MANUAL_BASE) return rawg;
  const steam = Number(game.steamAppId);
  if (Number.isInteger(steam) && steam > 0 && steam < STEAM_OFFSET) return STEAM_OFFSET + steam;
  return MANUAL_BASE + (fnv1a(String(game.id)) % MANUAL_SPAN);
}

/** Resolve a URL id: the exact library id first, then the derived number. */
export function findGame(games, id) {
  const text = String(id);
  const exact = games.find((g) => g.id === text);
  if (exact) return exact;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    const byNumber = games.find((g) => tvdbIdOf(g) === n);
    if (byNumber) return byNumber;
  }
  return null;
}

const lastPlayed = (game) => (Array.isArray(game.sessions) ? game.sessions : []).reduce((best, s) => (s.playedAt > best ? s.playedAt : best), '') || null;

/** Steam achievements keep the per-achievement list out of game rows (read it with /achievements). */
function summary(game) {
  if (!game?.steamAchievements?.items) return game.steamAchievements ?? null;
  const { items: _items, ...rest } = game.steamAchievements;
  return rest;
}

/** A game as the web app receives it: the library fields plus tvdbId and lastPlayedAt. */
export function view(game, { withSessions = true } = {}) {
  const sessions = Array.isArray(game.sessions) ? game.sessions : [];
  const { sessions: _sessions, ...rest } = game;
  return {
    ...rest,
    steamAchievements: summary(game),
    tvdbId: tvdbIdOf(game),
    lastPlayedAt: lastPlayed(game),
    sessionCount: sessions.length,
    ...(withSessions ? { sessions } : {}),
  };
}
