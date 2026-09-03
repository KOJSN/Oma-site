/* ══ storage ═════════════════════════════════════════
   One key, one object, migrated forward rather than reset. Everything lives
   on this device: there is no account and no server to hold it.          */
const DB_KEY = "oma-db-v1";
const BLANK = {
  v: 3, cur: "₦", dial: "234", role: null,
  me: null,          // the customer using this phone
  biz: null,         // this device's own nail-tech listing
  scans: [], techs: [], bookings: [], jobs: []
};
function dbLoad() {
  let raw = null;
  try { raw = localStorage.getItem(DB_KEY); } catch (e) { return { ...BLANK }; }
  if (!raw) return { ...BLANK };
  let d;
  try { d = JSON.parse(raw); } catch (e) { return { ...BLANK }; }
  d = Object.assign({}, BLANK, d);
  if (d.v < 3) {
    // v2 kept the device's own tech listing in `me`. v3 splits the two, so a
    // nail tech can also be a customer without one overwriting the other.
    if (d.role === "tech" && d.me && d.me.name) d.biz = d.me;
    d.me = null;
    d.bookings = d.bookings || [];
    d.jobs = d.jobs || [];
    d.v = 3;
  }
  d.scans = d.scans || []; d.techs = d.techs || [];
  d.bookings = d.bookings || []; d.jobs = d.jobs || [];
  return d;
}
function dbSave() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  catch (e) { toast("Could not save — device storage is full or blocked."); }
}
let DB = dbLoad();

/* ══ base64 that survives accents and ₦ ══════════════ */
function b64e(str) {
  const b = new TextEncoder().encode(str);
  let s = ""; b.forEach(c => s += String.fromCharCode(c));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64d(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}

/* ══ distance ════════════════════════════════════════ */
function km(a, b) {
  if (!a || !b) return null;
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function bearing(a, b) {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) -
    Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return Math.atan2(y, x);
}
function myPos() { return (DB.me && DB.me.ll) || (DB.biz && DB.biz.ll) || null; }
function locate(cb) {
  if (!navigator.geolocation) { cb(null); return; }
  toast("Asking your browser for your location…");
  navigator.geolocation.getCurrentPosition(
    p => cb([+p.coords.latitude.toFixed(5), +p.coords.longitude.toFixed(5)]),
    () => { toast("Location refused — you can type your area instead."); cb(null); },
    { timeout: 8000, maximumAge: 6e5 });
}
function distText(t) {
  const d = km(myPos(), t.ll);
  return d == null ? null : (d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km");
}
function sortedTechs() {
  const me = myPos();
  return DB.techs.slice().sort((a, b) => {
    const da = km(me, a.ll), db2 = km(me, b.ll);
    if (da == null && db2 == null) return (b.added || 0) - (a.added || 0);
    if (da == null) return 1;
    if (db2 == null) return -1;
    return da - db2;
  });
}

/* ══ phone numbers are gone ══════════════════════════
   waOpen went on 29 Aug 2026: it opened wa.me with a pre-written message,
   which was how a tech heard about a booking before Oma had a server, and a
   conversation Oma cannot see is a booking that can arrive nowhere.

   waNumber followed it on 3 Sep, along with the phone number itself. Signing
   in is by email now — an SMS needs a Termii sender ID, which needs CAC, so
   for as long as that was pending NOBODY could sign in at all. The contact
   route phone numbers used to provide is the in-app conversation.

   app_user.phone stays in the database, unused. Dropping a column is
   destructive and buys nothing.                                          */

/* ══ tech links, the only way a listing travels ══════
   No server, no directory. A tech's whole listing is packed into the link
   they send, and it opens cold on a phone that has never seen Oma. The
   ceiling is honest and stated in the UI: it needs a connection you already
   have.                                                                   */
function techPayload(b) {
  return {
    n: b.name, a: b.area, ad: b.address,
    y: b.years, c: b.cur || DB.cur, ll: b.ll,
    o: b.opens, cl: b.closes,
    s: (b.services || []).map(s => ({ n: s.n, m: s.m, p: s.p, sh: s.sh || [] }))
  };
}
/* A tech's link, the marketplace version. The old one (#t=) packed her whole
   listing into the URL because there was no server to look it up in. There is
   now, so the link carries only her id and the app fetches the rest — which
   also means the link stays right when she changes her prices. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function techLink(id) {
  return location.origin + location.pathname + "#tech=" + id;
}
function techIdFromHash() {
  const m = (location.hash || "").match(/[#&]tech=([^&]+)/);
  return m && UUID.test(m[1]) ? m[1] : null;
}

function shareLink(b) {
  return location.origin + location.pathname + "#t=" + b64e(JSON.stringify(techPayload(b)));
}
function techFromHash() {
  const h = location.hash || "";
  const m = h.match(/[#&]t=([^&]+)/);
  if (!m) return null;
  try {
    const p = JSON.parse(b64d(m[1]));
    if (!p || !p.n) return null;
    return {
      id: "t_" + b64e(p.n + "|" + (p.p || "")).slice(0, 12),
      n: p.n, a: p.a || "", ad: p.ad || "", p: p.p || "", d: p.d || "234",
      y: p.y || null, c: p.c || "₦", ll: p.ll || null,
      o: p.o || null, cl: p.cl || null, s: p.s || [], added: Date.now()
    };
  } catch (e) { return null; }
}

/* ══ booking requests travel the same way ════════════
   The customer's WhatsApp message carries a short code. The tech pastes the
   message into their dashboard and it becomes a real request card, scan and
   all — without either phone talking to a server.                          */
function reqCode(bk) {
  return b64e(JSON.stringify({
    n: bk.who, p: bk.whoPhone, at: bk.at, t: bk.total, m: bk.mins,
    s: bk.svc.map(s => [s.n, s.m, s.p]),
    sh: bk.shape || null, bd: bk.bed || null, nt: bk.note || ""
  }));
}
function readReqCode(text) {
  const m = String(text || "").match(/oma:([A-Za-z0-9\-_]{12,})/);
  if (!m) return null;
  try {
    const p = JSON.parse(b64d(m[1]));
    if (!p || !p.n) return null;
    return {
      id: uid(), who: p.n, whoPhone: p.p || "", at: p.at, total: p.t, mins: p.m,
      svc: (p.s || []).map(a => ({ n: a[0], m: a[1], p: a[2] })),
      shape: p.sh, bed: p.bd, note: p.nt || "", status: "new", got: Date.now()
    };
  } catch (e) { return null; }
}

/* ══ icons ═══════════════════════════════════════════ */
const I = {
  home: f => `<svg viewBox="0 0 24 24" width="21" height="21" fill="${f ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.8Z"/></svg>`,
  pin: f => `<svg viewBox="0 0 24 24" width="21" height="21" fill="${f ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4" fill="${f ? "var(--card)" : "none"}"/></svg>`,
  cal: () => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="16" rx="4"/><path d="M8 3v4M16 3v4M4 11h16"/></svg>`,
  user: f => `<svg viewBox="0 0 24 24" width="21" height="21" fill="${f ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>`,
  inbox: () => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M4 13 6.5 5h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z"/></svg>`,
  chart: () => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>`,
  shop: () => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21h18M5 21V9h14v12M9 21v-6h6v6"/></svg>`,
  scan: () => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2M7 12h10"/></svg>`,
  back: () => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>`,
  clip: () => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1.4"/><path d="M8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16"/><path d="M9 12h6M9 16h4"/></svg>`,
  chat: () => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a7.5 7.5 0 0 1-7.7 7.5c-1 0-2-.2-2.9-.5L4 20.5l1.6-4.4A7.5 7.5 0 1 1 20 12Z"/></svg>`,
  send: () => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12 20 4.5 15.5 20 12 13.5 4.5 12Z"/></svg>`,
  chev: () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--faint)" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>`,
  arrow: () => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`,
  share: () => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8 15.8 6.7M8.2 13.2l7.6 4.1"/></svg>`,
  cog: () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.9a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2Z"/></svg>`,
  moon: () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z"/></svg>`,
  bell: () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 7-3 9h18c0-2-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0"/></svg>`,
  find: () => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
  x: () => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  tick: (w) => `<svg viewBox="0 0 24 24" width="${w || 15}" height="${w || 15}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M5 13l4 4 10-10"/></svg>`,
  plus: () => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>`,
  wa: () => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.04 2A9.9 9.9 0 0 0 2.1 11.9c0 1.75.46 3.46 1.34 4.96L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01a9.9 9.9 0 0 0 9.93-9.9A9.9 9.9 0 0 0 12.04 2Zm5.8 14.1c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.8-4.17-4.94-4.36-.15-.2-1.19-1.58-1.19-3.01 0-1.43.75-2.14 1.02-2.43.27-.29.58-.36.78-.36l.56.01c.18.01.42-.07.66.5.24.58.83 2 .9 2.15.07.14.12.31.02.5-.1.2-.15.32-.29.49l-.44.51c-.15.14-.3.3-.13.59.17.29.76 1.25 1.63 2.03 1.12 1 2.06 1.3 2.35 1.45.29.15.46.12.63-.07.17-.2.72-.84.91-1.13.19-.29.39-.24.65-.14.26.09 1.68.79 1.97.94.29.14.48.22.55.34.07.12.07.68-.17 1.36Z"/></svg>`,
};

/* ══ routing ═════════════════════════════════════════ */
const TABS = {
  customer: [
    { k: "home", t: "Home", i: I.home },
    { k: "salons", t: "Search", i: I.find },
    { k: "__scan", t: "Scan" },
    { k: "bookings", t: "Bookings", i: I.cal },
    { k: "profile", t: "Profile", i: I.user },
  ],
  tech: [
    { k: "requests", t: "Requests", i: I.inbox },
    { k: "diary", t: "Diary", i: I.cal },
    { k: "__scan", t: "Scan" },
    { k: "earnings", t: "Earnings", i: I.chart },
    { k: "listing", t: "Listing", i: I.shop },
  ],
};
let ROUTE = { v: "home", a: null };
const STACK = [];
function nav(v, a) {
  const roots = (TABS[DB.role] || TABS.customer).map(t => t.k);
  if (roots.includes(v)) STACK.length = 0;
  else if (ROUTE.v !== v) STACK.push({ ...ROUTE });
  ROUTE = { v, a: a == null ? null : a };
  paint();
  document.getElementById("view").scrollTop = 0;
}
function back() {
  const p = STACK.pop();
  ROUTE = p || { v: DB.role === "tech" ? "requests" : "home", a: null };
  paint();
  document.getElementById("view").scrollTop = 0;
}

/* ══ shared pieces ═══════════════════════════════════ */
function head(title, sub, right) {
  return `<div class="topbar plain" style="padding-bottom:10px">
    <div style="display:flex;align-items:center;gap:12px">
      <button class="iconbtn" data-a="back" aria-label="Back">${I.back()}</button>
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:800;letter-spacing:-.025em">${esc(title)}</div>
        ${sub ? `<div class="tiny sub">${esc(sub)}</div>` : ""}
      </div>
      ${right || ""}
    </div>
  </div>`;
}
function techRow(t, big) {
  const d = distText(t);
  const from = (t.s || []).length
    ? Math.min(...t.s.map(s => +s.p || Infinity)) : null;
  const bits = [t.a, d, from && isFinite(from) ? "from " + (t.c || "₦") + Number(from).toLocaleString("en") : null]
    .filter(Boolean).join(" · ");
  return `<button class="card tap" data-a="tech" data-id="${esc(t.id)}"
      style="display:flex;align-items:center;gap:12px;padding:11px">
    <span class="thumb${big ? " b" : ""}">${esc(initials(t.n))}</span>
    <span style="flex:1;min-width:0">
      <span style="display:block;font-size:15px;font-weight:700;letter-spacing:-.015em">${esc(t.n)}</span>
      <span class="small sub" style="display:block;margin-top:2px">${esc(bits || "Tap to see services")}</span>
      ${(t.s || []).length ? `<span class="tiny faint" style="display:block;margin-top:4px">${t.s.length} service${t.s.length === 1 ? "" : "s"}${t.y ? " · " + esc(t.y) + " yrs" : ""}</span>` : ""}
    </span>
    ${I.chev()}
  </button>`;
}
function scanCard(sc) {
  return `<button class="card tap" data-a="scan" data-id="${esc(sc.id)}"
      style="display:flex;align-items:center;gap:14px">
    <span class="thumb pink" style="width:48px;height:48px;border-radius:16px">${shapeSVG(sc.shape, 20, 30)}</span>
    <span style="flex:1">
      <span class="tiny" style="display:block;font-weight:700;color:var(--sub)">Your latest scan · ${esc(when(sc.ts))}</span>
      <span style="display:block;font-size:16.5px;font-weight:800;letter-spacing:-.02em;margin-top:1px">${esc(sc.label)} · ${sc.fit}% fit</span>
    </span>
    <span class="tag">View</span>
  </button>`;
}
function bottomNav() {
  const nv = document.getElementById("nav");
  const tabs = TABS[DB.role] || TABS.customer;
  // A tab bar under an open keyboard is somewhere nobody wants to tap.
  const onboarding = ["welcome", "role", "signup", "setup", "chat"].includes(ROUTE.v);
  if (!DB.role || onboarding) { nv.classList.add("hidden"); return; }
  nv.classList.remove("hidden");
  nv.innerHTML = tabs.map(t => t.k === "__scan"
    ? `<div class="fab"><button data-a="startscan" aria-label="Start a hand scan"><i>${I.scan()}</i></button></div>`
    : `<button class="${ROUTE.v === t.k ? "on" : ""}" data-a="tab" data-v="${t.k}">
         ${t.i(ROUTE.v === t.k)}<span>${t.t}</span></button>`).join("");
}

/* ══ 01 welcome ══════════════════════════════════════ */
function vWelcome() {
  // The mark is a pink tile. On the pink ground this screen used to have, it
  // disappeared into its own background — so the ground goes dark and the
  // brand colour is spent on the mark and the button instead.
  return `<div style="min-height:100dvh;background:#120e17;
      color:#fff;display:flex;flex-direction:column;padding:0 26px calc(34px + env(safe-area-inset-bottom));position:relative;overflow:hidden">
    <div style="position:absolute;top:-140px;right:-120px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(240,81,141,.55),transparent 68%)"></div>
    <div style="position:absolute;bottom:60px;left:-150px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(255,143,186,.28),transparent 70%)"></div>
    <div style="position:relative;flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-top:calc(60px + env(safe-area-inset-top))">
      <div style="margin-bottom:auto">${logoMark(78)}</div>
      <div style="font-size:56px;font-weight:800;letter-spacing:-.05em;line-height:.9;margin-top:36px">oma</div>
      <div style="font-size:17.5px;font-weight:500;line-height:1.45;margin-top:14px;opacity:.72;max-width:300px">
        Scan your hands, find the nail shape that actually suits them, and book the tech who does it.
      </div>
      <div class="dots" style="margin:26px 0 22px;max-width:60px">
        <i style="background:#fff;flex:none;width:22px"></i>
        <i style="background:rgba(255,255,255,.45);flex:none;width:5px"></i>
        <i style="background:rgba(255,255,255,.45);flex:none;width:5px"></i>
      </div>
      <button class="btn" style="background:linear-gradient(150deg,#ff8fba,#f0518d 55%,#e0447f);color:#fff"
        data-a="go" data-v="role">Get started ${I.arrow()}</button>
      <div style="text-align:center;font-size:13px;font-weight:500;margin-top:16px;opacity:.7;line-height:1.5">
        No account, no sign-in. Everything stays on this phone.
      </div>
    </div>
  </div>`;
}

/* ══ 02 customer or nail tech ════════════════════════ */
let pickRole = "customer";
function vRole() {
  return `<div class="pad" style="min-height:100dvh;display:flex;flex-direction:column;
      padding-top:calc(20px + env(safe-area-inset-top));padding-bottom:calc(30px + env(safe-area-inset-bottom))">
    <div class="dots" style="margin-bottom:26px"><i class="on"></i><i></i><i></i></div>
    <h1>How will you<br>use oma?</h1>
    <div class="sub mt8" style="font-size:14.5px">Pick one — you can switch later in settings.</div>
    <div class="stack gap14 mt24">
      <button class="opt ${pickRole === "customer" ? "on" : ""}" data-a="role" data-v="customer">
        <span class="ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3c-1.6 2.2-2.4 4.3-2.4 6.4 0 2.4 1.1 3.9 2.4 3.9s2.4-1.5 2.4-3.9c0-2.1-.8-4.2-2.4-6.4Z"/><path d="M7 21c1-2.6 2.8-4 5-4s4 1.4 5 4"/></svg></span>
        <span style="flex:1"><span class="tt">I'm a customer</span>
          <span class="hh">Scan your hands, browse nail techs near you and book a slot.</span></span>
        <span class="rd">${I.tick(14)}</span>
      </button>
      <button class="opt ${pickRole === "tech" ? "on" : ""}" data-a="role" data-v="tech">
        <span class="ic">${I.shop()}</span>
        <span style="flex:1"><span class="tt">I'm a nail tech</span>
          <span class="hh">List your business, your services and your prices so customers can find you.</span></span>
        <span class="rd">${I.tick(14)}</span>
      </button>
    </div>
    <div style="margin-top:auto;padding-top:24px" class="stack gap14">
      <div class="note pink">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8.2v.1"/></svg>
        <div>Nail techs get a listing page, a service menu and booking requests.</div>
      </div>
      <button class="btn" data-a="roleNext">
        Continue as ${pickRole === "tech" ? "nail tech" : "customer"} ${I.arrow()}
      </button>
    </div>
  </div>`;
}

/* ══ 03 customer details ═════════════════════════════
   No password. There is nothing to authenticate against — this is a local
   profile, and pretending otherwise would be theatre.                     */
function vSignup() {
  const m = DB.me || {};
  return `<div class="pad" style="min-height:100dvh;display:flex;flex-direction:column;
      padding-top:calc(14px + env(safe-area-inset-top));padding-bottom:calc(30px + env(safe-area-inset-bottom))">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="iconbtn" data-a="go" data-v="role">${I.back()}</button>
      <div style="font-size:15px;font-weight:700">About you</div>
    </div>
    <div class="dots" style="margin-bottom:22px"><i class="on"></i><i class="on"></i><i></i></div>
    <label class="field"><span class="lab">Your name</span>
      <span class="inp"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--faint)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>
        <input id="fName" value="${esc(m.name || "")}" placeholder="What should techs call you?"></span></label>
    <label class="field"><span class="lab">Your area</span>
      <span class="inp"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
        <input id="fArea" value="${esc(m.area || "")}" placeholder="Lekki, Lagos">
        <span class="act" data-a="gps" data-t="me">${myPos() ? "Pinned" : "GPS"}</span></span></label>
    <div class="note pink">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-3.5 7-9V6l-7-3-7 3v6c0 5.5 7 9 7 9Z"/></svg>
      <div>Your area only sorts nail techs by distance. Nothing reaches a tech until you send
        them a booking yourself.</div>
    </div>
    <div style="margin-top:auto;padding-top:24px">
      <button class="btn" data-a="saveMe">Save and continue ${I.arrow()}</button>
    </div>
  </div>`;
}

/* ══ 04 the tech's listing ═══════════════════════════ */
const SERVICE_SHAPES = ["oval", "round", "square", "squoval", "almond", "coffin", "stiletto"];
function vSetup(edit) {
  const b = DB.biz || { services: [] };
  return `<div class="pad" style="min-height:100dvh;display:flex;flex-direction:column;
      padding-top:calc(14px + env(safe-area-inset-top));padding-bottom:calc(30px + env(safe-area-inset-bottom))">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="iconbtn" data-a="${edit ? "back" : "go"}" data-v="role">${I.back()}</button>
      <div style="font-size:15px;font-weight:700">${edit ? "Edit your listing" : "Set up your listing"}</div>
    </div>
    ${edit ? "" : `<h2 style="font-size:24px;line-height:1.2;margin-bottom:18px">Tell customers where to find you</h2>`}
    <label class="field"><span class="lab">Business name</span>
      <span class="inp">${I.shop()}<input id="bName" value="${esc(b.name || "")}" placeholder="Thandi Nails Studio"></span></label>
    <label class="field"><span class="lab">Street &amp; shop number</span>
      <span class="inp"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--faint)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
        <input id="bAddr" value="${esc(b.address || "")}" placeholder="12 Admiralty Way, Shop 4"></span></label>
    <label class="field"><span class="lab">Area</span>
      <span class="inp"><input id="bArea" value="${esc(b.area || "")}" placeholder="Lekki Phase 1">
        <span class="act" data-a="gps" data-t="biz">${b.ll ? "Pinned" : "Pin me"}</span></span></label>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1"><span class="lab">Currency</span>
        <span class="inp"><select id="bCur">${["₦", "R", "$", "£", "€", "GH₵", "KSh"].map(c =>
          `<option ${(b.cur || DB.cur) === c ? "selected" : ""}>${c}</option>`).join("")}</select></span></label>
      <label class="field" style="flex:1"><span class="lab">Years doing nails</span>
        <span class="inp"><input id="bYears" value="${esc(b.years || "")}" inputmode="numeric" placeholder="6"></span></label>
    </div>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1"><span class="lab">Opens</span>
        <span class="inp"><input id="bOpen" type="time" value="${esc(b.opens || "09:00")}"></span></label>
      <label class="field" style="flex:1"><span class="lab">Closes</span>
        <span class="inp"><input id="bClose" type="time" value="${esc(b.closes || "18:00")}"></span></label>
    </div>

    <div class="rowbetween" style="margin:6px 0 10px">
      <div style="font-size:14.5px;font-weight:800;letter-spacing:-.02em">Your service menu</div>
      <button class="tag" data-a="addSvc">+ Add service</button>
    </div>
    <div class="stack gap10" id="svcList">${svcEditor(b.services || [], b.cur || DB.cur)}</div>

    <div class="note mt16">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8.2v.1"/></svg>
      <div><b>Oma charges ₦250 for each completed service</b>, plus 2% of anything
        a service costs above ₦30,000. It comes off when you scan the client's
        code — if an appointment is refunded because you never scanned, you are
        charged nothing. The card fee shown above is Paystack's, not ours.</div>
    </div>
    <div style="margin-top:auto;padding-top:22px">
      <button class="btn" data-a="saveBiz">${edit ? "Save changes" : "Publish my listing"} ${I.arrow()}</button>
    </div>
  </div>`;
}
function svcEditor(list, cur) {
  if (!list.length) return `<div class="empty">
      <b>No services yet</b>Add what you offer and what it costs. Customers pick from this menu
      when they book.</div>`;
  return list.map((s, i) => `<div class="card">
    <div style="display:flex;gap:10px;align-items:center">
      <span class="inp" style="flex:1;min-height:46px"><input data-s="n" data-i="${i}" value="${esc(s.n || "")}" placeholder="Gel overlay"></span>
      <button class="iconbtn" data-a="delSvc" data-i="${i}" aria-label="Remove">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>
    </div>
    <div style="display:flex;gap:10px;margin-top:9px">
      <span class="inp" style="flex:1;min-height:46px"><span class="pre">${esc(cur)}</span>
        <input data-s="p" data-i="${i}" value="${esc(s.p || "")}" inputmode="numeric" placeholder="3500"></span>
      <span class="inp" style="flex:1;min-height:46px">
        <input data-s="m" data-i="${i}" value="${esc(s.m || "")}" inputmode="numeric" placeholder="75">
        <span class="tiny faint">min</span></span>
    </div>
    <div class="tiny" data-keep="${i}" style="margin-top:8px;min-height:15px"></div>
    <div class="pills mt12">${SERVICE_SHAPES.map(sh =>
      `<button class="pill ${(s.sh || []).includes(sh) ? "on" : ""}" data-a="svcShape" data-i="${i}" data-sh="${sh}"
        style="text-transform:capitalize">${sh}</button>`).join("")}</div>
    <div class="tiny faint" style="margin-top:8px">Which shapes this service suits — customers see it against their scan.</div>
  </div>`).join("");
}
