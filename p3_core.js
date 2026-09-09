const RULES = __RULES__;

/* Which build this actually is. build2.py substitutes it, and stamps the same
   value into site/sw.js, so "is the phone running what I just uploaded" stops
   being a guess: Settings shows this, the first line of /sw.js shows the same
   value, and they only agree when both files were uploaded together. */
const BUILD_ID = "__BUILD__";

/* ══ state ═══════════════════════════════════════════ */
const FINGERS = ["index", "middle", "ring", "pinky"];
const S = {
  step: 0, img: null, iw: 0, ih: 0,
  // finger -> {cx, cy, len, wid, ang, auto, edited}. Oriented, because a nail
  // is measured along its own axis; an axis-aligned box would report the
  // photograph's rotation as part of the shape.
  boxes: {},
  active: 0,
  lines: { finger: null, palm: null },
  lineIdx: 0,
  natural: true, short: true,
  src: null, px: null,
  last: null,                 // the result now on screen, before it is saved
};

/* ══ theme ═══════════════════════════════════════════ */
let theme = null;
try { theme = localStorage.getItem("oma-theme"); } catch (e) { theme = null; }
function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches);
}
function applyTheme(t) {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
}
applyTheme(theme);
function toggleTheme() {
  theme = isDark() ? "light" : "dark";
  applyTheme(theme);
  try { localStorage.setItem("oma-theme", theme); } catch (e) { /* private mode */ }
  paint();
}

/* ══ small helpers ═══════════════════════════════════ */
function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
let toastT = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("on"), 2600);
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function when(ts) {
  const d = new Date(ts), n = new Date();
  const sameDay = d.toDateString() === n.toDateString();
  if (sameDay) return "Today";
  const y = new Date(n - 864e5);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.getDate() + " " + MONTHS[d.getMonth()];
}
function dayLabel(ts) {
  const d = new Date(ts);
  return DAYS[d.getDay()] + " " + String(d.getDate()).padStart(2, "0") + " " + MONTHS[d.getMonth()];
}
function hhmm(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function mins(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return (h ? h + " h" : "") + (h && r ? " " : "") + (r ? r + " min" : "");
}
function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
}
function money(n) { return (DB.cur || "₦") + Number(n || 0).toLocaleString("en"); }

/* ══ the mark ════════════════════════════════════════
   An italic didone O, drawn as one ellipse with a second rotated out of it.
   The counter is turned back against the outer ellipse's lean, which is what
   puts the thin joins at the top and bottom and the weight on the flanks —
   the contrast a serif O has, without carrying a font file for one glyph. */
let markN = 0;
function logoMark(size, ring) {
  const id = "om" + (++markN), s = Math.round(size * 0.56);
  return `<span style="width:${size}px;height:${size}px;flex:none;border-radius:29%;
      background:var(--grad);display:flex;align-items:center;justify-content:center;
      ${ring ? "border:2px solid rgba(255,255,255,.55);" : ""}
      box-shadow:0 ${Math.round(size / 7)}px ${Math.round(size / 3)}px -${Math.round(size / 8)}px rgba(240,81,141,.55)">
    <svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-hidden="true">
      <mask id="${id}">
        <rect width="100" height="100" fill="#000"/>
        <ellipse cx="50" cy="50" rx="24" ry="44" fill="#fff" transform="rotate(-15 50 50)"/>
        <ellipse cx="50" cy="50" rx="13" ry="37.5" fill="#000" transform="rotate(0 50 50)"/>
      </mask>
      <rect width="100" height="100" fill="#0b0910" mask="url(#${id})"/>
    </svg>
  </span>`;
}

/* Nail outlines, one per shape, drawn rather than photographed so they stay
   sharp at any size and cost nothing to carry. */
const SHAPE_PATH = {
  oval:     "M6,58 L6,24 C6,11 12,4 20,4 C28,4 34,11 34,24 L34,58 Z",
  round:    "M6,58 L6,30 C6,18 12,10 20,10 C28,10 34,18 34,30 L34,58 Z",
  square:   "M6,58 L6,10 C6,8 8,7 10,7 L30,7 C32,7 34,8 34,10 L34,58 Z",
  squoval:  "M6,58 L6,14 C6,9 9,7 13,7 L27,7 C31,7 34,9 34,14 L34,58 Z",
  almond:   "M6,58 L6,26 C6,10 20,2 20,2 C20,2 34,10 34,26 L34,58 Z",
  ballerina:"M6,58 L8,20 L16,4 L24,4 L32,20 L34,58 Z",
  coffin:   "M6,58 L8,20 L16,4 L24,4 L32,20 L34,58 Z",
  stiletto: "M6,58 L9,22 L20,1 L31,22 L34,58 Z",
};
function shapeSVG(shape, w, h, stroke, fill) {
  const d = SHAPE_PATH[shape] || SHAPE_PATH.squoval;
  return `<svg viewBox="0 0 40 60" width="${w}" height="${h}" aria-hidden="true"><path d="${d}"
    fill="${fill || "var(--tint2)"}" stroke="${stroke || "var(--pink)"}" stroke-width="2.5"/></svg>`;
}

/* ══ the scan's own five steps ═══════════════════════ */
const scanEl = document.getElementById("scan");
const steps = [...document.querySelectorAll("section.step")];
const SCAN_TITLES = ["Hand scan", "Reading your nails", "Check the outlines",
                     "Two questions", "Scan result"];
function go(n) {
  S.step = n;
  steps.forEach(s => s.classList.toggle("live", +s.dataset.step === n));
  document.getElementById("scanTitle").textContent = SCAN_TITLES[n];
  document.getElementById("scanHelp").classList.toggle("hidden", n !== 0);
  const b = scanEl.querySelector(".step.live .scanbody");
  if (b) b.scrollTop = 0;
}
function openScan() {
  resetScan();
  scanEl.classList.add("live");
  document.body.style.overflow = "hidden";
}
function closeScan() {
  scanEl.classList.remove("live");
  document.body.style.overflow = "";
}
function resetScan() {
  S.img = null; S.src = null; S.px = null; S.boxes = {}; S.active = 0;
  S.lines = { finger: null, palm: null }; S.lineIdx = 0; S.last = null;
  S.handPts = null; AUTORUN++;            // abandon any read still running
  S.sheet = null; S.mmPerPx = null; S.sheetPartial = 0;
  showErr(""); setBusy("");
  document.getElementById("camIn").value = "";
  document.getElementById("fileIn").value = "";
  go(0);
}
document.getElementById("scanClose").addEventListener("click", () => {
  if (S.img && !S.last && !confirm("Leave this scan? Nothing is saved yet.")) return;
  closeScan();
});
document.getElementById("scanHelp").addEventListener("click", () => {
  alert("Lay the hand flat on a plain surface, palm down, shot straight from above with "
    + "even light. Angled shots foreshorten the nails and make them measure shorter than "
    + "they are — that was the single most common failure on our own test photos.");
});

/* ══ photo ═══════════════════════════════════════════
   iPhones save HEIC by default and no desktop browser decodes it, so the
   first version of this told people "that file could not be opened as an
   image" — for five of the eight photographs in our own study set. A HEIC
   decoder is carried in the page and woken only when a HEIC actually turns
   up, so the common case pays nothing for it.                            */
const capErr = document.getElementById("capErr");
const capBusy = document.getElementById("capBusy");
function showErr(msg) {
  capErr.innerHTML = msg || "";
  capErr.hidden = !msg;
}
function setBusy(msg) {
  capBusy.textContent = msg || "";
  capBusy.hidden = !msg;
}

const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm",
                     "hevs", "mif1", "msf1", "avif", "avis"];
function isHeif(head) {
  const s = i => String.fromCharCode(head[i], head[i + 1], head[i + 2], head[i + 3]);
  return head.length >= 12 && s(4) === "ftyp" && HEIF_BRANDS.includes(s(8));
}
let heifLib = null;
async function getHeif() {
  if (heifLib) return heifLib;
  if (!window.libheif) {
    // Fetched or parsed on demand, never at startup. Eagerly loading the
    // decoder would cost every visitor a megabyte of download and a second of
    // parsing for a format most of them will never bring — and on a metered
    // connection it would cost them money as well.
    const inline = document.getElementById("heifsrc");
    if (inline && inline.textContent.length > 4096) {
      (0, eval)(inline.textContent);
    } else {
      const r = await fetch("heif.js");
      if (!r.ok) throw new Error("The HEIC decoder could not be downloaded.");
      (0, eval)(await r.text());
    }
  }
  heifLib = await window.libheif();
  return heifLib;
}
async function decodeHeif(file) {
  const lib = await getHeif();
  const dec = new lib.HeifDecoder();
  const imgs = dec.decode(new Uint8Array(await file.arrayBuffer()));
  if (!imgs || !imgs.length) throw new Error("No image inside that HEIC file.");
  const im = imgs[0];
  const w = im.get_width(), h = im.get_height();
  const out = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  await new Promise((res, rej) =>
    im.display(out, r => r ? res(r) : rej(new Error("HEIC decoding failed."))));
  const full = document.createElement("canvas");
  full.width = w; full.height = h;
  full.getContext("2d").putImageData(new ImageData(out.data, w, h), 0, 0);
  return full;
}
function decodeStandard(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("Your browser could not open that file as an image."));
    };
    im.src = url;
  });
}
function useCanvas(c) {
  S.src = c; S.iw = c.width; S.ih = c.height;
  S.px = null;
  S.img = c.toDataURL("image/jpeg", 0.92);
  document.getElementById("photo").src = S.img;
  document.getElementById("photo3").src = S.img;
  seedBoxes();
  S.active = 0;
  drawMark();
  go(1);
  runAuto();
}
async function install(source, w, h) {
  // Cap the working size: a 12MP phone photo is far more pixels than the
  // measurement needs, and the loupe redraws on every pointer move.
  const cap = 1600, sc = Math.min(1, cap / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * sc);
  c.height = Math.round(h * sc);
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);

  S.sheet = null; S.mmPerPx = null; S.sheetPartial = 0;
  try {
    setBusy("Looking for the guide sheet…");
    await new Promise(r => setTimeout(r, 25));      // let the message paint
    const px = c.getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, c.width, c.height);
    const det = detectSheet(px.data, c.width, c.height);
    if (det.ok) {
      setBusy("Flattening the page…");
      await new Promise(r => setTimeout(r, 25));
      const r = rectify(c, det, 1500);
      if (r) {
        S.sheet = { err: det.err, markers: det.markers };
        S.mmPerPx = 1 / r.pxPerMm;
        setBusy("");
        useCanvas(r.canvas);
        return;
      }
    } else {
      S.sheetPartial = det.markers || 0;
    }
  } catch (e) {
    // The sheet is an improvement, not a requirement. A photo without one
    // measures exactly as it did before.
    S.sheetPartial = 0;
  }
  setBusy("");
  useCanvas(c);
}
async function loadFile(file) {
  if (!file) return;
  showErr("");
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (isHeif(head)) {
      setBusy("Converting your iPhone photo…");
      await new Promise(r => setTimeout(r, 30));   // let the message paint
      const cv = await decodeHeif(file);
      setBusy("");
      await install(cv, cv.width, cv.height);
    } else {
      setBusy("Opening your photo…");
      const im = await decodeStandard(file);
      setBusy("");
      await install(im, im.naturalWidth, im.naturalHeight);
    }
  } catch (e) {
    setBusy("");
    showErr("<div><b>That photo would not open.</b> " + esc(e.message || "") +
      " Try a JPEG, or on iPhone: Settings › Camera › Formats › Most Compatible.</div>");
  }
}
document.getElementById("camIn").addEventListener("change", e => loadFile(e.target.files[0]));
document.getElementById("fileIn").addEventListener("change", e => loadFile(e.target.files[0]));

function seedBoxes() {
  S.boxes = {};
  // Left empty on purpose. The hand model fills these in from the skeleton;
  // if it never runs, there is no finger-to-palm reading and the engine simply
  // does without one, which is what the old Skip button did.
  S.lines.finger = null;
  S.lines.palm = null;
}

__DETECTOR__

__AUTO__

/* ══ marking ═════════════════════════════════════════ */
const stage = document.getElementById("stage");
const ov = document.getElementById("ov");
const loupe = document.getElementById("loupe");
const loupeC = document.getElementById("loupeC").getContext("2d");
const tabs = document.getElementById("fingerTabs");

__MARK__

/* The per-nail panel under the photo. It reports what was actually read, so
   a nail the detector gave up on shows as unread rather than quietly
   contributing a placeholder to the mean. */
function drawProgress() {
  const chip = document.getElementById("sheetChip");
  if (chip) {
    if (S.sheet) {
      chip.className = "note pink";
      chip.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--pink)" stroke-width="2.4" stroke-linecap="round"><path d="M5 13l4 4 10-10"/></svg>
        <div><b>Guide sheet found.</b> The photo has been flattened to a straight-down view,
        so tilt is corrected rather than refused — and this scan is measured in millimetres.</div>`;
    } else if (S.sheetPartial) {
      chip.className = "note warn";
      chip.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.1"/></svg>
        <div>Found ${S.sheetPartial} of the 4 corner squares. All four have to be in shot to
        flatten the photo, so this scan is measured the ordinary way.</div>`;
    } else {
      chip.className = "hidden";
      chip.innerHTML = "";
    }
  }
  const read = FINGERS.filter(f => S.boxes[f] && (!S.boxes[f].failed || S.boxes[f].edited));
  document.getElementById("readCount").textContent = read.length + " of 4";
  document.getElementById("readBar").style.width = (read.length / 4 * 100) + "%";
  document.getElementById("readList").innerHTML = FINGERS.map(f => {
    const b = S.boxes[f];
    const ok = b && (!b.failed || b.edited);
    const cls = ok ? "tick done" : (b ? "tick miss" : "tick");
    const ic = ok
      ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 13l4 4 10-10"/></svg>'
      : (b ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 8v5M12 16v.1"/></svg>' : "");
    const val = ok ? `<span style="margin-left:auto;font-weight:800;color:#ff9dc2">${b.ratio.toFixed(2)}</span>`
      : (b ? '<span style="margin-left:auto;font-weight:700;color:#e0a944">unread</span>' : "");
    return `<div class="${cls}"><i>${ic}</i>${f}${val}</div>`;
  }).join("");
}

/* ══ the two questions ═══════════════════════════════ */
function choices(host, opts, cb) {
  const el = document.getElementById(host);
  el.innerHTML = opts.map((o, i) => `
    <button type="button" class="choice${i === 0 ? " on" : ""}" data-v="${o.v}">
      <span class="rd"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 13l4 4 10-10"/></svg></span>
      <span><b>${o.t}</b><em>${o.h}</em></span>
    </button>`).join("");
  el.querySelectorAll(".choice").forEach(b => b.addEventListener("click", () => {
    el.querySelectorAll(".choice").forEach(x => x.classList.toggle("on", x === b));
    cb(b.dataset.v);
  }));
}
choices("qNatural", [
  { v: "yes", t: "Natural", h: "Your own nails, no acrylic or gel extensions." },
  { v: "no", t: "Extensions", h: "Acrylic, gel or tips on now, or you would happily have them." }
], v => { S.natural = v === "yes"; });
choices("qLength", [
  { v: "yes", t: "Short", h: "At or near the fingertip." },
  { v: "no", t: "Some length", h: "Growing past the fingertip." }
], v => { S.short = v === "yes"; });

__ENGINE__
