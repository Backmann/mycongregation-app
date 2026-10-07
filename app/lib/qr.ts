/**
 * A QR code, drawn by the app itself.
 *
 * WHY NOT A LIBRARY. Every one of them arrives as a new dependency, and a new
 * dependency changes the fingerprint the installed Android app is matched by —
 * which would cut every phone off from updates until a new APK is handed
 * round. What is needed here is small and fixed: one short address, shown on
 * an elder's phone for the person beside him to point a camera at.
 *
 * WHAT IT COVERS: bytes (so any address), error correction level M, versions
 * 1–9 — up to 180 bytes, three times the address it is used for. Asked for
 * more, it answers null and the caller shows the code in letters only.
 *
 * scripts/check-qr.mjs holds every module of it to a second, independent
 * implementation, for all eight masks.
 */

/** [data codewords per block, how many such blocks][] and EC codewords per block — level M. */
const BLOCKS: Record<number, { ec: number; groups: [number, number][] }> = {
  1: { ec: 10, groups: [[16, 1]] },
  2: { ec: 16, groups: [[28, 1]] },
  3: { ec: 26, groups: [[44, 1]] },
  4: { ec: 18, groups: [[32, 2]] },
  5: { ec: 24, groups: [[43, 2]] },
  6: { ec: 16, groups: [[27, 4]] },
  7: { ec: 18, groups: [[31, 4]] },
  8: { ec: 22, groups: [[38, 2], [39, 2]] },
  9: { ec: 22, groups: [[36, 3], [37, 2]] },
};

const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
};

export const QR_MAX_VERSION = 9;

// --- arithmetic in GF(256), the field Reed–Solomon works in ------------------
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function mul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** The remainder that becomes the error-correction codewords of one block. */
function errorCorrection(data: number[], count: number): number[] {
  let gen = [1];
  for (let i = 0; i < count; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], EXP[i]);
    }
    gen = next;
  }
  const rem = new Array<number>(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let j = 0; j < count; j++) rem[j] ^= mul(gen[j + 1], factor);
  }
  return rem;
}

export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000)
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63),
        0x80 | (c & 63),
      );
  }
  return out;
}

function dataCapacity(version: number): number {
  return BLOCKS[version].groups.reduce((n, [size, count]) => n + size * count, 0);
}

/** The smallest version that holds this many bytes, or null when none does. */
export function qrVersionFor(byteCount: number): number | null {
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    // Mode (4 bits) + length (8 bits) + the bytes themselves.
    if (byteCount * 8 + 12 <= dataCapacity(v) * 8) return v;
  }
  return null;
}

/** Data and error-correction codewords, interleaved the way they are laid out. */
function codewords(bytes: number[], version: number): number[] {
  const capacity = dataCapacity(version);
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  for (let pad = 0; data.length < capacity; pad ^= 1) {
    data.push(pad ? 0x11 : 0xec);
  }

  const { ec, groups } = BLOCKS[version];
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (const [size, count] of groups) {
    for (let i = 0; i < count; i++) {
      const block = data.slice(at, at + size);
      at += size;
      dataBlocks.push(block);
      ecBlocks.push(errorCorrection(block, ec));
    }
  }
  const out: number[] = [];
  const longest = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ec; i++) for (const block of ecBlocks) out.push(block[i]);
  return out;
}

const MASKS: ((row: number, col: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r * c) % 3) + ((r + c) % 2)) % 2 === 0,
];

/** A value followed by its check bits: long division by the generator. */
function withCheckBits(value: number, generator: number, checkBits: number) {
  const totalBits = 31 - Math.clz32(value << checkBits || 1) + 1;
  let rem = value << checkBits;
  for (let i = totalBits - 1; i >= checkBits; i--) {
    if ((rem >> i) & 1) rem ^= generator << (i - checkBits);
  }
  return (value << checkBits) | rem;
}

/** The matrix for one mask: `true` is a dark module. */
export function qrMatrixWithMask(
  bytes: number[],
  version: number,
  mask: number,
): boolean[][] {
  const size = version * 4 + 17;
  const dark: boolean[][] = [];
  const fixed: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    dark.push(new Array<boolean>(size).fill(false));
    fixed.push(new Array<boolean>(size).fill(false));
  }
  const set = (r: number, c: number, on: boolean) => {
    dark[r][c] = on;
    fixed[r][c] = true;
  };

  // The three corner squares, each with its light border.
  const finder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        set(rr, cc, inside && (ring || core));
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // The small squares that keep a tilted camera on the grid.
  const centres = ALIGNMENT[version];
  for (const r of centres) {
    for (const c of centres) {
      if (fixed[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(
            r + dr,
            c + dc,
            Math.max(Math.abs(dr), Math.abs(dc)) !== 1,
          );
        }
      }
    }
  }

  // The dotted lines between the corners.
  for (let i = 8; i < size - 8; i++) {
    if (!fixed[6][i]) set(6, i, i % 2 === 0);
    if (!fixed[i][6]) set(i, 6, i % 2 === 0);
  }

  // Format: level M (00) and the mask, written twice.
  const format = withCheckBits(mask, 0x537, 10) ^ 0x5412;
  for (let i = 0; i < 15; i++) {
    const on = ((format >> i) & 1) === 1;
    if (i < 6) set(i, 8, on);
    else if (i < 8) set(i + 1, 8, on);
    else set(size - 15 + i, 8, on);
    if (i < 8) set(8, size - i - 1, on);
    else if (i < 9) set(8, 15 - i - 1 + 1, on);
    else set(8, 15 - i - 1, on);
  }
  set(size - 8, 8, true);

  // From version 7 on the code also states its own size.
  if (version >= 7) {
    const info = withCheckBits(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const on = ((info >> i) & 1) === 1;
      set(Math.floor(i / 3), (i % 3) + size - 11, on);
      set((i % 3) + size - 11, Math.floor(i / 3), on);
    }
  }

  // The message itself: two columns at a time, snaking up and down from the
  // bottom-right corner, skipping everything already placed.
  const words = codewords(bytes, version);
  let bit = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let n = 0; n < size; n++) {
      const row = up ? size - 1 - n : n;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (fixed[row][c]) continue;
        const byte = words[bit >> 3];
        let on = byte !== undefined && ((byte >> (7 - (bit & 7))) & 1) === 1;
        bit++;
        if (MASKS[mask](row, c)) on = !on;
        dark[row][c] = on;
      }
    }
    up = !up;
  }
  return dark;
}

/** How hard a pattern is on a camera — the standard's four penalties. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  const runs = (line: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line(i) === line(i - 1)) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
  };
  for (let r = 0; r < size; r++) {
    runs((i) => m[r][i]);
    runs((i) => m[i][r]);
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) {
        score += 3;
      }
    }
  }
  const finderLike = [true, false, true, true, true, false, true];
  const looks = (line: (i: number) => boolean, at: number) => {
    for (let k = 0; k < 7; k++) if (line(at + k) !== finderLike[k]) return false;
    const light = (from: number) => {
      for (let k = 0; k < 4; k++) {
        const i = from + k;
        if (i >= 0 && i < size && line(i)) return false;
      }
      return true;
    };
    return light(at - 4) || light(at + 7);
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 7; c++) {
      if (looks((i) => m[r][i], c)) score += 40;
      if (looks((i) => m[i][r], c)) score += 40;
    }
  }
  let darkCount = 0;
  for (const row of m) for (const v of row) if (v) darkCount++;
  score += Math.floor(Math.abs((darkCount * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

/**
 * The code for a text, or null when the text is longer than this was built
 * for. Rows of modules, `true` dark; the caller adds the light margin.
 */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = utf8Bytes(text);
  const version = qrVersionFor(bytes.length);
  if (version === null) return null;
  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = qrMatrixWithMask(bytes, version, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
