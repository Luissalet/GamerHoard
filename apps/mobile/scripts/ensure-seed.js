// Si no existe assets/seed.json (p.ej. clon limpio del repo, donde está gitignoreado),
// crea uno vacío a partir de la plantilla para que la app compile. No toca uno existente.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'assets');
const seed = path.join(dir, 'seed.json');
const sample = path.join(dir, 'seed.sample.json');
try {
  if (!fs.existsSync(seed) && fs.existsSync(sample)) {
    fs.copyFileSync(sample, seed);
    console.log('[ensure-seed] creado assets/seed.json vacío desde la plantilla');
  }
} catch (e) { console.warn('[ensure-seed] aviso:', e.message); }
