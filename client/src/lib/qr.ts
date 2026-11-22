/**
 * Small, dependency-free QR code generator (byte mode, any version 1–40), following the QR Code
 * specification (ISO/IEC 18004) as in Project Nayuki's reference design (MIT).
 * Used for the offline Emergency Health Card: the card's text is inside the QR itself,
 * so any phone camera can read it without internet or an app.
 */
export type Ecc = 'L' | 'M' | 'Q' | 'H';

const ECL_ORDINAL: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECL_FORMAT: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// prettier-ignore
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
// prettier-ignore
const NUM_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

function rawDataModules(ver: number) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = (ver: number, e: Ecc) =>
  Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ECL_ORDINAL[e]][ver] * NUM_BLOCKS[ECL_ORDINAL[e]][ver];

function gfMul(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree: number) {
  const r: number[] = new Array(degree - 1).fill(0).concat([1]);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data: number[], div: number[]) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => (r[i] ^= gfMul(c, f)));
  }
  return r;
}

export class QrCode {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly fn: boolean[][];

  constructor(
    readonly version: number,
    readonly ecc: Ecc,
    data: number[],
  ) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.drawFunctionPatterns();
    this.drawCodewords(this.interleave(data));
    // Pick the mask with the lowest penalty (makes the code easier to scan).
    let best = 0;
    let bestPenalty = Infinity;
    for (let m = 0; m < 8; m++) {
      this.applyMask(m);
      this.drawFormat(m);
      const p = this.penalty();
      if (p < bestPenalty) {
        best = m;
        bestPenalty = p;
      }
      this.applyMask(m); // undo (XOR)
    }
    this.applyMask(best);
    this.drawFormat(best);
  }

  /** Encode UTF-8 text, choosing the smallest version that fits. */
  static encodeText(text: string, ecc: Ecc = 'M'): QrCode {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    for (; ; ver++) {
      if (ver > 40) throw new Error('Too much text for one QR code');
      const countBits = ver <= 9 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= dataCodewords(ver, ecc) * 8) break;
    }
    const capacity = dataCodewords(ver, ecc) * 8;
    const bits: number[] = [];
    const put = (val: number, len: number) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    put(0x4, 4); // byte mode
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    put(0, Math.min(4, capacity - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
    const words: number[] = [];
    for (let i = 0; i < bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    return new QrCode(ver, ecc, words);
  }

  private set(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.fn[y][x] = true;
  }

  private alignmentPositions(): number[] {
    if (this.version === 1) return [];
    const n = Math.floor(this.version / 7) + 2;
    const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6];
    for (let pos = this.size - 7; r.length < n; pos -= step) r.splice(1, 0, pos);
    return r;
  }

  private drawFunctionPatterns() {
    const s = this.size;
    for (let i = 0; i < s; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [s - 4, 3],
      [3, s - 4],
    ])
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < s && y >= 0 && y < s) this.set(x, y, d !== 2 && d !== 4);
        }
    const al = this.alignmentPositions();
    const n = al.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    this.drawFormat(0);
    if (this.version >= 7) {
      let rem = this.version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (this.version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const b = bit(bits, i);
        const a = s - 11 + (i % 3);
        const c = Math.floor(i / 3);
        this.set(a, c, b);
        this.set(c, a, b);
      }
    }
  }

  private drawFormat(mask: number) {
    const data = (ECL_FORMAT[this.ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const s = this.size;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(bits, i));
    this.set(8, 7, bit(bits, 6));
    this.set(8, 8, bit(bits, 7));
    this.set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.set(s - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.set(8, s - 15 + i, bit(bits, i));
    this.set(8, s - 8, true);
  }

  private interleave(data: number[]): number[] {
    const o = ECL_ORDINAL[this.ecc];
    const numBlocks = NUM_BLOCKS[o][this.version];
    const eccLen = ECC_PER_BLOCK[o][this.version];
    const raw = Math.floor(rawDataModules(this.version) / 8);
    const numShort = numBlocks - (raw % numBlocks);
    const shortLen = Math.floor(raw / numBlocks);
    const div = rsDivisor(eccLen);
    const blocks: number[][] = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const out: number[] = [];
    for (let i = 0; i < blocks[0].length; i++)
      blocks.forEach((b, j) => {
        if (i !== shortLen - eccLen || j >= numShort) out.push(b[i]);
      });
    return out;
  }

  private drawCodewords(data: number[]) {
    const s = this.size;
    let i = 0;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < s; v++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? s - 1 - v : v;
          if (!this.fn[y][x] && i < data.length * 8) {
            this.modules[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
    }
  }

  private applyMask(m: number) {
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        let inv: boolean;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break; // prettier-ignore
          case 1: inv = y % 2 === 0; break; // prettier-ignore
          case 2: inv = x % 3 === 0; break; // prettier-ignore
          case 3: inv = (x + y) % 3 === 0; break; // prettier-ignore
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break; // prettier-ignore
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break; // prettier-ignore
          case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break; // prettier-ignore
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; // prettier-ignore
        }
        if (!this.fn[y][x] && inv) this.modules[y][x] = !this.modules[y][x];
      }
  }

  /** Simplified penalty: long runs, 2×2 blocks and dark/light balance (enough to pick a good mask). */
  private penalty(): number {
    const s = this.size;
    const m = this.modules;
    let p = 0;
    for (let a = 0; a < s; a++) {
      let runR = 1;
      let runC = 1;
      for (let b = 1; b < s; b++) {
        if (m[a][b] === m[a][b - 1]) runR++;
        else {
          if (runR >= 5) p += runR - 2;
          runR = 1;
        }
        if (m[b][a] === m[b - 1][a]) runC++;
        else {
          if (runC >= 5) p += runC - 2;
          runC = 1;
        }
      }
      if (runR >= 5) p += runR - 2;
      if (runC >= 5) p += runC - 2;
    }
    let dark = 0;
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        if (m[y][x]) dark++;
        if (x < s - 1 && y < s - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
      }
    p += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
    return p;
  }

  /** SVG path ("d") of the dark modules, with a quiet-zone border. */
  toPath(border = 4): string {
    const parts: string[] = [];
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) if (this.modules[y][x]) parts.push(`M${x + border},${y + border}h1v1h-1z`);
    return parts.join('');
  }
}
