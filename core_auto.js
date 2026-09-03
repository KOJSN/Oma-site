/* ══ the automatic read ══════════════════════════════
   People told Kamsy the tapping was stressful. This does it for them.

   The honest history matters here, because it says what this is allowed to
   claim. Full auto-detection WAS built first, with no hand model, and it lost
   five of the eight study hands: a patterned bedspread beat the background
   estimate, a sleeve pulled the principal axis 87 degrees off, and the
   digit-splitting step found three fingers where there were four. Tapping
   exists because of that.

   What changed is not the ambition but the size of the problem. The app never
   needed to understand a hand. It needed four points, one per nail — and the
   region grower, which already worked, does the rest. A landmark model hands
   those four points over directly, and the nail plate sits centred on the TIP
   landmark (measured on these same hands; see nails.py), so the landmark IS
   the seed.

   Re-measured against the hand-annotated beds, all 28 nails of the study set,
   on JPEGs at the quality a phone actually produces — the first pass of this
   was measured on the source PNGs and flattered itself by about 0.08, which is
   the sort of thing that only shows up if you go and look:

                             unread    mean    median   worst
       tapping, perfectly    3 of 28   0.446   0.162    1.912
       this                  4 of 28   0.289   0.242    0.865

   Read that honestly. It is NOT uniformly better than tapping: a perfect tap
   still has the better typical error. What it has is a far better worst case —
   the tail halves — and it never asks anybody for anything. "Tapping, done
   perfectly" also means the exact centre of a hand-drawn box, which no thumb
   on a 5-inch screen has ever achieved; the real comparison is kinder than
   this table and we have no data to say by how much, so the table stands as
   the pessimistic one.

   The 4 unread are spread across three hands and no hand fell below two nails,
   which the engine already handles: an unread nail is left out of the mean
   rather than voting with a placeholder.

   Both columns are still coarse — the grower over-reads on a scale whose first
   decision boundary is 1.00. That is the app as it already ships and the result
   screen already states its band. Nothing here pretends otherwise.        */

const MP_VER = "0.4.1675469240";
const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@" + MP_VER + "/";

// MediaPipe's 21 joints. The nail sits on the TIP; DIP gives the finger's own
// axis and length, which is what sizes the search.
const LM_TIP = { index: 8, middle: 12, ring: 16, pinky: 20 };
const LM_DIP = { index: 7, middle: 11, ring: 15, pinky: 19 };
const LM_MCP = { index: 5, middle: 9, ring: 13, pinky: 17 };

let MPHANDS = null;          // the loaded model, kept for the next scan
let MPDEAD = null;           // why it cannot be used, if it cannot

/* ══ measuring what has never been measured ══════════
   Every number in the table above came from eight photographs on a desktop in
   a container. Nobody has ever run this on a phone, over Nigerian mobile data,
   which is where all of it actually has to work — and "about 9 MB" and "about
   three seconds" are both estimates, not observations.

   So the scan times itself. This is OFF for everybody: it shows nothing unless
   the app was opened once with ?timing=1, which sets a flag this phone keeps.
   A real customer never sees it. */
const MPT = { script: 0, init: 0, find: 0, nails: 0, warm: false, bytes: null };

function timingOn() {
  try {
    const q = (location.search || "") + (location.hash || "");
    if (q.indexOf("timing=1") !== -1) localStorage.setItem("oma-timing", "1");
    if (q.indexOf("timing=0") !== -1) localStorage.removeItem("oma-timing");
    return !!localStorage.getItem("oma-timing");
  } catch (e) { return false; }   // private mode: simply off
}

/* What actually came down the wire, from the browser's own resource timing.
   transferSize is 0 when a response came from cache — which is the answer we
   want on the second scan, and is worth distinguishing from "not reported". */
function mpBytes() {
  try {
    if (!window.performance || !performance.getEntriesByType) return null;
    const rs = performance.getEntriesByType("resource")
      .filter(r => String(r.name).indexOf(MP_BASE) === 0);
    if (!rs.length) return null;
    let transfer = 0, body = 0, reported = 0;
    for (const r of rs) {
      transfer += r.transferSize || 0;
      body += r.encodedBodySize || 0;
      if (r.encodedBodySize) reported++;
    }
    // jsdelivr sends Timing-Allow-Origin, but if it ever stops, every size
    // reads 0 and a "0 MB download" would be a lie. Say so instead.
    return { files: rs.length, transfer, body, reported };
  } catch (e) { return null; }
}

const mb = (n) => (n / 1048576).toFixed(2) + " MB";
const secs = (ms) => ms >= 1000 ? (ms / 1000).toFixed(1) + " s" : Math.round(ms) + " ms";

function showTiming(res) {
  const el = document.getElementById("autoTiming");
  if (!el) return;
  if (!timingOn()) { el.className = "hidden"; return; }
  const b = MPT.bytes;
  const size = !b ? "not reported by this browser"
    : !b.reported ? `${b.files} files, sizes hidden by the CDN`
    : b.transfer === 0 ? `${mb(b.body)}, all from cache`
    : `${mb(b.transfer)} over the wire (${mb(b.body)} unpacked, ${b.files} files)`;
  const rows = [
    ["Model", MPT.warm ? "already loaded, nothing downloaded" : size],
    ["Download + start", MPT.warm ? "—" : secs(MPT.script + MPT.init)],
    ["Finding the hand", MPT.find ? secs(MPT.find) : "—"],
    ["Reading 4 nails", MPT.nails ? secs(MPT.nails) : "—"],
    ["Result", res.ok ? `read ${res.read} of 4` : "failed: " + (res.why || "?")],
  ];
  el.className = "note";
  el.style.marginTop = "14px";
  el.innerHTML = `<div style="width:100%"><div class="tiny"
      style="font-weight:700;margin-bottom:6px">Timing (only you see this)</div>`
    + rows.map(r => `<div class="rowbetween tiny" style="padding:2px 0">
         <span class="faint">${r[0]}</span><span>${esc(String(r[1]))}</span></div>`).join("")
    + `</div>`;
}

function mpScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.crossOrigin = "anonymous";
    s.onload = () => res();
    s.onerror = () => rej(new Error("could not be downloaded"));
    document.head.appendChild(s);
  });
}

/* Loaded the first time somebody scans, never when the app opens. It is about
   9 MB and the phone caches it afterwards, so this is a one-off — but it is a
   one-off on somebody's mobile data, which is why it is not fetched until a
   photo is actually in hand. */
function withTimeout(p, ms, msg) {
  return Promise.race([p, new Promise((_, rej) =>
    setTimeout(() => rej(new Error(msg)), ms))]);
}

async function loadHandModel() {
  if (MPHANDS) { MPT.warm = true; return MPHANDS; }
  MPT.warm = false;
  if (MPDEAD) throw new Error(MPDEAD);
  const t0 = performance.now();
  if (!window.Hands) {
    await withTimeout(mpScript(MP_BASE + "hands.js"), 40000, "the download stalled");
  }
  MPT.script = performance.now() - t0;
  if (!window.Hands) throw new Error("the hand model did not start");
  const h = new window.Hands({ locateFile: f => MP_BASE + f });
  h.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,      // the lite model found a hand on only 4 of our 8
    staticImageMode: true,
    minDetectionConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
  // Timed on a desktop this is about three seconds; on a phone on a bad
  // connection it is the 9 MB arriving, and it CAN simply never finish. Without
  // a bound on it somebody sits on this screen forever, which is a worse
  // failure than being asked to tap. Two minutes, then hand over to tapping.
  const t1 = performance.now();
  await withTimeout(h.initialize(), 120000, "the download stalled");
  MPT.init = performance.now() - t1;
  // Read after initialize(), because that is when the .wasm and the model
  // weights actually arrive — hands.js on its own is a small fraction of it.
  MPT.bytes = mpBytes();
  MPHANDS = h;
  return h;
}

function findHand(canvas) {
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error("the hand model timed out")), 45000);
    try {
      MPHANDS.onResults((r) => {
        clearTimeout(to);
        const L = r && r.multiHandLandmarks && r.multiHandLandmarks[0];
        if (!L) return res(null);
        res(L.map(p => [p.x * canvas.width, p.y * canvas.height]));
      });
      MPHANDS.send({ image: canvas }).catch((e) => { clearTimeout(to); rej(e); });
    } catch (e) { clearTimeout(to); rej(e); }
  });
}

/* A probe is only believed if it looks like a nail and stayed near the
   fingertip. Without this a region that leaks down the finger comes back as a
   confident 2.8, which is exactly the kind of wrong number this project keeps
   catching.

   The landmark hands over a SCALE as well as a place — L, the last joint to the
   tip — and a nail is about half of it. Insisting on that is the single biggest
   improvement measured here: on the study set it cut the worst error from 1.29
   to 0.87 and the mean from 0.42 to 0.29. It costs 4 of 28 nails, which the
   engine already knows how to do without; no hand fell below two. */
function believable(r, tip, L, strict) {
  if (!(r && r.ok && r.ratio >= 0.55 && r.ratio <= 2.4)) return false;
  if (Math.hypot(r.cx - tip[0], r.cy - tip[1]) / L > 0.55) return false;
  if (!strict) return true;
  return r.len >= 0.26 * L && r.len <= 0.70 * L &&
         r.wid >= 0.22 * L && r.wid <= 0.68 * L;
}

/* The landmark first, and only if that comes back empty, a short walk outward.
   Kamsy's "even if it takes time" bought a wider net, so a wider net was tried:
   fifteen probes per nail, taking the median. It made the answer WORSE — more
   than twice the median error — because seeds placed off the nail grow the
   FINGER instead, and a median over probes that disagree is not a measurement,
   it is an average of one right answer and several wrong ones. The time is
   better spent on the size gate below. Extra probes only help where there is
   no answer at all yet. */
const LADDER = [[0, 0], [-0.10, 0], [0.10, 0], [0, -0.10], [0, 0.10],
                [-0.18, 0], [0.18, 0], [0, -0.16], [0, 0.16]];

function readOneNail(tip, dip, L, strict) {
  const ax = [(tip[0] - dip[0]) / L, (tip[1] - dip[1]) / L];   // along the finger
  const px = [-ax[1], ax[0]];                                  // across it
  for (let i = 0; i < LADDER.length; i++) {
    const u = LADDER[i][0], v = LADDER[i][1];
    const x = tip[0] + (u * ax[0] + v * px[0]) * L;
    const y = tip[1] + (u * ax[1] + v * px[1]) * L;
    let r = null;
    // The window is sized to the finger rather than to the photograph. A tap
    // gives no clue where the nail ends so it has to search wide; a landmark
    // does, and the narrower window is both quicker and less likely to contain
    // something that outbids the nail.
    try { r = detectNail(x, y, L * 0.62); } catch (e) { r = null; }
    if (believable(r, tip, L, strict)) return r;
  }
  return null;
}

const breathe = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

/* Returns { ok, read, why }. It never throws for a reason the person could act
   on — those come back as `why` so the screen can say them plainly. */
async function autoRead(say) {
  if (!S.src) return { ok: false, read: 0, why: "no photo" };
  say("Getting ready — this part downloads once");
  try {
    await loadHandModel();
  } catch (e) {
    MPDEAD = e.message || "the hand model could not be loaded";
    return { ok: false, read: 0, why: "model", detail: MPDEAD };
  }

  say("Finding your hand");
  await breathe();
  let pts = null;
  const tFind = performance.now();
  try {
    pts = await findHand(S.src);
  } catch (e) {
    MPT.find = performance.now() - tFind;
    return { ok: false, read: 0, why: "model", detail: e.message };
  }
  MPT.find = performance.now() - tFind;
  if (!pts) return { ok: false, read: 0, why: "nohand" };

  // Finger length and palm width, straight off the skeleton. This is what the
  // Proportions step used to ask people to drag, and it is the same two
  // measurements — knuckle to tip, and across the knuckles — taken by
  // something that does not have to aim.
  const d = (a, b) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
  S.lines.finger = { x1: pts[9][0], y1: pts[9][1], x2: pts[12][0], y2: pts[12][1] };
  S.lines.palm = { x1: pts[5][0], y1: pts[5][1], x2: pts[17][0], y2: pts[17][1] };
  S.handPts = pts;

  S.boxes = {};
  let read = 0;
  const tNails = performance.now();
  // Two passes, and the second almost never runs. The first insists on a
  // nail-sized region; if that leaves the WHOLE hand with nothing, the second
  // takes what it can get, because no reading at all is worse than a rough one.
  // On the eight study hands the first pass never left a hand empty.
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1 && read > 0) break;
    if (pass === 1) say("Looking again, less strictly");
    S.boxes = {}; read = 0;
  for (let i = 0; i < FINGERS.length; i++) {
    const f = FINGERS[i];
    if (pass === 0) say("Reading your " + f + " nail");
    await breathe();
    const tip = pts[LM_TIP[f]], dip = pts[LM_DIP[f]];
    const L = Math.hypot(tip[0] - dip[0], tip[1] - dip[1]);
    const r = L > 4 ? readOneNail(tip, dip, L, pass === 0) : null;
    if (r) {
      S.boxes[f] = { cx: r.cx, cy: r.cy, len: r.len, wid: r.wid, ang: r.ang,
                     auto: true, edited: false, ratio: r.ratio,
                     fill: r.fill, gap: r.gap };
      read++;
    } else {
      // Marked as a guess, exactly as a failed tap is. features() leaves it
      // out of the mean until somebody drags it onto the nail, so a nail this
      // could not read never quietly votes.
      const s = Math.max(12, L * 0.55);
      S.boxes[f] = { cx: tip[0], cy: tip[1], len: s, wid: s * 0.9,
                     ang: Math.atan2(tip[1] - dip[1], tip[0] - dip[0]) * 180 / Math.PI,
                     auto: false, failed: true, ratio: s / (s * 0.9), fill: 0, gap: 0 };
    }
    drawAuto();
  }
  }
  MPT.nails = performance.now() - tNails;
  return { ok: read > 0, read: read, why: read ? null : "noread" };
}

/* ══ the reading screen ══════════════════════════════ */
function drawAuto() {
  const ov = document.getElementById("ov3");
  if (!ov) return;
  ov.setAttribute("viewBox", `0 0 ${S.iw} ${S.ih}`);
  ov.innerHTML = FINGERS.map(f => {
    const b = S.boxes[f];
    if (!b) return "";
    const pts = boxCorners(b).map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");
    return `<polygon class="bx${b.failed ? " unread" : ""}" points="${pts}"></polygon>`;
  }).join("");
}

function autoSay(msg) {
  const el = document.getElementById("autoSay");
  if (el) el.textContent = msg;
}
function autoBar(frac) {
  const el = document.getElementById("autoBar");
  if (el) el.style.width = Math.round(frac * 100) + "%";
}

let AUTORUN = 0;
async function runAuto() {
  const mine = ++AUTORUN;
  document.getElementById("autoNote").className = "hidden";
  document.getElementById("autoFoot").className = "hidden";
  document.getElementById("autoWork").className = "";
  document.getElementById("autoTiming").className = "hidden";
  MPT.find = 0; MPT.nails = 0;
  autoBar(0.05);
  drawAuto();

  let n = 0;
  const say = (m) => {
    if (mine !== AUTORUN) return;
    autoSay(m);
    autoBar(Math.min(0.92, 0.06 + (++n) * 0.15));
  };

  let res;
  try {
    res = await autoRead(say);
  } catch (e) {
    res = { ok: false, read: 0, why: "model", detail: e.message };
  }
  if (mine !== AUTORUN) return;          // the scan was closed or restarted

  autoBar(1);
  document.getElementById("autoWork").className = "hidden";

  showTiming(res);

  if (res.ok) {
    autoSay(res.read === 4 ? "All four nails read"
                           : `Read ${res.read} of 4 — the rest were not clear enough`);
    document.getElementById("autoFoot").className = "";
    // Moving on by itself is the point of the whole change — except while
    // timing, where being carried off the screen before the numbers can be
    // read defeats the reason for measuring.
    if (timingOn()) return;
    // It moves on by itself. That is the whole point of the change: nobody has
    // to press anything to get past this screen. The pause is long enough to
    // see the outlines land and reach for Check them if they look wrong.
    setTimeout(() => { if (mine === AUTORUN && S.step === 1) go(3); }, 2200);
    return;
  }

  // Everything below is a dead end for the automatic route, so it says which
  // one, and hands over to tapping rather than leaving somebody stuck.
  const note = document.getElementById("autoNote");
  note.className = "note warn";
  const msg = {
    model: `<b>The automatic reader could not start.</b> That usually means the
            connection dropped or stalled while it was downloading. You can tap
            the nails instead — it takes about twenty seconds.`,
    nohand: `<b>No hand found in that photo.</b> Lay the hand flat, palm down,
             fingers slightly apart, and shoot straight down from above. Or tap
             the nails yourself on this photo.`,
    noread: `<b>Found your hand, but could not read the nails.</b> Usually the
             nail and the skin are too close in colour under this light. Tapping
             each nail gives it a much better starting point.`,
  }[res.why] || `<b>That did not work.</b> You can tap the nails instead.`;
  note.innerHTML =
    `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/>
      <path d="M12 8v5M12 16v.1"/></svg><div>${msg}</div>`;
  autoSay("");
  document.getElementById("autoFoot").className = "";
  // A failed automatic pass leaves no boxes behind to argue with.
  if (res.why !== "noread") S.boxes = {};
  drawAuto();
}

document.getElementById("autoGo").addEventListener("click", () => {
  AUTORUN++;                       // stop the timer from moving her a second time
  if (!Object.keys(S.boxes).length) return go(2);   // nothing read; tapping it is
  go(3);
});
document.getElementById("autoFix").addEventListener("click", () => {
  AUTORUN++;
  S.active = 0;
  drawMark();
  go(2);
});
