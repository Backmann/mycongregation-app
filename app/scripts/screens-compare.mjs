#!/usr/bin/env node
/**
 * Compare two runs of the screenshot script, pixel by pixel.
 *
 *   node screens-compare.mjs before after
 *
 * Finds the newest folders in .screens/ ending in _before and _after (or takes
 * two folder names as given) and, for every picture present in both, decodes
 * the PNG and compares every pixel. Reports each picture as identical or as
 * differing — with how many pixels and the rectangle they lie in.
 *
 * No dependencies: PNG is decoded with Node's own zlib (8-bit RGB/RGBA,
 * non-interlaced — what Chromium writes). Run from the app folder.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

const ROOT = join(process.cwd(), '.screens');
function pick(label) {
  if (existsSync(join(ROOT, label))) return label;
  const all = readdirSync(ROOT).filter((n) => n.endsWith(`_${label}`)).sort();
  if (!all.length) { console.error(`Нет папки .screens/*_${label}`); process.exit(1); }
  return all[all.length - 1];
}

function decode(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: не PNG`);
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6))
    throw new Error(`${file}: неподдержанный вид PNG (глубина ${bitDepth}, цвет ${colorType}, чересстрочный ${interlace})`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, bpp, px: out };
}

const [la = 'before', lb = 'after'] = process.argv.slice(2);
const A = pick(la), B = pick(lb);
console.log(`Сравниваю .screens/${A}  ↔  .screens/${B}\n`);
const names = readdirSync(join(ROOT, A)).filter((n) => n.endsWith('.png') && n !== 'ERROR.png').sort();
let bad = 0;
for (const n of names) {
  const fb = join(ROOT, B, n);
  if (!existsSync(fb)) { console.log(`· ${n} — НЕТ во втором прогоне`); bad++; continue; }
  const a = decode(join(ROOT, A, n)), b = decode(fb);
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`· ${n} — РАЗНЫЙ РАЗМЕР: ${a.width}×${a.height} и ${b.width}×${b.height}`); bad++; continue;
  }
  let diff = 0, x0 = a.width, y0 = a.height, x1 = -1, y1 = -1;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const ia = (y * a.width + x) * a.bpp, ib = (y * b.width + x) * b.bpp;
    if (a.px[ia] !== b.px[ib] || a.px[ia + 1] !== b.px[ib + 1] || a.px[ia + 2] !== b.px[ib + 2]) {
      diff++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  if (diff === 0) console.log(`· ${n} — совпадает до пикселя`);
  else { console.log(`· ${n} — РАЗЛИЧАЕТСЯ: ${diff} пикс., область x ${x0}–${x1}, y ${y0}–${y1}`); bad++; }
}
for (const n of readdirSync(join(ROOT, B)).filter((n) => n.endsWith('.png') && n !== 'ERROR.png'))
  if (!names.includes(n)) { console.log(`· ${n} — есть только во втором прогоне`); bad++; }
console.log(bad ? `\nРАЗЛИЧИЙ: ${bad}` : '\nВсе снимки совпадают до пикселя.');
process.exit(bad ? 1 : 0);
