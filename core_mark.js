function boxCorners(b) {
  const a = b.ang * Math.PI / 180, ax = Math.cos(a), ay = Math.sin(a);
  const bx = -ay, by = ax, L = b.len / 2, W = b.wid / 2;
  return [[-L, -W], [L, -W], [L, W], [-L, W]].map(([u, v]) =>
    [b.cx + u * ax + v * bx, b.cy + u * ay + v * by]);
}
function handlePts(b) {
  const a = b.ang * Math.PI / 180, ax = Math.cos(a), ay = Math.sin(a);
  const bx = -ay, by = ax, L = b.len / 2, W = b.wid / 2;
  return {
    lenA: [b.cx - L * ax, b.cy - L * ay], lenB: [b.cx + L * ax, b.cy + L * ay],
    widA: [b.cx - W * bx, b.cy - W * by], widB: [b.cx + W * bx, b.cy + W * by]
  };
}
function drawMark() {
  ov.setAttribute("viewBox", `0 0 ${S.iw} ${S.ih}`);
  const cur = FINGERS[S.active];
  const r = Math.max(S.iw, S.ih) * 0.013;
  let out = "";
  FINGERS.forEach(f => {
    const b = S.boxes[f]; if (!b) return;
    const on = f === cur;
    const pts = boxCorners(b).map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");
    out += `<polygon class="bx${on ? "" : " ghosted"}${b.failed ? " unread" : ""}" points="${pts}"></polygon>`;
    if (on) {
      const hp = handlePts(b);
      out += `<line class="cross" x1="${hp.lenA[0]}" y1="${hp.lenA[1]}" x2="${hp.lenB[0]}" y2="${hp.lenB[1]}"></line>`;
      out += `<line class="cross" x1="${hp.widA[0]}" y1="${hp.widA[1]}" x2="${hp.widB[0]}" y2="${hp.widB[1]}"></line>`;
      for (const k in hp) out += `<circle class="hd" cx="${hp[k][0]}" cy="${hp[k][1]}" r="${r}"></circle>`;
    }
  });
  ov.innerHTML = out;
  tabs.innerHTML = FINGERS.map((f, i) =>
    `<button type="button" class="${i === S.active ? "on" : ""} ${S.boxes[f] && !S.boxes[f].failed ? "has" : ""}" data-f="${i}">${f}</button>`).join("");
  tabs.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    S.active = +b.dataset.f; drawMark();
  }));
  const done = FINGERS.filter(f => S.boxes[f]).length;
  const b = S.boxes[cur];
  const title = document.getElementById("markTitle");
  const help = document.getElementById("markHelp");
  if (!b) {
    title.textContent = `Tap the ${cur} nail`;
    help.innerHTML = `Tap the middle of the <b>pink part</b> — not the white
      tip. Oma outlines it, measures it and moves to the next nail.`;
  } else if (b.failed) {
    // The placeholder is a guess, and saying "measured at 1.11" over a guess
    // is the confident wrong number this project keeps catching.
    title.textContent = `Oma could not read the ${cur} nail`;
    help.innerHTML = `Not enough contrast between nail and skin here. Drag this
      box onto the nail bed and size it to the <b>pink part</b>, or tap the
      nail again to retry.`;
  } else {
    title.textContent = `Check the ${cur} nail`;
    help.innerHTML = `Measured at <b>${b.ratio.toFixed(2)}</b>. If the outline
      is off, drag a dot to fix it, or tap the nail again to remeasure.`;
  }
  const nx = document.getElementById("markNext");
  const read = FINGERS.filter(f => S.boxes[f] && (!S.boxes[f].failed || S.boxes[f].edited)).length;
  // One reading is enough to continue with. Four is better and the label says
  // so, but a nail that will not read on this photo should not trap anyone on
  // this screen — the result states how many it was built from.
  nx.disabled = read === 0;
  nx.textContent = read === FINGERS.length ? "All four done — continue"
    : read === 0 ? "Tap a nail to start"
    : `Continue with ${read} of 4`;
  drawProgress();
}

function toImg(ev, el) {
  const r = el.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) / r.width * S.iw,
    y: (ev.clientY - r.top) / r.height * S.ih,
    rect: r
  };
}
function showLoupe(p, r) {
  const z = 4, half = 132 / (2 * z);
  loupeC.imageSmoothingEnabled = false;
  loupeC.clearRect(0, 0, 132, 132);
  loupeC.drawImage(S.src, p.x - half, p.y - half, half * 2, half * 2, 0, 0, 132, 132);
  loupeC.strokeStyle = "#9E2B4E"; loupeC.lineWidth = 1;
  loupeC.beginPath(); loupeC.moveTo(66, 52); loupeC.lineTo(66, 80);
  loupeC.moveTo(52, 66); loupeC.lineTo(80, 66); loupeC.stroke();
  const lx = (p.x / S.iw) * r.width, ly = (p.y / S.ih) * r.height;
  loupe.style.left = Math.max(4, Math.min(r.width - 136, lx - 66)) + "px";
  loupe.style.top = (ly > 160 ? ly - 150 : ly + 20) + "px";
  loupe.classList.add("on");
}

function setFromDetector(f, res, seed) {
  if (!res || !res.ok) {
    // A fallback box, clearly marked as a guess, beats an error message: the
    // person can drag it onto the nail in one move.
    const s = Math.min(S.iw, S.ih) * 0.075;
    S.boxes[f] = { cx: seed.x, cy: seed.y, len: s, wid: s * 0.9, ang: -90,
                   auto: false, failed: true, ratio: s / (s * 0.9), fill: 0, gap: 0 };
    return false;
  }
  S.boxes[f] = { cx: res.cx, cy: res.cy, len: res.len, wid: res.wid, ang: res.ang,
                 auto: true, edited: false, ratio: res.ratio, fill: res.fill, gap: res.gap };
  return true;
}

let drag = null;
stage.addEventListener("pointerdown", e => {
  if (!S.img) return;
  const p = toImg(e, stage), f = FINGERS[S.active], b = S.boxes[f];
  const grab = Math.max(S.iw, S.ih) * 0.035;
  if (b) {
    const hp = handlePts(b);
    let mode = null, best = grab;
    for (const k in hp) {
      const d = Math.hypot(p.x - hp[k][0], p.y - hp[k][1]);
      if (d < best) { best = d; mode = k; }
    }
    if (!mode && Math.hypot(p.x - b.cx, p.y - b.cy) < Math.max(b.len, b.wid) / 2) mode = "move";
    if (mode) {
      drag = { mode, p0: p, b0: { ...b } };
      stage.setPointerCapture(e.pointerId);
      showLoupe(p, p.rect);
      e.preventDefault();
      return;
    }
  }
  // A tap anywhere else is a new seed for this finger.
  const isNew = !b;
  setFromDetector(f, detectNail(p.x, p.y), p);
  // Four taps in a row should read four nails. Only a nail that had nothing on
  // it moves the selection on; tapping a finger you came back to is a
  // correction, and jumping away from a correction is how people lose it.
  if (isNew) {
    const next = FINGERS.findIndex(x => !S.boxes[x]);
    if (next >= 0) S.active = next;
  }
  drawMark();
  e.preventDefault();
});
stage.addEventListener("pointermove", e => {
  if (!drag) return;
  const p = toImg(e, stage), f = FINGERS[S.active], b = S.boxes[f], o = drag.b0;
  const a = o.ang * Math.PI / 180, ax = Math.cos(a), ay = Math.sin(a), bx = -ay, by = ax;
  if (drag.mode === "move") {
    b.cx = o.cx + (p.x - drag.p0.x); b.cy = o.cy + (p.y - drag.p0.y);
  } else {
    const px = p.x - o.cx, py = p.y - o.cy;
    const u = Math.abs(px * ax + py * ay), v = Math.abs(px * bx + py * by);
    if (drag.mode.startsWith("len")) b.len = Math.max(8, u * 2);
    else b.wid = Math.max(6, v * 2);
  }
  b.ratio = b.len / b.wid;
  b.edited = true;
  drawMark(); showLoupe(p, p.rect);
});
function endDrag() { drag = null; loupe.classList.remove("on"); }
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

document.getElementById("markBack").addEventListener("click", () => go(0));
document.getElementById("markNext").addEventListener("click", () => {
  // The button says continue, so it continues. It used to step to the next
  // finger instead, which meant the label lied; a tap now moves the selection
  // on by itself, so there is nothing left for this button to do but leave.
  go(3);
});

/* Proportions has been removed. It asked for two dragged lines and produced
   one secondary feature; the hand model measures both from the skeleton, and
   when there is no skeleton the engine does without the feature rather than
   being handed a guess. */
