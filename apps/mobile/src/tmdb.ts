// Compatibility shim. GamerHoard reads game data from RAWG; the real implementation lives
// in ./rawg.ts. This file keeps the historical import path (`../src/tmdb`) working so screens
// that haven't been migrated yet keep compiling. New code should import from './rawg'.
export * from './rawg';
