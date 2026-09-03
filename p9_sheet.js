/* ══ the guide sheet ═════════════════════════════════
   One printed page removes the two unknowns that broke every real photo we
   tried. Four ArUco markers at known millimetre positions give a homography,
   so tilt stops being something to reject and becomes something to CORRECT —
   every hand in the study failed the 22° pose gate, and the gate only existed
   because tilt could not be undone. The same homography carries scale, so a
   nail measured on the sheet is measured in millimetres.

   No OpenCV in a browser, so the detector is written out longhand: adaptive
   threshold, connected components, a quad per component, a 6×6 sample, and a
   16-bit match against the four codes this page actually prints. The minimum
   Hamming distance between those sixteen codes (four markers × four
   rotations) is 7, so accepting up to 3 wrong bits is still unambiguous.

   The marker bit patterns below came out of the same OpenCV dictionary the
   printable sheet is drawn from, so the page and the reader cannot drift
   apart: both read this constant.                                          */
const SHEET = {
  W: 210, H: 297,          // A4 in millimetres
  MARKER: 25,              // printed size of each square
  INSET: 14,               // page edge to the outside of a marker
  // id -> the 16 data bits, as one integer, at 0/90/180/270 clockwise
  CODES: {"0":[46386,4823,19629,60232],"1":[3994,58022,23024,25927],
          "2":[13101,34939,46284,56849],"3":[39238,15491,25241,49468]},
};
function markerCentres(w, h) {
  const c = SHEET.INSET + SHEET.MARKER / 2;
  return [[c, c], [w - c, c], [w - c, h - c], [c, h - c]];   // TL TR BR BL
}

/* ── linear algebra, only as much as is needed ─────── */
function solve(A, b, n) {
  // Gaussian elimination with partial pivoting. A is n×n row-major.
  const M = A.slice(), x = b.slice();
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r * n + i]) > Math.abs(M[p * n + i])) p = r;
    if (Math.abs(M[p * n + i]) < 1e-12) return null;
    if (p !== i) {
      for (let c = 0; c < n; c++) { const t = M[i * n + c]; M[i * n + c] = M[p * n + c]; M[p * n + c] = t; }
      const t = x[i]; x[i] = x[p]; x[p] = t;
    }
    for (let r = i + 1; r < n; r++) {
      const f = M[r * n + i] / M[i * n + i];
      if (!f) continue;
      for (let c = i; c < n; c++) M[r * n + c] -= f * M[i * n + c];
      x[r] -= f * x[i];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let c = i + 1; c < n; c++) s -= M[i * n + c] * x[c];
    x[i] = s / M[i * n + i];
  }
  return x;
}
function normaliser(pts) {
  // Hartley normalisation. Pixel coordinates run to 1600 and millimetres to
  // 300; without this the normal equations are badly conditioned and the fit
  // quietly loses precision exactly where it matters.
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  let d = 0;
  for (const p of pts) d += Math.hypot(p[0] - cx, p[1] - cy);
  d /= pts.length;
  const s = d > 1e-9 ? Math.SQRT2 / d : 1;
  return { T: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1],
           apply: p => [(p[0] - cx) * s, (p[1] - cy) * s] };
}
function mul3(A, B) {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
}
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const k = 1 / det;
  return [A * k, (c * h - b * i) * k, (b * f - c * e) * k,
          B * k, (a * i - c * g) * k, (c * d - a * f) * k,
          C * k, (b * g - a * h) * k, (a * e - b * d) * k];
}
function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
function homography(src, dst) {
  if (src.length < 4) return null;
  const ns = normaliser(src), nd = normaliser(dst);
  const S = src.map(ns.apply), D = dst.map(nd.apply);
  const n = 8, ATA = new Array(64).fill(0), ATb = new Array(8).fill(0);
  const row = new Array(8);
  for (let i = 0; i < S.length; i++) {
    const [x, y] = S[i], [X, Y] = D[i];
    for (const [r, v] of [[[x, y, 1, 0, 0, 0, -x * X, -y * X], X],
                          [[0, 0, 0, x, y, 1, -x * Y, -y * Y], Y]]) {
      for (let a = 0; a < n; a++) {
        row[a] = r[a];
        ATb[a] += r[a] * v;
      }
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) ATA[a * n + b] += row[a] * row[b];
    }
  }
  const h = solve(ATA, ATb, n);
  if (!h) return null;
  const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  const Ti = inv3(nd.T);
  if (!Ti) return null;
  const H = mul3(Ti, mul3(Hn, ns.T));
  const k = H[8];
  return Math.abs(k) < 1e-14 ? null : H.map(v => v / k);
}

/* ── finding the four squares ──────────────────────── */
function toGrey(data, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4)
    g[i] = (data[p] * 77 + data[p + 1] * 151 + data[p + 2] * 28) >> 8;
  return g;
}
function adaptive(g, w, h) {
  // Mean of a local window from an integral image, minus a constant. A global
  // threshold fails the moment one half of the page is in shadow, which on a
  // hand-held phone photo is most of the time.
  const S = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run += g[y * w + x];
      S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + run;
    }
  }
  const r = Math.max(3, Math.round(Math.min(w, h) * 0.015));
  const bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = S[(y1 + 1) * (w + 1) + x1 + 1] - S[y0 * (w + 1) + x1 + 1]
                - S[(y1 + 1) * (w + 1) + x0] + S[y0 * (w + 1) + x0];
      bin[y * w + x] = g[y * w + x] < sum / area - 7 ? 1 : 0;
    }
  }
  return bin;
}
function darkBlobs(bin, w, h, minA, maxA) {
  const seen = new Uint8Array(w * h), out = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!bin[s] || seen[s]) continue;
    let top = 0; stack[top++] = s; seen[s] = 1;
    let area = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    const edge = [];
    while (top) {
      const i = stack[--top], x = i % w, y = (i / w) | 0;
      area++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      let border = false;
      if (x > 0) { const j = i - 1; if (bin[j]) { if (!seen[j]) { seen[j] = 1; stack[top++] = j; } } else border = true; }
      else border = true;
      if (x < w - 1) { const j = i + 1; if (bin[j]) { if (!seen[j]) { seen[j] = 1; stack[top++] = j; } } else border = true; }
      else border = true;
      if (y > 0) { const j = i - w; if (bin[j]) { if (!seen[j]) { seen[j] = 1; stack[top++] = j; } } else border = true; }
      else border = true;
      if (y < h - 1) { const j = i + w; if (bin[j]) { if (!seen[j]) { seen[j] = 1; stack[top++] = j; } } else border = true; }
      else border = true;
      if (border) edge.push(x, y);
    }
    if (area < minA || area > maxA) continue;
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (bw < 12 || bh < 12) continue;
    if (bw / bh > 4 || bh / bw > 4) continue;
    out.push({ area, cx: sx / area, cy: sy / area, edge });
  }
  return out;
}
function quadOf(b) {
  const e = b.edge, n = e.length / 2;
  if (n < 16) return null;
  const far = (px, py) => {
    let bi = 0, bd = -1;
    for (let i = 0; i < n; i++) {
      const dx = e[i * 2] - px, dy = e[i * 2 + 1] - py, d = dx * dx + dy * dy;
      if (d > bd) { bd = d; bi = i; }
    }
    return [e[bi * 2], e[bi * 2 + 1]];
  };
  // The corner farthest from the centroid is an outer corner; the corner
  // farthest from that is the opposite one. Points on the marker's inner
  // white cells can never beat an outer corner at either extreme, so the
  // holes in the pattern do not confuse this.
  const p1 = far(b.cx, b.cy), p2 = far(p1[0], p1[1]);
  const ux = p2[0] - p1[0], uy = p2[1] - p1[1];
  const diag = Math.hypot(ux, uy);
  if (diag < 16) return null;
  let a = null, c = null, ad = 0, cd = 0;
  for (let i = 0; i < n; i++) {
    const x = e[i * 2], y = e[i * 2 + 1];
    const cr = (ux * (y - p1[1]) - uy * (x - p1[0])) / diag;
    if (cr > ad) { ad = cr; a = [x, y]; }
    if (-cr > cd) { cd = -cr; c = [x, y]; }
  }
  if (!a || !c || ad < diag * 0.15 || cd < diag * 0.15) return null;
  let q = [p1, a, p2, c];
  let s2 = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    s2 += q[i][0] * q[j][1] - q[j][0] * q[i][1];
  }
  if (s2 < 0) q = [p1, c, p2, a];        // keep the winding consistent
  const side = i => Math.hypot(q[i][0] - q[(i + 1) % 4][0], q[i][1] - q[(i + 1) % 4][1]);
  const L = [side(0), side(1), side(2), side(3)];
  if (Math.max(...L) / Math.max(1e-6, Math.min(...L)) > 2.6) return null;
  return q;
}
function readMarker(g, w, h, q) {
  // Sample a 6×6 grid through the quad's own homography, so a marker seen at
  // an angle is read as reliably as one seen flat.
  const H = homography([[0, 0], [6, 0], [6, 6], [0, 6]], q);
  if (!H) return null;
  const cell = new Float64Array(36);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    let sum = 0, k = 0;
    for (const [dy, dx] of [[0, 0], [-.22, 0], [.22, 0], [0, -.22], [0, .22]]) {
      const [x, y] = applyH(H, c + 0.5 + dx, r + 0.5 + dy);
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null;
      sum += g[yi * w + xi]; k++;
    }
    cell[r * 6 + c] = sum / k;
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of cell) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 26) return null;               // no pattern, just a dark blob
  const t = (lo + hi) / 2;
  let bad = 0;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    if (r > 0 && r < 5 && c > 0 && c < 5) continue;
    if (cell[r * 6 + c] >= t) bad++;           // border must be black
  }
  if (bad > 2) return null;
  let code = 0;
  for (let r = 1; r < 5; r++) for (let c = 1; c < 5; c++)
    code = (code << 1) | (cell[r * 6 + c] >= t ? 1 : 0);
  let best = null;
  for (const id in SHEET.CODES) {
    SHEET.CODES[id].forEach((ref, k) => {
      let d = 0, x = code ^ ref;
      while (x) { d += x & 1; x >>>= 1; }
      if (d <= 3 && (!best || d < best.d)) best = { id: +id, rot: k, d };
    });
  }
  return best;
}

/* ── the whole thing ───────────────────────────────── */
function detectSheet(data, w, h) {
  const g = toGrey(data, w, h);
  const bin = adaptive(g, w, h);
  const area = w * h;
  const blobs = darkBlobs(bin, w, h, area * 0.00012, area * 0.06);
  const found = new Map();
  for (const b of blobs) {
    const q = quadOf(b);
    if (!q) continue;
    const m = readMarker(g, w, h, q);
    if (!m) continue;
    const prev = found.get(m.id);
    if (!prev || m.d < prev.d) found.set(m.id, { ...m, q });
  }
  if (found.size < 4) return { ok: false, markers: found.size };

  const centres = markerCentres(SHEET.W, SHEET.H), half = SHEET.MARKER / 2;
  const src = [], dst = [];
  for (const [id, m] of found) {
    const [cx, cy] = centres[id];
    // Canonical corners, clockwise from the marker's own top-left.
    const C = [[cx - half, cy - half], [cx + half, cy - half],
               [cx + half, cy + half], [cx - half, cy + half]];
    for (let j = 0; j < 4; j++) {
      src.push(m.q[j]);
      dst.push(C[(j + 4 - m.rot) % 4]);
    }
  }
  const H = homography(src, dst);          // image pixels -> page millimetres
  if (!H) return { ok: false, markers: found.size };

  let err = 0;
  for (let i = 0; i < src.length; i++) {
    const p = applyH(H, src[i][0], src[i][1]);
    err += Math.hypot(p[0] - dst[i][0], p[1] - dst[i][1]);
  }
  err /= src.length;

  const o = applyH(H, 0, 0), ex = applyH(H, 1, 0), ey = applyH(H, 0, 1);
  const mmPerPx = (Math.hypot(ex[0] - o[0], ex[1] - o[1]) +
                   Math.hypot(ey[0] - o[0], ey[1] - o[1])) / 2;

  return { ok: err < 2.0, markers: found.size, H, err, mmPerPx };
}

/* ── flatten the page ──────────────────────────────── */
/* The window is the part of the sheet a hand can occupy, which keeps the
   rectified image small enough to stay responsive while leaving the nails
   the resolution the region grower needs. */
const RECT_WIN = { x0: 8, y0: 46, x1: 202, y1: 291 };
function rectify(srcCanvas, det, maxSide) {
  const wmm = RECT_WIN.x1 - RECT_WIN.x0, hmm = RECT_WIN.y1 - RECT_WIN.y0;
  const s = Math.min(8, (maxSide || 1500) / Math.max(wmm, hmm));
  const W = Math.round(wmm * s), H2 = Math.round(hmm * s);
  const Hi = inv3(det.H);                       // millimetres -> image pixels
  if (!Hi) return null;

  const sc = srcCanvas.getContext("2d", { willReadFrequently: true });
  const sp = sc.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const sw = srcCanvas.width, sh = srcCanvas.height, sd = sp.data;
  const out = new ImageData(W, H2), od = out.data;

  for (let v = 0; v < H2; v++) {
    const Y = RECT_WIN.y0 + v / s;
    for (let u = 0; u < W; u++) {
      const X = RECT_WIN.x0 + u / s;
      const wgt = Hi[6] * X + Hi[7] * Y + Hi[8];
      const x = (Hi[0] * X + Hi[1] * Y + Hi[2]) / wgt;
      const y = (Hi[3] * X + Hi[4] * Y + Hi[5]) / wgt;
      const o = (v * W + u) * 4;
      if (x < 0 || y < 0 || x >= sw - 1 || y >= sh - 1) {
        od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255;
        continue;
      }
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4;
      const i01 = i00 + sw * 4, i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy, w11 = fx * fy;
      for (let ch = 0; ch < 3; ch++) {
        od[o + ch] = sd[i00 + ch] * w00 + sd[i10 + ch] * w10
                   + sd[i01 + ch] * w01 + sd[i11 + ch] * w11;
      }
      od[o + 3] = 255;
    }
  }
  const c = document.createElement("canvas");
  c.width = W; c.height = H2;
  c.getContext("2d").putImageData(out, 0, 0);
  return { canvas: c, pxPerMm: s };
}
