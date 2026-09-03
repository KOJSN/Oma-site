/* ══ the result ══════════════════════════════════════ */
function bedWords(v) {
  const c = RULES.cut_points || {};
  const wide = c.bed_aspect_wide != null ? c.bed_aspect_wide : 1.15;
  const narrow = c.bed_aspect_narrow != null ? c.bed_aspect_narrow : 1.90;
  if (v < wide) return "Wide, short";
  if (v >= narrow) return "Long, narrow";
  return "In between";
}
function fingerWords(F) {
  if (!F.finger_to_palm) return "Not measured";
  const v = F.finger_to_palm.v;
  return v >= 1.05 ? "Long, slim" : v <= 0.85 ? "Short, broad" : "Balanced";
}

document.getElementById("finish").addEventListener("click", () => {
  const F = features();
  const rec = recommend(F, S.natural, S.short);
  renderResult(F, rec);
  go(4);
});

function renderResult(F, rec) {
  const bed = F.bed_aspect_ratio;
  // The band has to match how the beds were actually obtained. ±0.11 is the
  // hand-annotation figure — how far two careful human passes over the same
  // photograph moved. The detector is roughly three times worse than that
  // (mean absolute error 0.25 against annotated ground truth on eight study
  // hands, worst 0.53), so quoting 0.11 over a machine-drawn outline would be
  // exactly the confident wrong number this project keeps catching.
  const counted = FINGERS.filter(f => S.boxes[f] && (!S.boxes[f].failed || S.boxes[f].edited));
  const auto = counted.filter(f => !S.boxes[f].edited).length;
  const sigma = counted.length === 0 || auto === 0
    ? 0.11 : 0.11 + (0.25 - 0.11) * (auto / counted.length);
  const dropped = FINGERS.filter(f => S.boxes[f] && S.boxes[f].failed && !S.boxes[f].edited);
  const fit = Math.round(rec.confidence * 100);
  const shape = rec.primary.shape;
  // Millimetres exist only when the guide sheet was found, because only then
  // is there a known length in the photograph to measure against.
  let mm = null;
  if (S.mmPerPx && counted.length) {
    const L = counted.map(f => S.boxes[f].len * S.mmPerPx);
    const W = counted.map(f => S.boxes[f].wid * S.mmPerPx);
    mm = { len: +(L.reduce((a, b) => a + b, 0) / L.length).toFixed(1),
           wid: +(W.reduce((a, b) => a + b, 0) / W.length).toFixed(1),
           per: counted.map((f, i) => ({ f, l: +L[i].toFixed(1), w: +W[i].toFixed(1) })) };
  }

  S.last = {
    id: uid(), ts: Date.now(),
    shape, label: rec.primary.label, fit,
    bed: bed ? +bed.v.toFixed(3) : null,
    spread: bed ? +bed.spread.toFixed(3) : null,
    sigma: +sigma.toFixed(2),
    counted: counted.length, auto,
    fallback: rec.fallback,
    natural: S.natural, short: S.short,
    alts: rec.alternates.map(a => a.label),
    avoid: rec.excluded.map(e => e.label),
    note: rec.primary.note,
    words: bed ? bedWords(bed.v) : "Not measured",
    fingers: fingerWords(F),
    reasons: rec.reasons.slice(0, 4),
    mm, sheet: S.sheet ? { err: +S.sheet.err.toFixed(2) } : null,
  };

  /* Every shape the engine scored, as a percentage OF THE BEST ONE. The raw
     scores are weighted rule sums with no natural ceiling, so dividing by the
     top score is the only honest normalisation available — it says "how close
     is this to the best answer", which is a ranking, not a probability. A
     shape the rules pushed below zero shows as 0 rather than a negative. */
  const top = Math.max(0, ...(rec.ranked || []).map((x) => x.score));
  const rank = (rec.ranked || []).map((x) => ({
    shape: x.shape, label: x.label,
    pct: top > 0 ? Math.max(0, Math.round(x.score / top * 100)) : 0,
  }));
  S.last.rank = rank;

  const doers = DB.techs.filter(t => (t.s || []).some(sv =>
    (sv.sh || []).includes(shape) || (sv.n || "").toLowerCase().includes(shape)));
  const near = (doers.length ? doers : DB.techs).slice(0, 2);

  document.getElementById("resultHost").innerHTML = `
    <div class="resulthead">
      <div class="stack" style="align-items:flex-start">
        <div style="display:flex;align-items:center;gap:18px">
          <div class="shapeart">${shapeSVG(shape, 44, 66, "#fff", "rgba(255,255,255,.25)")}</div>
          <div>
            <div class="eyebrow" style="color:rgba(255,255,255,.85)">${rec.fallback ? "Best available" : "Best match"}</div>
            <div style="font-size:38px;font-weight:800;letter-spacing:-.04em;line-height:1.05;margin-top:4px">${esc(rec.primary.label)}</div>
            <div class="band">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M5 13l4 4 10-10"/></svg>
              ${fit}% fit
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="sheet">
      ${rec.fallback ? `<div class="note warn" style="margin-bottom:14px">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.1"/></svg>
        <div><b>Not confident enough to call it.</b> ${esc(rec.fallbackReason || "")}</div>
      </div>` : ""}

      <div class="grid2">
        <div class="tile"><div class="k">Nail bed</div><div class="v">${esc(S.last.words)}</div></div>
        <div class="tile"><div class="k">Fingers</div><div class="v">${esc(S.last.fingers)}</div></div>
      </div>

      <div class="note pink mt16">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.5 6.5 5 5M17.5 17.5 19 19M6.5 17.5 5 19M17.5 6.5 19 5"/><circle cx="12" cy="12" r="3.4"/></svg>
        <div>${esc(rec.primary.note)}</div>
      </div>

      <div class="seehead" style="padding-left:0;padding-right:0"><h3>How each shape fits</h3></div>
      <div class="fitlist">
        ${rank.length ? rank.map((x) => `
          <div class="fitrow${x.shape === shape ? " top" : ""}">
            <span class="fs">${shapeSVG(x.shape, 15, 22,
              x.shape === shape ? "var(--pink)" : "var(--faint)",
              x.shape === shape ? "var(--tint)" : "var(--fill)")}</span>
            <span class="fn">${esc(x.label)}</span>
            <span class="fb"><i style="width:${x.pct}%"></i></span>
            <b class="fp">${x.pct}%</b>
          </div>`).join("")
          : `<div class="r"><span style="flex:1">Nothing was measured, so nothing can be ranked.</span></div>`}
        ${rec.excluded.map((x) => `
          <div class="fitrow out">
            <span class="fs">${shapeSVG(x.shape, 15, 22, "var(--faint)", "var(--fill)")}</span>
            <span class="fn">${esc(x.label)}</span>
            <span class="fx">needs extensions</span>
          </div>`).join("")}
      </div>
      <div class="small sub" style="margin-top:10px;line-height:1.55">
        These are ranked against each other, not scored out of a hundred: the top
        one is 100% by definition and the rest are how close they came. They are
        often close together, and that is the honest picture — on the study hands
        the measurement that separates them varied by less than the uncertainty
        on measuring it. Treat the top two or three as a shortlist to talk about
        with your tech, not a verdict.
        ${rec.excluded.length ? "The greyed ones need acrylic or gel to hold, which is a different appointment." : ""}
      </div>

      <div class="seehead" style="padding-left:0;padding-right:0"><h3>What was measured</h3></div>
      <div class="menu">
        ${bed ? `
        <div class="r"><span style="flex:1">Nail bed, length ÷ width</span><b>${bed.v.toFixed(2)}</b></div>
        <div class="r"><span style="flex:1">Realistic range</span><b>${(bed.v - sigma).toFixed(2)} – ${(bed.v + sigma).toFixed(2)}</b></div>
        <div class="r"><span style="flex:1">Spread across ${counted.length} ${counted.length === 1 ? "nail" : "nails"}</span><b>${bed.spread.toFixed(2)}</b></div>`
        : `<div class="r"><span style="flex:1">No nail was read on this photo</span></div>`}
        ${F.finger_to_palm ? `<div class="r"><span style="flex:1">Finger against palm width</span><b>${F.finger_to_palm.v.toFixed(2)}</b></div>` : ""}
        ${mm ? `<div class="r"><span style="flex:1">Nail bed, actual size</span><b>${mm.len} × ${mm.wid} mm</b></div>` : ""}
      </div>
      ${S.sheet ? `<div class="note pink" style="margin-top:10px">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2.4" stroke-linecap="round"><path d="M5 13l4 4 10-10"/></svg>
        <div>Measured on the guide sheet. The photo was flattened to a straight-down view before
        anything was measured, so tilt is out of this reading, and the millimetres come from the
        printed 25&nbsp;mm squares — the corners closed to ${S.sheet.err.toFixed(2)}&nbsp;mm.
        The range below is still the one we measured without a sheet: nobody has yet checked
        whether the sheet narrows it.</div></div>` : ""}
      <div class="small sub" style="margin-top:10px;line-height:1.55">
        ${auto === 0
          ? `You adjusted every outline yourself, so the range is the ±0.11 that two careful
             human passes over the same photograph differ by.`
          : `${auto === counted.length
                ? (counted.length === 1 ? "The one outline was left as Oma drew it."
                   : `All ${counted.length} outlines were left as Oma drew them.`)
                : `${auto} of ${counted.length} outlines were left as Oma drew them.`} Against
             hand-annotated ground truth on eight study hands the detector's mean error is
             0.25 and its worst was 0.53 — and its own quality signals did not predict which.
             The range widens to ±${sigma.toFixed(2)} to say so.`}
        The single number is a midpoint, not a reading.
      </div>
      ${dropped.length ? `<div class="small sub" style="margin-top:8px;line-height:1.55">
        Oma could not read the ${dropped.join(" or ")} nail${dropped.length > 1 ? "s" : ""}, and
        ${dropped.length > 1 ? "they were" : "it was"} left out rather than guessed at.</div>` : ""}

      ${rec.reasons.length ? `
      <div class="seehead" style="padding-left:0;padding-right:0"><h3>Why</h3></div>
      <div class="stack gap10">
        ${rec.reasons.map(r => `<div class="card" style="display:flex;gap:11px;align-items:flex-start">
          <span class="tag ${r.p === "measured" ? "" : "grey"}" style="flex:none">${r.p}</span>
          <span class="small sub" style="line-height:1.5">${esc(r.t)}</span>
        </div>`).join("")}
      </div>
      <div class="small faint" style="margin-top:10px;line-height:1.5">
        <b>Measured</b> is what the photograph showed. <b>Convention</b> is what nail techs do
        about it — professional practice, not a fact about your hands.
      </div>` : ""}

      ${near.length ? `
      <div class="seehead" style="padding-left:0;padding-right:0">
        <h3>Techs who could do ${esc(rec.primary.label.toLowerCase())}</h3>
      </div>
      <div class="stack gap10">
        ${near.map(t => techRow(t)).join("")}
      </div>` : `
      <div class="empty mt20">
        <div class="ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg></div>
        <b>No nail techs yet</b>
        Techs reach you by sharing their Oma link. Open one and they appear under Salons.
      </div>`}

      <div style="height:20px"></div>
    </div>`;
}
