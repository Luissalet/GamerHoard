// Shareable stats card — renders a branded 1080x1350 PNG on an offscreen canvas
// (web only) and hands it to the Web Share API, falling back to a download.
// Text-only on purpose: no cross-origin images, so the canvas never taints.
import { colors } from './theme';

export interface StatsCardData {
  handle: string | null;
  seriesClock: string | null;
  moviesClock: string | null;
  episodes: number;
  movies: number;
  showCount: number;
  topShow: string | null;
  topGenres: string[];
  labels: {
    title: string; tvTime: string; movieTime: string; episodes: string;
    movies: string; shows: string; topShow: string; topGenres: string;
  };
}

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

function ellipsize(x: CanvasRenderingContext2D, text: string, max: number): string {
  if (x.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && x.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

export async function shareStatsCard(d: StatsCardData): Promise<'shared' | 'downloaded' | 'unsupported'> {
  if (typeof document === 'undefined') return 'unsupported';
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  if (!x) return 'unsupported';

  // Background + soft gold glow.
  x.fillStyle = colors.bg; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, -200, 50, W / 2, -200, 900);
  glow.addColorStop(0, 'rgba(244,196,48,0.22)'); glow.addColorStop(1, 'rgba(244,196,48,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);

  // Brand.
  x.textBaseline = 'top';
  x.fillStyle = colors.accent;
  x.font = `800 64px ${FONT}`;
  x.fillText('Watch Hoard', 72, 84);
  if (d.handle) {
    x.fillStyle = 'rgba(255,255,255,0.65)';
    x.font = `600 34px ${FONT}`;
    x.fillText(`@${d.handle.replace(/^@/, '')}`, 74, 164);
  }

  // Time clocks (the TV Time-style headline numbers).
  const clock = (py: number, label: string, value: string | null) => {
    roundRect(x, 72, py, W - 144, 172, 28);
    x.fillStyle = colors.surface; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = `700 30px ${FONT}`;
    x.fillText(label.toUpperCase(), 108, py + 30);
    x.fillStyle = colors.text; x.font = `800 72px ${FONT}`;
    x.fillText(value ?? '—', 108, py + 74);
  };
  clock(252, d.labels.tvTime, d.seriesClock);
  clock(448, d.labels.movieTime, d.moviesClock);

  // Count grid: episodes / movies / shows.
  const cells: [string, number][] = [[d.labels.episodes, d.episodes], [d.labels.movies, d.movies], [d.labels.shows, d.showCount]];
  const cw = (W - 144 - 2 * 24) / 3;
  cells.forEach(([label, value], i) => {
    const px = 72 + i * (cw + 24), py = 668;
    roundRect(x, px, py, cw, 180, 28);
    x.fillStyle = colors.surface; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.stroke();
    x.fillStyle = colors.accent; x.font = `800 60px ${FONT}`;
    x.fillText(value.toLocaleString(), px + 32, py + 38);
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = `700 26px ${FONT}`;
    x.fillText(ellipsize(x, label.toUpperCase(), cw - 64), px + 32, py + 116);
  });

  // Top show + top genres.
  let py = 920;
  if (d.topShow) {
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = `700 30px ${FONT}`;
    x.fillText(d.labels.topShow.toUpperCase(), 72, py);
    x.fillStyle = colors.text; x.font = `800 56px ${FONT}`;
    x.fillText(ellipsize(x, d.topShow, W - 144), 72, py + 46);
    py += 158;
  }
  if (d.topGenres.length) {
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = `700 30px ${FONT}`;
    x.fillText(d.labels.topGenres.toUpperCase(), 72, py);
    let gx = 72; const gy = py + 52;
    x.font = `700 34px ${FONT}`;
    for (const g of d.topGenres) {
      const wpx = x.measureText(g).width + 56;
      if (gx + wpx > W - 72) break;
      roundRect(x, gx, gy, wpx, 66, 33);
      x.fillStyle = 'rgba(244,196,48,0.14)'; x.fill();
      x.strokeStyle = 'rgba(244,196,48,0.45)'; x.stroke();
      x.fillStyle = colors.accent;
      x.fillText(g, gx + 28, gy + 16);
      gx += wpx + 18;
    }
  }

  // Footer.
  x.fillStyle = 'rgba(255,255,255,0.45)'; x.font = `700 32px ${FONT}`;
  x.fillText('watchhoard.com', 72, H - 96);

  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) return 'unsupported';
  const file = new File([blob], 'watchhoard-stats.png', { type: 'image/png' });
  const nav: any = navigator;
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: 'Watch Hoard' }); } catch { /* user canceled */ }
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'watchhoard-stats.png'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
