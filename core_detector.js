/* ══ the detector ════════════════════════════════════
   One tap gives it the three things that are hard without a landmark model:
   which finger, where the nail is, and what this nail's colour looks like.
   Growing outward from there is the tractable part.

   Full auto-detection was built first and thrown away: with no hand model, a
   patterned bedspread beat the background estimate outright, a sleeve pulled
   the principal axis 87 degrees off, and the digit-splitting step found three
   fingers where there were four — five of eight study hands lost. MediaPipe
   would fix that and its browser build is 9MB of WASM before the model, which
   cannot be inlined here.

   Distance is weighted toward CHROMA and away from LIGHTNESS on purpose.
   Nail and skin differ mostly in the a and b channels; a specular highlight
   differs mostly in L. Weighted equally, a glossy nail splits along its own reflection and
   the region keeps only the lit half.                                      */
const LW = 0.35;            // how much lightness counts against colour
const WIN_FRAC = 0.16;      // search window, fraction of the short side
const LOOSE_TOL = 11.0;     // sizing pass radius, weighted Lab
const TOL_SCALE = 1.05;

function srgbToLab(r, g, b) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * .4124 + G * .3576 + B * .1805) / .95047;
  const Y = (R * .2126 + G * .7152 + B * .0722);
  const Z = (R * .0193 + G * .1192 + B * .9505) / 1.08883;
  const t = v => v > 0.008856 ? Math.cbrt(v) : (7.787 * v + 16 / 116);
  const fx = t(X), fy = t(Y), fz = t(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function wdist(l1, a1, b1, l2, a2, b2) {
  const dl = (l1 - l2) * LW, da = a1 - a2, db = b1 - b2;
  return Math.sqrt(dl * dl + da * da + db * db);
}
function medianOf(list) {
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/* hint: how far around the seed to look, in pixels. A tap gives no clue, so it
   falls back to a fraction of the photograph. A fingertip landmark DOES give a
   clue — the finger's own length — and a window sized to the finger is both
   quicker to walk and less likely to contain a distraction that outbids the
   nail. That is what makes probing a nail from a dozen seeds affordable. */
function detectNail(seedX, seedY, hint) {
  if (!S.px) {
    S.px = S.src.getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, S.iw, S.ih);
  }
  const wide = Math.min(S.iw, S.ih) * WIN_FRAC;
  const win = Math.round(hint ? Math.max(24, Math.min(hint, wide)) : wide);
  const sx = Math.round(seedX), sy = Math.round(seedY);
  const x0 = Math.max(0, sx - win), x1 = Math.min(S.iw, sx + win);
  const y0 = Math.max(0, sy - win), y1 = Math.min(S.ih, sy + win);
  const w = x1 - x0, h = y1 - y0;
  if (w < 24 || h < 24) return null;

  // Lab for the window only.
  const L = new Float32Array(w * h), A = new Float32Array(w * h), B = new Float32Array(w * h);
  const d = S.px.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y + y0) * S.iw + (x + x0)) * 4, di = y * w + x;
      const lab = srgbToLab(d[si], d[si + 1], d[si + 2]);
      L[di] = lab[0]; A[di] = lab[1]; B[di] = lab[2];
    }
  }
  const ly = sy - y0, lx = sx - x0;

  // Nail colour: a disc at the tap, not the single pixel under a fingertip.
  const rd = Math.max(2, Math.round(win * 0.10));
  const dl = [], da = [], db = [];
  for (let y = Math.max(0, ly - rd); y < Math.min(h, ly + rd + 1); y++)
    for (let x = Math.max(0, lx - rd); x < Math.min(w, lx + rd + 1); x++) {
      if ((y - ly) ** 2 + (x - lx) ** 2 > rd * rd) continue;
      const i = y * w + x; dl.push(L[i]); da.push(A[i]); db.push(B[i]);
    }
  if (dl.length < 5) return null;
  const nl = medianOf(dl), na = medianOf(da), nb = medianOf(db);

  const flood = ok => {
    const seen = new Uint8Array(w * h);
    const si = ly * w + lx;
    if (!ok(si)) return null;
    seen[si] = 1;
    const st = [si];
    let n = 0;
    while (st.length) {
      const i = st.pop(); n++;
      const y = (i / w) | 0, x = i % w;
      if (x > 0 && !seen[i - 1] && ok(i - 1)) { seen[i - 1] = 1; st.push(i - 1); }
      if (x < w - 1 && !seen[i + 1] && ok(i + 1)) { seen[i + 1] = 1; st.push(i + 1); }
      if (y > 0 && !seen[i - w] && ok(i - w)) { seen[i - w] = 1; st.push(i - w); }
      if (y < h - 1 && !seen[i + w] && ok(i + w)) { seen[i + w] = 1; st.push(i + w); }
    }
    return { seen, n };
  };

  // Pass one sizes the nail so the reference ring can be placed relative to
  // it. A fixed radius is wrong at both ends: too tight and the ring sits on
  // the nail and poisons the references, too wide and it misses the skin.
  const dn = i => wdist(L[i], A[i], B[i], nl, na, nb);
  const p1 = flood(i => dn(i) <= LOOSE_TOL);
  if (!p1 || p1.n < 20) return null;
  let rad = p1.n > 0.45 * w * h ? win * 0.30 : Math.sqrt(p1.n / Math.PI);
  rad = Math.max(rad, win * 0.12);

  // Everything that is NOT the nail, sampled rather than modelled. A single
  // "skin" average is not enough: the ring around a fingertip usually holds
  // the desk as well, a white desk sits close to a pale nail in chroma, and a
  // short nail touches the desk at the tip — so the region walked out through
  // the fingertip. Asking "more like the nail, or more like anything else
  // around it" closes that, and closes it for shadows and sleeves too.
  const rin = rad * 1.35, rout = Math.min(rad * 2.6, win - 2);
  const ex = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const dd = Math.hypot(y - ly, x - lx);
    if (dd >= rin && dd <= rout) { const i = y * w + x; ex.push([L[i], A[i], B[i]]); }
  }
  if (ex.length < 30) return null;
  const step = Math.max(1, Math.floor(ex.length / 120));
  const refs = ex.filter((_, i) => i % step === 0);
  const gap = wdist(nl, na, nb,
    medianOf(ex.map(e => e[0])), medianOf(ex.map(e => e[1])), medianOf(ex.map(e => e[2])));
  if (gap < 4) return { ok: false, reason: "nail and surroundings too close in colour" };
  const tol = gap * TOL_SCALE;

  const cache = new Float32Array(w * h).fill(-1);
  const dOther = i => {
    if (cache[i] >= 0) return cache[i];
    let best = Infinity;
    for (let k = 0; k < refs.length; k++) {
      const v = wdist(L[i], A[i], B[i], refs[k][0], refs[k][1], refs[k][2]);
      if (v < best) best = v;
    }
    return (cache[i] = best);
  };
  const p2 = flood(i => { const a = dn(i); return a <= tol && a < dOther(i); });
  if (!p2 || p2.n < 25 || p2.n > 0.30 * w * h) return null;

  // Principal axes of the blob itself: a finger at any angle measures right,
  // and the photograph never has to be rotated.
  let sx2 = 0, sy2 = 0, n = 0;
  for (let i = 0; i < p2.seen.length; i++) if (p2.seen[i]) {
    sx2 += i % w; sy2 += (i / w) | 0; n++;
  }
  const cx = sx2 / n, cy = sy2 / n;
  let vxx = 0, vyy = 0, vxy = 0;
  for (let i = 0; i < p2.seen.length; i++) if (p2.seen[i]) {
    const px = (i % w) - cx, py = ((i / w) | 0) - cy;
    vxx += px * px; vyy += py * py; vxy += px * py;
  }
  vxx /= n; vyy /= n; vxy /= n;
  const tr = vxx + vyy, det = vxx * vyy - vxy * vxy;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;
  let ax, ay;
  if (Math.abs(vxy) > 1e-9) { ax = l1 - vyy; ay = vxy; }
  else if (vxx >= vyy) { ax = 1; ay = 0; } else { ax = 0; ay = 1; }
  const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m;
  const bx = -ay, by = ax;
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
  for (let i = 0; i < p2.seen.length; i++) if (p2.seen[i]) {
    const px = (i % w) - cx, py = ((i / w) | 0) - cy;
    const u = px * ax + py * ay, v = px * bx + py * by;
    if (u < aMin) aMin = u; if (u > aMax) aMax = u;
    if (v < bMin) bMin = v; if (v > bMax) bMax = v;
  }
  const len = aMax - aMin, wid = bMax - bMin;
  if (len < 6 || wid < 5) return null;
  const fill = n / Math.max(len * wid, 1);
  return {
    ok: true,
    cx: cx + x0 + (aMin + aMax) / 2 * ax + (bMin + bMax) / 2 * bx,
    cy: cy + y0 + (aMin + aMax) / 2 * ay + (bMin + bMax) / 2 * by,
    len, wid, ang: Math.atan2(ay, ax) * 180 / Math.PI,
    fill, gap, ratio: len / wid
  };
}
