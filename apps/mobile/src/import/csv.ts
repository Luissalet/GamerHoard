// Small RFC4180-ish CSV parser (quotes only open at field start, like csv-parse's relax mode).
// Handles quoted commas/newlines/escaped quotes — enough for every TV Time export CSV.

export function parseCsvRows(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  let started = false; // chars consumed in current field (quote only opens a clean field)
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
      continue;
    }
    if (c === '"' && !started && field === '') { inQ = true; started = true; continue; }
    if (c === ',') { row.push(field); field = ''; started = false; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); field = ''; started = false; rows.push(row); row = []; continue; }
    field += c; started = true;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Header-mapped rows; blank lines skipped; short rows padded with ''. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const vals = rows[r];
    if (vals.length === 1 && vals[0] === '') continue;
    const o: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) o[header[c]] = vals[c] ?? '';
    out.push(o);
  }
  return out;
}
