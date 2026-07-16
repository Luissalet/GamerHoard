// GamerHoard design tokens — dark, cover-forward, cyan + violet accents (gaming vibe).
export const colors = {
  bg: '#0A0A0F',
  surface: '#15151E',
  surfaceAlt: '#1F1F2B',
  border: '#2A2A38',
  text: '#FFFFFF',
  textMuted: '#9A9AB0',
  accent: '#22D3EE',      // cyan pills, progress, active (dark ink on top)
  accentInk: '#04121A',
  success: '#4ADE80',     // owned / completed check
  danger: '#F45B69',
  purple: '#8B5CF6',      // completed games / accent 2
  live: '#4ADE80',
};
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = (n: number) => n * 4;
export const font = {
  display: { fontSize: 30, fontWeight: '800' as const, color: colors.text },
  h1: { fontSize: 22, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
};
