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
  // A customer's pinned coordinates, from before distance was asked live.
  // Dropped rather than migrated: a stale pin is exactly the thing that made
  // "2 km away" wrong for anybody who had moved since tapping GPS.
  if (d.me && d.me.ll) delete d.me.ll;
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
/* A TECH has a pin, because a salon is a place. A customer does not: she
   moves, so her distance is asked of the phone each time it is needed rather
   than remembered from whenever she last tapped GPS. DB.me.ll is no longer
   read anywhere, and dbLoad drops it. */
function myPos() { return (DB.biz && DB.biz.ll) || null; }
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
  seal: (w) => `<svg viewBox="0 0 24 24" width="${w || 12}" height="${w || 12}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10"/></svg>`,
  trophy: () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 2.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5"/><path d="M12 14v3M9 20h6M10 17h4l.5 3h-5Z"/></svg>`,
  more: (on) => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="${on ? 2.6 : 2}" stroke-linecap="round"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  cog: () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.9a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2Z"/></svg>`,
  moon: () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z"/></svg>`,
  bell: () => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 7-3 9h18c0-2-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0"/></svg>`,
  find: () => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
  x: () => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  tick: (w) => `<svg viewBox="0 0 24 24" width="${w || 15}" height="${w || 15}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M5 13l4 4 10-10"/></svg>`,
  plus: () => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>`,
  wa: () => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.04 2A9.9 9.9 0 0 0 2.1 11.9c0 1.75.46 3.46 1.34 4.96L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01a9.9 9.9 0 0 0 9.93-9.9A9.9 9.9 0 0 0 12.04 2Zm5.8 14.1c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.8-4.17-4.94-4.36-.15-.2-1.19-1.58-1.19-3.01 0-1.43.75-2.14 1.02-2.43.27-.29.58-.36.78-.36l.56.01c.18.01.42-.07.66.5.24.58.83 2 .9 2.15.07.14.12.31.02.5-.1.2-.15.32-.29.49l-.44.51c-.15.14-.3.3-.13.59.17.29.76 1.25 1.63 2.03 1.12 1 2.06 1.3 2.35 1.45.29.15.46.12.63-.07.17-.2.72-.84.91-1.13.19-.29.39-.24.65-.14.26.09 1.68.79 1.97.94.29.14.48.22.55.34.07.12.07.68-.17 1.36Z"/></svg>`,
};

/* The workplace picker. Four states, and each one asks for exactly one
   thing: nothing, a name, permission, or nobody.

   The ownership question matters more than it looks. An owner APPROVES
   people; she cannot create their accounts. Every tech passes her own NIN
   check and is paid into her own account — if an owner could register her
   staff she could verify all of them with her own identity and collect
   their money, which is the exact trust that verification buys.          */
function workplaceRow(b) {
  // 1 · she asked somewhere that has an owner, and is waiting
  if (b.salon_waiting) {
    return `<div class="note">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <div><b>Waiting for ${esc(b.salon_waiting)}</b> to say yes. Until they do
        you are listed on your own, which is not a problem — customers can
        still find and book you.
        <button class="tag" data-a="leaveShop" style="margin-top:8px">Cancel</button></div>
    </div>`;
  }

  // 2 · she owns the place
  if (b.salon_name && b.salon_own) {
    return `<div class="menu">
      <div class="r"><span class="ic">${I.shop()}</span>
        <span style="flex:1">You own <b>${esc(b.salon_name)}</b>
          <span class="tiny sub" style="display:block;font-weight:600;margin-top:1px">
            Techs ask to join, and you decide.</span></span></div>
      <button data-a="go" data-v="myshop"><span class="ic">${I.user()}</span>
        <span style="flex:1">Who works here${
          b.salon_pending ? ` <b style="color:var(--pinkd)">· ${b.salon_pending} waiting</b>` : ""}</span>
        ${I.chev()}</button>
    </div>`;
  }

  // 3 · she works somewhere she does not own
  if (b.salon_name) {
    return `<div class="menu">
      <div class="r"><span class="ic">${I.shop()}</span>
        <span style="flex:1">You work at <b>${esc(b.salon_name)}</b>
          <span class="tiny sub" style="display:block;font-weight:600;margin-top:1px">
            Customers see the shop, then choose you inside it.</span></span>
        <button class="tag" data-a="leaveShop">Leave</button></div>
    </div>`;
  }

  // 4 · nowhere yet
  const near = (b.salonsNear || []);
  return `
    ${near.length ? `<div class="menu" style="margin-bottom:10px">
      ${near.map((s) => `<button data-a="joinShop" data-id="${esc(s.id)}">
        <span class="ic">${I.shop()}</span>
        <span style="flex:1">${esc(s.name)}
          <span class="tiny sub" style="display:block;font-weight:600;margin-top:1px">${
            esc(s.area || "")}${s.area ? " · " : ""}${s.techs} already here</span></span>
        <span class="tag">${s.owned ? "Ask" : "Join"}</span></button>`).join("")}
    </div>` : ""}
    <div class="btnrow">
      <input id="bShop" placeholder="${near.length ? "or name your shop" : "Name of the shop, if you share one"}"
             style="flex:1">
      <button class="btn sm ghost" data-a="nameShop">Save</button>
    </div>
    <label class="own" style="margin-top:10px">
      <input type="checkbox" id="bShopOwn">
      <span>I <b>own</b> this shop. Other techs here will ask me before they
        appear under it.</span>
    </label>
    <div class="tiny faint" style="margin-top:8px">
      Leave this empty if you work alone or you travel to clients.
    </div>`;
}

/* ══ who works here ══════════════════════════════════════════════════
   The owner's list: people waiting, then people inside. Removing
   somebody takes her off this address and nothing else — her listing,
   her reviews, her O points and her money were always hers.          */
let SHOP = null, SHOP_BUSY = false;

async function loadMyShop() {
  try {
    const [mine, reqs, list] = await Promise.all([
      API.mySalon(), API.salonRequests(),
      API.mySalon().then((m) => m.salon_id ? API.salonTechs(m.salon_id) : []),
    ]);
    SHOP = { ...mine, reqs: reqs || [], list: list || [] };
  } catch (e) { SHOP = { error: e.message, reqs: [], list: [] }; }
  if (ROUTE.v === "myshop") paint();
}

function vMyShop() {
  if (!SHOP) { loadMyShop(); }
  const s = SHOP || {};
  return `
  ${head(s.name || "Your shop", s.i_own ? "You own this" : null)}
  <div class="pad">
    ${s.error ? `<div class="note warn"><div>${esc(s.error)}</div></div>` : ""}

    ${s.reqs && s.reqs.length ? `
      <div class="seehead" style="padding-left:0;padding-right:0"><h3>Asking to join</h3></div>
      <div class="stack gap10">
        ${s.reqs.map((r) => `<div class="card">
          <div style="display:flex;align-items:center;gap:12px">
            <span class="avatar sq">${esc(initials(r.business_name))}</span>
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:15px;font-weight:800">${esc(r.business_name)}</span>
              <span class="tiny sub">${r.years ? r.years + " yrs" : "New to Oma"}</span>
            </span>
          </div>
          <div class="btnrow mt12">
            <button class="btn sm" data-a="joinYes" data-id="${esc(r.tech_id)}">Let her in</button>
            <button class="btn sm ghost" data-a="joinNo" data-id="${esc(r.tech_id)}">No</button>
          </div>
        </div>`).join("")}
      </div>` : ""}

    <div class="seehead" style="padding-left:0;padding-right:0"><h3>Working here</h3></div>
    ${s.list && s.list.length ? `<div class="stack gap10">
      ${s.list.map((x) => `<div class="prow">
        <span class="pname">${esc(x.business_name)}</span>
        ${x.from_kobo ? `<span class="tiny sub">from ${kobo(x.from_kobo)}</span>` : ""}
        <button class="tag" data-a="shopRemove" data-id="${esc(x.id)}">Remove</button>
      </div>`).join("")}
    </div>` : `<div class="empty"><b>Only you, so far</b>
        A tech who works here names your shop in her own listing and asks to
        join. She signs herself up — you cannot create her account, because
        her identity check and her payouts have to be hers.</div>`}

    <div class="small sub" style="margin-top:16px;line-height:1.55">
      Removing somebody takes her off this address. Her listing, her reviews,
      her O points and anything she has earned stay hers — they always were.
    </div>
  </div>
  <div style="height:24px"></div>`;
}

/* ══ routing ═════════════════════════════════════════ */
const TABS = {
  customer: [
    { k: "home", t: "Home", i: I.home },
    { k: "salons", t: "Search", i: I.find },
    { k: "__scan", t: "Scan" },
    { k: "bookings", t: "Bookings", i: I.cal },
    { k: "more", t: "More", i: I.more },
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
/* Prices are typed by hand, so "5000", "5,000" and "₦5,000" all arrive in
   the same field. A bare `+s.p` turns the last two into NaN, and the
   `NaN || Infinity` that followed is what put **From ₦∞** on a listing
   whose price was perfectly good. Every place that reads a price goes
   through here now, so there is one parser and not four.
   Kamsy, 9 Sep 2026, with a screenshot of ₦∞. */
function priceNum(v) {
  const n = Number(String(v == null ? "" : v).replace(/[^\d.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}
/* The lowest real price in a menu, or null when nothing has one — never
   Infinity, because Infinity is a number and gets printed like one. */
function fromPrice(list) {
  const p = (list || []).map(s => priceNum(s.p)).filter(n => n !== null);
  return p.length ? Math.min(...p) : null;
}
function techRow(t, big) {
  const d = distText(t);
  const from = fromPrice(t.s);
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
  // The mark is a pink tile, so the ground cannot also be pink or it vanishes
  // into its own background. It used to be a hard-coded dark ground with white
  // ink, which meant somebody whose phone is in light mode met a black screen
  // as the very first thing Oma showed them. Every colour here is a token now
  // — see --wel-* in p1_head.html — so this screen follows the phone like the
  // rest of the app.
  return `<div style="min-height:100dvh;background:var(--wel-bg);
      color:var(--wel-ink);display:flex;flex-direction:column;padding:0 26px calc(34px + env(safe-area-inset-bottom));position:relative;overflow:hidden">
    <div style="position:absolute;top:-140px;right:-120px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,var(--wel-glow1),transparent 68%)"></div>
    <div style="position:absolute;bottom:60px;left:-150px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,var(--wel-glow2),transparent 70%)"></div>
    <div style="position:relative;flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-top:calc(60px + env(safe-area-inset-top))">
      <div style="margin-bottom:auto">${logoMark(78)}</div>
      <div style="font-size:56px;font-weight:800;letter-spacing:-.05em;line-height:.9;margin-top:36px">oma</div>
      <div style="font-size:17.5px;font-weight:500;line-height:1.45;margin-top:14px;color:var(--wel-sub);max-width:300px">
        Scan your hands, find the nail shape that actually suits them, and book the tech who does it.
      </div>
      <div class="dots" style="margin:26px 0 22px;max-width:60px">
        <i style="background:var(--wel-dot);flex:none;width:22px"></i>
        <i style="background:var(--wel-dot-off);flex:none;width:5px"></i>
        <i style="background:var(--wel-dot-off);flex:none;width:5px"></i>
      </div>
      <button class="btn" style="background:linear-gradient(150deg,#ff8fba,#f0518d 55%,#e0447f);color:#fff"
        data-a="go" data-v="role">Get started ${I.arrow()}</button>
      <div style="text-align:center;font-size:13px;font-weight:500;margin-top:16px;color:var(--wel-sub);line-height:1.5">
        Your photos are measured on this phone and never leave it.
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
        <input id="fArea" value="${esc(m.area || "")}" placeholder="Lekki, Lagos"></span></label>
    <div class="note pink">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-3.5 7-9V6l-7-3-7 3v6c0 5.5 7 9 7 9Z"/></svg>
      <div>This is just a label for your bookings. <b>Distance comes from your
        phone, fresh, each time you search</b> — so it is right wherever you
        happen to be, not wherever you were when you filled this in. Nothing
        reaches a tech until you send them a booking yourself.</div>
    </div>
    <div style="margin-top:auto;padding-top:24px">
      <button class="btn" data-a="saveMe">Save and continue ${I.arrow()}</button>
    </div>
  </div>`;
}

/* ══ 04 the tech's listing ═══════════════════════════ */
const SERVICE_SHAPES = ["oval", "round", "square", "squoval", "almond", "coffin", "stiletto"];

/* The state is what the whole-state map is drawn from — "show me everyone in
   Lagos", not only everyone within 15 km. All 36 and the FCT, because Oma is
   not only a Lagos app and a list that stops at six states tells a tech in
   Enugu she is not wanted. */
const NG_STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
  "FCT — Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"];
function vSetup(edit) {
  const b = DB.biz || { services: [] };
  // Default true: a listing made before this question existed described a
  // shop, and quietly turning those techs into travelling ones would take
  // every one of them off the map until she found this screen again.
  const shop = b.hasSalon !== false;
  return `<div class="pad" style="min-height:100dvh;display:flex;flex-direction:column;
      padding-top:calc(14px + env(safe-area-inset-top));padding-bottom:calc(30px + env(safe-area-inset-bottom))">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="iconbtn" data-a="${edit ? "back" : "go"}" data-v="role">${I.back()}</button>
      <div style="font-size:15px;font-weight:700">${edit ? "Edit your listing" : "Set up your listing"}</div>
    </div>
    ${edit ? "" : `<h2 style="font-size:24px;line-height:1.2;margin-bottom:18px">Tell customers where to find you</h2>`}

    <!-- Asked FIRST, because the answer changes the rest of the form. A salon
         is a place with an address; a tech who travels is not a place at all,
         and giving her an address box to fill in is what produces a pin that
         is wrong by Tuesday. -->
    <div class="lbl" style="margin-bottom:7px">Do you have a salon?</div>
    <div class="pick">
      <button type="button" class="${shop ? "on" : ""}" data-a="has-salon" data-v="1">
        <b>Yes, a shop</b><em>Customers come to one address. Oma shows it, and
          it stays put.</em></button>
      <button type="button" class="${shop ? "" : "on"}" data-a="has-salon" data-v="0">
        <b>No, I travel</b><em>Oma shows where you are while you are working,
          and takes you off the map when you stop.</em></button>
    </div>
    ${shop ? "" : `<div class="note pink" style="margin-bottom:14px">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
      <div><b>You will not be found unless your phone is telling Oma where you
        are.</b> There is a switch for it below — turn it on when you start
        work and off when you finish. Oma keeps where you are now, and no
        record of where you have been.</div></div>`}

    <label class="field"><span class="lab">Business name</span>
      <span class="inp">${I.shop()}<input id="bName" value="${esc(b.name || "")}" placeholder="Thandi Nails Studio"></span></label>
    ${shop ? `<label class="field"><span class="lab">Street &amp; shop number</span>
      <span class="inp"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--faint)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
        <input id="bAddr" value="${esc(b.address || "")}" placeholder="12 Admiralty Way, Shop 4"></span></label>

    <!-- Several techs renting chairs in one shop is the normal case, not the
         exception, and without this they appear as identical cards on one
         pin. Picking an existing shop beats typing its name again: two
         spellings of one salon is the failure this is here to avoid. -->
    <div class="field"><span class="lab">Do you share this shop?</span>
      <div id="workplaceBox">${workplaceRow(b)}</div></div>` : ""}
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1;min-width:0"><span class="lab">Area</span>
        <span class="inp"><input id="bArea" value="${esc(b.area || "")}" placeholder="Lekki Phase 1">
          <!-- Only a shop gets a pin. A tech who travels has no fixed point to
               pin, and a button offering her one would be a promise Oma
               cannot keep. -->
          ${shop ? `<span class="act" data-a="gps" data-t="biz">${b.ll ? "Pinned" : "Pin me"}</span>` : ""}
        </span></label>
      <label class="field" style="flex:1;min-width:0"><span class="lab">State</span>
        <span class="inp"><select id="bState">
          <option value="">Choose…</option>
          ${NG_STATES.map(x => `<option ${(b.state || "") === x ? "selected" : ""}>${x}</option>`).join("")}
        </select></span></label>
    </div>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1;min-width:0"><span class="lab">Currency</span>
        <span class="inp"><select id="bCur">${["₦", "R", "$", "£", "€", "GH₵", "KSh"].map(c =>
          `<option ${(b.cur || DB.cur) === c ? "selected" : ""}>${c}</option>`).join("")}</select></span></label>
      <label class="field" style="flex:1;min-width:0"><span class="lab">Years doing nails</span>
        <span class="inp"><input id="bYears" value="${esc(b.years || "")}" inputmode="numeric" placeholder="6"></span></label>
    </div>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1;min-width:0"><span class="lab">Opens</span>
        <span class="inp"><input id="bOpen" type="time" value="${esc(b.opens || "09:00")}"></span></label>
      <label class="field" style="flex:1;min-width:0"><span class="lab">Closes</span>
        <span class="inp"><input id="bClose" type="time" value="${esc(b.closes || "18:00")}"></span></label>
    </div>

    ${shop ? "" : `<div class="lbl" style="margin:4px 0 7px">Working right now</div>
      ${workingCard()}<div style="height:14px"></div>`}

    <!-- She comes to you. Under the menu on purpose: it is about the menu —
         whether she travels, what the trip costs, and how far she will go. -->
    ${homeSettings(b)}

    <div class="rowbetween" style="margin:6px 0 10px">
      <div style="font-size:14.5px;font-weight:800;letter-spacing:-.02em">Your service menu</div>
      <button class="tag" data-a="addSvc">+ Add service</button>
    </div>
    ${(b.services || []).some(s => s.id) ? ownWorkBox() : ""}
    <div class="stack gap10" id="svcList">${svcEditor(b.services || [], b.cur || DB.cur)}</div>

    <div class="note mt16">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8.2v.1"/></svg>
      <!-- The TERMS, in a sentence. Not a running total beside every price box:
           setting a price is when a tech decides what she is worth, and a
           deduction counting itself out while she does that is the wrong
           screen for it. The arithmetic appears on her earnings screen once
           an appointment is actually paid. -->
      <div><b>Oma charges ₦250 for each completed service</b>, plus 2% of anything
        a service costs above ₦30,000. It comes off when you scan the client's
        code — if an appointment is refunded because you never scanned, you are
        charged nothing. The card fee is Paystack's, not ours.
        <b>You will see exactly what came off, on every appointment, in
        Earnings.</b></div>
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
      <span class="inp" style="flex:1;min-width:0;min-height:46px"><input data-s="n" data-i="${i}" value="${esc(s.n || "")}" placeholder="Gel overlay"></span>
      <button class="iconbtn" data-a="delSvc" data-i="${i}" aria-label="Remove">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>
    </div>
    <div style="display:flex;gap:10px;margin-top:9px;align-items:flex-end">
      <!-- min-width:0 is what stops these two boxes running off the edge. A
           flex child will not shrink below the intrinsic width of the input
           inside it unless it is told it may, and on a 320px phone the second
           box — and the "min" after it — was simply clipped away. -->
      <label class="field" style="flex:1;min-width:0;margin:0"><span class="lab">Price</span>
        <span class="inp" style="min-height:46px"><span class="pre">${esc(cur)}</span>
          <input data-s="p" data-i="${i}" value="${esc(s.p || "")}" inputmode="numeric" placeholder="3500"></span></label>
      <!-- This box was just a number and a "min" that fell off the edge of a
           narrow screen. Nobody should have to guess whether it means minutes
           or a minimum price. -->
      <label class="field" style="flex:1;min-width:0;margin:0"><span class="lab">How long</span>
        <span class="inp" style="min-height:46px">
          <input data-s="m" data-i="${i}" value="${esc(s.m || "")}" inputmode="numeric" placeholder="75">
          <span class="tiny faint">min</span></span></label>
    </div>
    <!-- Only when she travels: a price for this service at somebody's house.
         Blank means the same as above, which is both the default and the
         plainest way to say it. -->
    ${(DB.biz && DB.biz.homeService) ? svcHomeRow(s, i, cur) : ""}
    <!-- "That's if she has" — a service with no photographs shows an
         invitation, never an apology or a row of grey boxes. -->
    ${svcPhotoRow(s, i)}

    <div class="pills mt12">${SERVICE_SHAPES.map(sh =>
      `<button class="pill ${(s.sh || []).includes(sh) ? "on" : ""}" data-a="svcShape" data-i="${i}" data-sh="${sh}"
        style="text-transform:capitalize">${sh}</button>`).join("")}</div>
    <div class="tiny faint" style="margin-top:8px">Which shapes this service suits — customers see it against their scan.</div>
  </div>`).join("");
}
