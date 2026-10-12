// Minimal ZIP reader for the TV Time GDPR export — zero dependencies.
// Uses the browser's DecompressionStream ('deflate-raw'); works in any modern
// browser and Node 18+. No zip64 (GDPR exports are a few MB).

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function findEocd(dv: DataView): number {
  const min = Math.max(0, dv.byteLength - 65557);
  for (let i = dv.byteLength - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DS: any = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error('unsupported'); // caught by the screen -> friendly message
  const stream = new Blob([bytes as any]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const zipSupported = () => Boolean((globalThis as any).DecompressionStream);

/** Extract the entries whose BASENAME passes `wanted`, decoded as UTF-8 text (basename → text). */
export async function unzipTexts(data: Uint8Array, wanted: (basename: string) => boolean): Promise<Record<string, string>> {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEocd(dv);
  if (eocd < 0) throw new Error('notzip');
  const count = dv.getUint16(eocd + 10, true);
  const cdOfs = dv.getUint32(eocd + 16, true);
  const td = new TextDecoder('utf-8');
  const out: Record<string, string> = {};
  let p = cdOfs;
  let totalOut = 0;
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== CD_SIG) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOfs = dv.getUint32(p + 42, true);
    const name = td.decode(data.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const base = name.split('/').pop() || name;
    if (name.endsWith('/') || !wanted(base)) continue;
    if (dv.getUint32(localOfs, true) !== LOCAL_SIG) continue;
    // Zip-bomb guard: a real GDPR export is a few MB; refuse absurd expansions.
    totalOut += usize;
    if (usize > 512 * 1024 * 1024 || totalOut > 1024 * 1024 * 1024) throw new Error('toobig');
    const lname = dv.getUint16(localOfs + 26, true);
    const lextra = dv.getUint16(localOfs + 28, true);
    const start = localOfs + 30 + lname + lextra;
    const raw = data.subarray(start, start + csize);
    if (method === 0) out[base] = td.decode(raw);
    else if (method === 8) out[base] = td.decode(await inflateRaw(raw));
    // other methods: skip silently (not produced by TV Time's zips)
  }
  return out;
}
