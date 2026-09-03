/* ══ QR codes, drawn on the phone ════════════════════════
   The booking code is a hundred-odd characters and a nail tech has to get it
   off a customer's screen in a busy salon. That means a QR code, and it means
   generating it here: sending the code to an image service would hand a third
   party the one string that releases somebody's money.

   Byte mode, error correction level M, versions 1 to 10. M recovers about 15%
   of a damaged code, which is the right level for a screen being photographed
   at an angle under a ring light — L is too fragile for that and H wastes a
   third of the capacity we need.

   Verified against segno, an independent implementation, module for module,
   on every mask and every version this uses.                              */

const QR = (() => {
  /* ── GF(256), the field Reed-Solomon lives in ─────────── */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;        // the QR primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /* The generator polynomial for n error-correction codewords is
     (x-a^0)(x-a^1)...(x-a^(n-1)), built up one root at a time. */
  function generator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function ecFor(data, n) {
    const g = generator(n);
    const rem = new Array(n).fill(0);
    for (const byte of data) {
      const factor = byte ^ rem[0];
      rem.shift(); rem.push(0);
      for (let i = 0; i < n; i++) rem[i] ^= mul(g[i + 1], factor);
    }
    return rem;
  }

  /* ── the tables that make a version a version ─────────── */
  // [ec codewords per block, blocks in group 1, data codewords each,
  //  blocks in group 2, data codewords each] — error correction level M.
  const M = {
    1:  [10, 1, 16, 0, 0],
    2:  [16, 1, 28, 0, 0],
    3:  [26, 1, 44, 0, 0],
    4:  [18, 2, 32, 0, 0],
    5:  [24, 2, 43, 0, 0],
    6:  [16, 4, 27, 0, 0],
    7:  [18, 4, 31, 0, 0],
    8:  [22, 2, 38, 2, 39],
    9:  [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44],
  };

  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };

  const dataCodewords = (v) => {
    const [, b1, d1, b2, d2] = M[v];
    return b1 * d1 + b2 * d2;
  };

  /* Byte mode spends 4 bits on the mode and 8 on the length (16 from version
     10 up), so the usable characters are the leftovers. */
  function capacity(v) {
    const headerBits = 4 + (v >= 10 ? 16 : 8);
    return Math.floor((dataCodewords(v) * 8 - headerBits) / 8);
  }

  function pickVersion(len) {
    for (let v = 1; v <= 10; v++) if (capacity(v) >= len) return v;
    throw new Error(`${len} characters is more than a version 10 code holds`);
  }

  /* ── the bitstream ────────────────────────────────────── */
  function encode(bytes, v) {
    const bits = [];
    const push = (value, n) => {
      for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };

    push(0b0100, 4);                          // byte mode
    push(bytes.length, v >= 10 ? 16 : 8);
    for (const b of bytes) push(b, 8);

    const total = dataCodewords(v) * 8;
    for (let i = 0; i < 4 && bits.length < total; i++) bits.push(0);  // terminator
    while (bits.length % 8) bits.push(0);

    const words = [];
    for (let i = 0; i < bits.length; i += 8) {
      words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    }
    // The two pad bytes alternate. They are specified, not arbitrary.
    for (let i = 0; words.length < dataCodewords(v); i++) {
      words.push(i % 2 ? 0x11 : 0xec);
    }
    return words;
  }

  /* Blocks are interleaved: one codeword from each block in turn, then the
     error-correction codewords the same way. A burst of damage then falls
     across several blocks instead of destroying one. */
  function interleave(words, v) {
    const [ecLen, b1, d1, b2, d2] = M[v];
    const blocks = [];
    let at = 0;
    for (let i = 0; i < b1; i++) { blocks.push(words.slice(at, at + d1)); at += d1; }
    for (let i = 0; i < b2; i++) { blocks.push(words.slice(at, at + d2)); at += d2; }

    const ecs = blocks.map((b) => ecFor(b, ecLen));
    const out = [];
    const longest = Math.max(...blocks.map((b) => b.length));
    for (let i = 0; i < longest; i++) {
      for (const b of blocks) if (i < b.length) out.push(b[i]);
    }
    for (let i = 0; i < ecLen; i++) for (const e of ecs) out.push(e[i]);
    return out;
  }

  /* ── the picture ──────────────────────────────────────── */
  function blank(size) {
    return {
      m: Array.from({ length: size }, () => new Int8Array(size).fill(-1)),
      size,
    };
  }

  function put(g, r, c, v) {
    if (r >= 0 && c >= 0 && r < g.size && c < g.size) g.m[r][c] = v;
  }

  function finder(g, r, c) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
            (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        put(g, r + dr, c + dc, on ? 1 : 0);
      }
    }
  }

  function skeleton(v) {
    const size = 17 + 4 * v;
    const g = blank(size);

    finder(g, 0, 0);
    finder(g, 0, size - 7);
    finder(g, size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
      const on = i % 2 === 0 ? 1 : 0;
      g.m[6][i] = on; g.m[i][6] = on;            // timing
    }

    for (const r of ALIGN[v]) {
      for (const c of ALIGN[v]) {
        // Not on top of a finder pattern.
        if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            g.m[r + dr][c + dc] = on ? 1 : 0;
          }
        }
      }
    }

    g.m[size - 8][8] = 1;                        // the always-dark module

    // Reserve the format areas so data placement skips them.
    for (let i = 0; i < 9; i++) {
      if (g.m[8][i] === -1) g.m[8][i] = 0;
      if (g.m[i][8] === -1) g.m[i][8] = 0;
    }
    for (let i = 0; i < 8; i++) {
      if (g.m[8][size - 1 - i] === -1) g.m[8][size - 1 - i] = 0;
      if (g.m[size - 1 - i][8] === -1) g.m[size - 1 - i][8] = 0;
    }
    if (v >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          g.m[size - 11 + j][i] = 0;
          g.m[i][size - 11 + j] = 0;
        }
      }
    }
    return g;
  }

  /** Which modules the data is allowed to occupy — everything the skeleton
      did not claim. Computed once so masking can be applied and undone. */
  function freeMap(v) {
    const g = skeleton(v);
    const free = Array.from({ length: g.size }, () => new Uint8Array(g.size));
    const s = skeleton(v);
    // A module is free if it is still -1 in a grid where nothing was reserved.
    const bare = blank(g.size);
    finder(bare, 0, 0); finder(bare, 0, g.size - 7); finder(bare, g.size - 7, 0);
    for (let i = 8; i < g.size - 8; i++) {
      bare.m[6][i] = 0; bare.m[i][6] = 0;
    }
    for (const r of ALIGN[v]) for (const c of ALIGN[v]) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= g.size - 9) || (r >= g.size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) bare.m[r + dr][c + dc] = 0;
    }
    for (let i = 0; i < 9; i++) { bare.m[8][i] = 0; bare.m[i][8] = 0; }
    for (let i = 0; i < 8; i++) { bare.m[8][g.size - 1 - i] = 0; bare.m[g.size - 1 - i][8] = 0; }
    bare.m[g.size - 8][8] = 0;
    if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      bare.m[g.size - 11 + j][i] = 0; bare.m[i][g.size - 11 + j] = 0;
    }
    for (let r = 0; r < g.size; r++) for (let c = 0; c < g.size; c++) {
      free[r][c] = bare.m[r][c] === -1 ? 1 : 0;
    }
    return free;
  }

  /* Up the right-hand pair of columns, down the next pair, skipping column 6
     because the vertical timing pattern lives there. */
  function place(g, free, words) {
    const bits = [];
    for (const w of words) for (let i = 7; i >= 0; i--) bits.push((w >> i) & 1);

    let bit = 0, up = true;
    for (let right = g.size - 1; right > 0; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < g.size; step++) {
        const row = up ? g.size - 1 - step : step;
        for (let k = 0; k < 2; k++) {
          const col = right - k;
          if (!free[row][col]) continue;
          g.m[row][col] = bit < bits.length ? bits[bit] : 0;
          bit++;
        }
      }
      up = !up;
    }
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function applyMask(g, free, k) {
    const f = MASKS[k];
    for (let r = 0; r < g.size; r++) {
      for (let c = 0; c < g.size; c++) {
        if (free[r][c] && f(r, c)) g.m[r][c] ^= 1;
      }
    }
  }

  /* BCH(15,5) with the standard generator, then XOR by the specified mask so
     an all-zero format still has dark modules to lock onto. */
  function formatBits(maskIndex) {
    const data = (0b00 << 3) | maskIndex;         // 00 = level M
    let rem = data << 10;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
    return (((data << 10) | rem) ^ 0b101010000010010);
  }

  function writeFormat(g, maskIndex) {
    const bits = formatBits(maskIndex);
    const at = (i) => (bits >> i) & 1;
    const n = g.size;

    // Written as (row, column). The published reference implementations write
    // these as (x, y), which is the opposite order — reading one of them as
    // (row, col) transposes both copies, and produces a code that is the right
    // size, has correct finders and timing, and cannot be read by anything.
    for (let i = 0; i <= 5; i++) g.m[i][8] = at(i);   // down the column
    g.m[7][8] = at(6); g.m[8][8] = at(7); g.m[8][7] = at(8);
    for (let i = 9; i <= 14; i++) g.m[8][14 - i] = at(i);   // left along row 8

    for (let i = 0; i <= 7; i++) g.m[8][n - 1 - i] = at(i); // row 8, from the right
    for (let i = 8; i <= 14; i++) g.m[n - 15 + i][8] = at(i); // column 8, near the bottom
    g.m[n - 8][8] = 1;
  }

  function writeVersion(g, v) {
    if (v < 7) return;
    let rem = v << 12;
    for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0b1111100100101 << (i - 12);
    const bits = (v << 12) | rem;
    const n = g.size;
    for (let i = 0; i < 18; i++) {
      const b = (bits >> i) & 1;
      g.m[Math.floor(i / 3)][n - 11 + (i % 3)] = b;
      g.m[n - 11 + (i % 3)][Math.floor(i / 3)] = b;
    }
  }

  /* ── choosing a mask ──────────────────────────────────── */
  /* Four penalties, from the specification. Getting these wrong produces a
     code that looks perfect and will not scan, which is the worst kind of bug
     to ship: it fails in a salon, not in a test. */
  function penalty(g) {
    const n = g.size, m = g.m;
    let score = 0;

    // N1 — runs of five or more.
    for (let i = 0; i < n; i++) {
      for (const line of [m[i], m.map((row) => row[i])]) {
        let run = 1;
        for (let j = 1; j < n; j++) {
          if (line[j] === line[j - 1]) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
    }

    // N2 — 2x2 blocks of one colour.
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }

    // N3 — the finder-like 1:1:3:1:1 sequence with four light modules beside it.
    const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const has = (line, pat) => {
      let hits = 0;
      for (let i = 0; i + 11 <= n; i++) {
        let same = true;
        for (let j = 0; j < 11; j++) if (line[i + j] !== pat[j]) { same = false; break; }
        if (same) hits++;
      }
      return hits;
    };
    for (let i = 0; i < n; i++) {
      const row = Array.from(m[i]), col = m.map((r) => r[i]);
      score += 40 * (has(row, A) + has(row, B) + has(col, A) + has(col, B));
    }

    // N4 — how far from half dark.
    let dark = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
    const pct = (dark * 100) / (n * n);
    score += 10 * Math.floor(Math.abs(pct - 50) / 5);

    return score;
  }

  /**
   * Returns a square array of 0/1, no quiet zone. Pass a mask index to force
   * one; leave it out and the lowest-penalty mask is chosen, which is what the
   * specification asks for.
   */
  function matrix(text, forceMask) {
    const bytes = new TextEncoder().encode(text);
    const v = pickVersion(bytes.length);
    const words = interleave(encode(Array.from(bytes), v), v);
    const free = freeMap(v);

    let best = null, bestScore = Infinity;
    const masks = forceMask == null ? [0, 1, 2, 3, 4, 5, 6, 7] : [forceMask];
    for (const k of masks) {
      const g = skeleton(v);
      place(g, free, words);
      applyMask(g, free, k);
      writeFormat(g, k);
      writeVersion(g, v);
      const s = penalty(g);
      if (s < bestScore) { bestScore = s; best = g; }
    }
    return best.m.map((row) => Array.from(row));
  }

  /** The QR as one SVG string, ready to drop into innerHTML. */
  function svg(text, { size = 240, quiet = 4, dark = "#0b0b0f", light = "#ffffff" } = {}) {
    const m = matrix(text);
    const n = m.length, total = n + quiet * 2;
    let path = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
      `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" ` +
      `aria-label="Appointment code">` +
      `<rect width="${total}" height="${total}" fill="${light}"/>` +
      `<path d="${path}" fill="${dark}"/></svg>`;
  }

  return { matrix, svg, capacity, pickVersion };
})();

if (typeof module !== "undefined") module.exports = QR;
