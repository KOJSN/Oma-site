/* ══ printing the sheet ══════════════════════════════
   Drawn from the same SHEET constant the detector reads, at whatever
   resolution is asked for. A sheet whose geometry disagreed with the reader
   would fail silently and look like a bad photo, so there is exactly one
   description of the page and both ends use it.                            */
function drawSheet(ctx, s, hand) {
  const W = SHEET.W * s, H = SHEET.H * s;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  // The four markers.
  const cells = SHEET.MARKER / 6;
  markerCentres(SHEET.W, SHEET.H).forEach(([cx, cy], id) => {
    const code = SHEET.CODES[String(id)][0];
    const x0 = (cx - SHEET.MARKER / 2) * s, y0 = (cy - SHEET.MARKER / 2) * s;
    ctx.fillStyle = "#000";
    ctx.fillRect(x0, y0, SHEET.MARKER * s, SHEET.MARKER * s);
    ctx.fillStyle = "#fff";
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (!((code >> (15 - (r * 4 + c))) & 1)) continue;
      ctx.fillRect(x0 + (c + 1) * cells * s, y0 + (r + 1) * cells * s,
                   cells * s + 0.5, cells * s + 0.5);
    }
  });

  // The hand guide. Drawn twice — once fat in grey, once thin in white — so
  // what survives is the OUTLINE of the union. Stroking the parts separately
  // would leave seams across the palm and it would read as a diagram rather
  // than a hand.
  const cxm = SHEET.W / 2, cym = SHEET.H * 0.62, flip = hand === "left" ? -1 : 1;
  const P = (x, y) => [(cxm + x * flip) * s, (cym + y) * s];
  const OW = 0.9;
  const parts = ctx2 => {
    ctx2.beginPath();
    const palm = [[-40, 6], [40, 2], [46, 34], [34, 66], [-34, 66], [-44, 34]];
    palm.forEach(([x, y], i) => {
      const p = P(x, y);
      i ? ctx2.lineTo(p[0], p[1]) : ctx2.moveTo(p[0], p[1]);
    });
    ctx2.closePath();
    ctx2.fill(); ctx2.stroke();
    ctx2.beginPath();
    const e = P(0, 8);
    ctx2.ellipse(e[0], e[1], 42 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx2.fill(); ctx2.stroke();
  };
  const digits = [[-31, -26, 74, 17], [-10, -9, 84, 18],
                  [11, 8, 80, 17], [31, 26, 62, 15]];
  const capsules = (ctx2, extra) => {
    ctx2.lineCap = "round";
    for (const [dx, ang, len, wide] of digits) {
      const a = ang * Math.PI / 180;
      const b = P(dx, 8), t = P(dx + Math.sin(a) * len, 8 - len);
      ctx2.lineWidth = (wide + extra) * s;
      ctx2.beginPath(); ctx2.moveTo(b[0], b[1]); ctx2.lineTo(t[0], t[1]); ctx2.stroke();
    }
    const tb = P(40, 40), tt = P(40 + 0.80 * 52, 40 - 0.60 * 52);
    ctx2.lineWidth = (21 + extra) * s;
    ctx2.beginPath(); ctx2.moveTo(tb[0], tb[1]); ctx2.lineTo(tt[0], tt[1]); ctx2.stroke();
  };
  ctx.save();
  ctx.fillStyle = "#b0b0b6"; ctx.strokeStyle = "#b0b0b6";
  ctx.lineJoin = "round"; ctx.lineWidth = 2 * OW * s;
  parts(ctx); capsules(ctx, 2 * OW);
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.01;
  parts(ctx); capsules(ctx, 0);
  ctx.restore();

  const text = (str, ymm, sizeMm, col, weight) => {
    ctx.fillStyle = col;
    ctx.font = `${weight || 600} ${sizeMm * s}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(str, W / 2, ymm * s);
  };
  text("OMA", 60, 9, "#c22a66", 800);
  text("Lay your hand flat inside the outline. Spread your fingers.", 71, 3.6, "#46404a", 600);
  text("Hold the phone directly above, and keep all four corner squares in shot.",
       78, 3.6, "#46404a", 600);
  text("The white paper is the colour reference — do not write on this sheet.",
       SHEET.H - 26, 3.0, "#928a90", 500);
  text(`Oma guide sheet · A4 · ${hand === "left" ? "left" : "right"} hand · print at 100%, no scaling`,
       SHEET.H - 19, 3.0, "#928a90", 500);
}

let SHEET_HAND = "right";
function vSheet() {
  return `
  ${head("The guide sheet", "One printed page, and tilt stops mattering")}
  <div class="pad">
    <div class="note pink">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><path d="M6 9V4h12v5M6 18h12v-5H6v5ZM6 13H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/></svg>
      <div>Print this on plain white A4 at <b>100%, no scaling</b>. Lay your hand on it and
        photograph it from directly above with all four corner squares in shot.</div>
    </div>

    <div class="pills mt16">
      <button class="pill ${SHEET_HAND === "right" ? "on" : ""}" data-a="sheetHand" data-v="right">Right hand</button>
      <button class="pill ${SHEET_HAND === "left" ? "on" : ""}" data-a="sheetHand" data-v="left">Left hand</button>
    </div>

    <div class="card mt16" style="padding:10px;background:var(--fill)">
      <canvas id="sheetPrev" style="width:100%;height:auto;display:block;border-radius:12px;
        background:#fff;box-shadow:var(--card-shadow)"></canvas>
    </div>

    <div class="btnrow mt16">
      <button class="btn sm" data-a="sheetPng">Download to print</button>
      <button class="btn sm ghost" data-a="sheetPrint">Print now</button>
    </div>

    <div class="seehead" style="padding-left:0;padding-right:0"><h3>What the page is doing</h3></div>
    <div class="menu">
      <div class="r"><span style="flex:1">The four squares<br>
        <span class="tiny sub">Known positions, so the photo can be flattened to a straight-down
        view. Every hand in our study failed the tilt check; with the sheet, tilt is corrected
        instead of refused.</span></span></div>
      <div class="r"><span style="flex:1">Their printed size<br>
        <span class="tiny sub">25&nbsp;mm each, so pixels convert to millimetres and a nail can be
        measured in real units rather than ratios alone.</span></span></div>
      <div class="r"><span style="flex:1">The paper itself<br>
        <span class="tiny sub">A bright, even background is the best case for telling finger from
        surface — the patterned bedspread in one of our own test photos defeated the detector
        outright.</span></span></div>
    </div>
    <div class="small faint" style="margin-top:12px;line-height:1.55">
      Print at 100%. If your printer scales to fit, the squares come out the wrong size and the
      millimetres will be wrong — the shape reading still works, the sizing does not.
    </div>
  </div>
  <div style="height:20px"></div>`;
}
function paintSheetPreview() {
  const c = document.getElementById("sheetPrev");
  if (!c) return;
  const s = 2.6;                       // preview scale, px per mm
  c.width = Math.round(SHEET.W * s);
  c.height = Math.round(SHEET.H * s);
  drawSheet(c.getContext("2d"), s, SHEET_HAND);
}
function sheetBlob(dpi) {
  const s = (dpi || 300) / 25.4;
  const c = document.createElement("canvas");
  c.width = Math.round(SHEET.W * s);
  c.height = Math.round(SHEET.H * s);
  drawSheet(c.getContext("2d"), s, SHEET_HAND);
  return new Promise(res => c.toBlob(res, "image/png"));
}
function printSheet() {
  const s = 300 / 25.4;
  const c = document.createElement("canvas");
  c.width = Math.round(SHEET.W * s);
  c.height = Math.round(SHEET.H * s);
  drawSheet(c.getContext("2d"), s, SHEET_HAND);
  const w = window.open("", "_blank");
  if (!w) { toast("Your browser blocked the print window — use Download instead."); return; }
  w.document.write(`<!doctype html><title>Oma guide sheet</title>
    <style>@page{size:A4;margin:0}html,body{margin:0;padding:0}
      img{width:210mm;height:297mm;display:block}</style>
    <img src="${c.toDataURL("image/png")}" onload="window.print()">`);
  w.document.close();
}
