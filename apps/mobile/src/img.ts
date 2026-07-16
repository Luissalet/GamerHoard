// Placeholder poster while the real TMDB artwork loads/backfills: a neutral dark tile
// with the title's initial. (The old picsum.photos random-photo placeholders looked like
// wrong posters — a broken-feeling experience right after import.)
export const posterFor = (key: string | number) => {
  const k = String(key);
  const m = k.match(/[A-Za-zÀ-ÿ0-9]/);
  const ch = (m ? m[0] : '·').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="100%" height="100%" fill="#151a21"/><text x="150" y="252" font-family="sans-serif" font-weight="700" font-size="130" fill="#232b36" text-anchor="middle">${ch}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
