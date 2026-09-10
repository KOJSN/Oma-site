function features() {
  const F = {};
  // A placeholder box left where the detector gave up is not a measurement.
  // Until the person drags it onto the nail it contributes nothing, otherwise
  // its arbitrary 1.11 would quietly pull the mean toward "well proportioned".
  const usable = f => S.boxes[f] && (!S.boxes[f].failed || S.boxes[f].edited);
  const rs = FINGERS.filter(usable).map(f => S.boxes[f].len / S.boxes[f].wid);
  if (rs.length) {
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const spread = Math.max(...rs) - Math.min(...rs);
    // Cross-finger agreement is the only internal check available. It cannot
    // catch a bias that hits all four the same way, which is why the result
    // screen states the read band rather than pretending to a point value.
    const conf = Math.max(0.30, Math.min(0.95, 1 - spread / 0.5));
    F.bed_aspect_ratio = { v: mean, conf, prov: "measured", spread, per: rs };
  }
  if (S.lines.finger && S.lines.palm) {
    const len = l => Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    const r = len(S.lines.finger) / Math.max(1, len(S.lines.palm));
    F.finger_to_palm = { v: r, conf: 0.6, prov: "measured" };
  }
  return F;
}

/* ══ engine (port of oma/engine.py against rules.json) ═ */
function matches(v, w) {
  if ("lt" in w && !(v < w.lt)) return false;
  if ("lte" in w && !(v <= w.lte)) return false;
  if ("gt" in w && !(v > w.gt)) return false;
  if ("gte" in w && !(v >= w.gte)) return false;
  return true;
}
function fmt(t, v) { return t.replace(/\{value:\.2f\}/g, v.toFixed(2)); }
function recommend(F, natural, short) {
  let out_withLength = null;
  const scores = {}, reasons = [], fired = [];
  for (const k in RULES.shapes) scores[k] = 0;
  for (const rule of RULES.rules) {
    const f = F[rule.feature];
    if (!f || !matches(f.v, rule.when)) continue;
    const w = Math.max(0.15, f.conf);
    for (const sh in rule.scores) if (sh in scores) scores[sh] += rule.scores[sh] * w;
    fired.push(rule.id);
    if (rule.measured_reason) reasons.push({ t: fmt(rule.measured_reason, f.v), p: "measured" });
    if (rule.convention_reason) reasons.push({ t: rule.convention_reason, p: "convention" });
  }
  const cfg = RULES.confidence;
  const primary = F[cfg.primary_feature] ? F[cfg.primary_feature].conf : 0;
  const others = Object.keys(F).filter(k => k !== cfg.primary_feature).map(k => F[k].conf);
  const support = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
  /* An ABSENT measurement is not a measurement of zero.
     The old line averaged a hard 0 in whenever the hand model had not run —
     which is often, because on real photographs it finds no hand at all in
     roughly three out of seven. With support pinned at 0 the arithmetic was
     0.6 × primary, so even a perfect read topped out at 0.57 and anything
     short of near-perfect agreement fell under the 0.45 threshold and dropped
     into the squoval fallback. That is why the answer was almost always
     squoval: not because hands are squoval, but because the confidence sum
     punished every scan for a reading it had never asked for.
     With nothing to support it, the primary measurement's own confidence is
     the honest figure. */
  let confidence = !fired.length ? 0
    : others.length ? cfg.primary_weight * primary + (1 - cfg.primary_weight) * support
    : primary;
  confidence = Math.max(0, Math.min(1, confidence));

  let recs = Object.keys(scores).map(k => ({
    shape: k, label: RULES.shapes[k].label, score: scores[k],
    durability: RULES.shapes[k].durability,
    note: RULES.durability_notes[RULES.shapes[k].durability],
    needsExt: RULES.shapes[k].needs_extensions
  }));
  const excluded = [], keep = [];
  for (const r of recs) {
    if (r.needsExt && natural && short) {
      r.why = `${r.label} needs acrylic or gel to hold. Your nails are short and
        natural right now, so this is a different appointment, not a different shape.`;
      excluded.push(r);
    } else keep.push(r);
  }
  keep.sort((a, b) => b.score - a.score);

  /* ── shape and length are two questions, not one ──────────────────
     Coffin and stiletto were UNREACHABLE. Not unlikely — impossible.
     Searching the whole feature space (1,382,304 combinations, every one
     at maximum confidence) neither shape won a single time, because in
     the only bands where coffin scores at all, square tops out at 4.8
     and squoval at 3.8 against coffin's ceiling of 3.6; stiletto's 1.6
     never passes almond's 3.4. No hand can change that, so the app could
     never say the two shapes people actually walk in asking for.

     The fix is not to bend the numbers until they win — there is no
     evidence for whatever numbers that took, and inventing them would
     make every other answer less trustworthy too. It is that these are
     not geometry shapes at all. They are a LENGTH, and a nail tech asks
     length as its own question after she has decided shape. So the
     ranking below picks the best shape for the bed, and `withLength`
     answers the second question — the better of the two long shapes for
     this same hand, ranked by the same rules that were always there. */
  const naturalShapes = keep.filter(r => !r.needsExt);
  const longShapes    = keep.filter(r => r.needsExt);
  if (longShapes.length) {
    const pick = longShapes[0];
    out_withLength = {
      ...pick,
      note: RULES.shapes[pick.shape].long_note || pick.note,
      runnerUp: longShapes[1] || null,
    };
  }

  // The full ranking, best first, so the result screen can show every shape
  // rather than one plus a comma-separated afterthought. `excluded` stays
  // separate: those are not low scores, they are shapes ruled out.
  /* No "not sure, have a squoval" any more.

     The ORDER of this ranking is far more robust than the number underneath
     it. The bed ratio moves by about ±0.11 between two careful passes over the
     same photograph, but the rules score BANDS rather than points, so a hand
     has to sit right on a cut point before that wobble changes which shape
     comes first. Refusing to name the top of a ranking we do trust, in favour
     of a shape picked because it offends nobody, threw away the answer and
     told her we had nothing to say.

     The one case that is still refused is the case where there is genuinely
     nothing: no nail was measurable at all, so no rule fired and the ranking
     is a tie between seven zeroes. That is a photograph problem rather than a
     shape, and it says so. */
  const out = { confidence, reasons, excluded, ranked: keep,
                withLength: out_withLength,
                version: RULES.version, fallback: false, unread: false };
  if (!fired.length || !keep.length || keep[0].score <= 0) {
    const fb = RULES.fallback, m = RULES.shapes[fb.shape];
    out.primary = {
      shape: fb.shape, label: m.label, score: 0,
      durability: m.durability, note: RULES.durability_notes[m.durability], needsExt: m.needs_extensions
    };
    out.unread = true;
    out.alternates = naturalShapes.filter(r => r.shape !== fb.shape).slice(0, 2);
  } else {
    out.primary = (naturalShapes.length ? naturalShapes : keep)[0];
    out.alternates = (naturalShapes.length ? naturalShapes : keep).slice(1, 3);
  }
  return out;
}