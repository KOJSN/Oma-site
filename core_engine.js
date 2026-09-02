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
  let confidence = fired.length ? cfg.primary_weight * primary + (1 - cfg.primary_weight) * support : 0;
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

  // The full ranking, best first, so the result screen can show every shape
  // rather than one plus a comma-separated afterthought. `excluded` stays
  // separate: those are not low scores, they are shapes ruled out.
  const out = { confidence, reasons, excluded, ranked: keep,
                version: RULES.version, fallback: false };
  if (!keep.length || confidence < cfg.recommend_threshold || keep[0].score <= 0) {
    const fb = RULES.fallback, m = RULES.shapes[fb.shape];
    out.primary = {
      shape: fb.shape, label: m.label, score: scores[fb.shape] || 0,
      durability: m.durability, note: RULES.durability_notes[m.durability], needsExt: m.needs_extensions
    };
    out.fallback = true; out.fallbackReason = fb.reason;
    out.alternates = keep.filter(r => r.shape !== fb.shape).slice(0, 2);
  } else {
    out.primary = keep[0];
    out.alternates = keep.slice(1, 3);
  }
  return out;
}