/* ══ 14 the live lists ═══════════════════════════════════════════════════
   The screens the bottom bar leads to, reading the database rather than the
   phone.

   Everything here replaces a same-named screen from the era before Oma had a
   server. Those older screens read DB.bookings and DB.jobs — a private copy on
   each device — which is why a customer could book and a tech would never hear
   about it: two phones, two separate truths, nothing in between. The booking
   was real to her and did not exist to anyone else.

   One list function serves both sides. api_my_bookings already returns the
   rows for whoever is asking, tagged with 'role', so a tech's Requests screen
   and a customer's Bookings screen are the same query read from two ends.   */

/* Rows arrive newest-first by starts_at; these split them the way each screen
   wants to read them. An appointment an hour old is still "now" to the person
   sitting in the chair, hence the hour of grace. */
const GRACE = 36e5;
const upcoming = (list) => list.filter((b) => new Date(b.starts_at).getTime() >= Date.now() - GRACE)
  .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
const earlier = (list) => list.filter((b) => new Date(b.starts_at).getTime() < Date.now() - GRACE)
  .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));

/* What the status means to the person reading it, which is not what it means
   to the database. A tech does not care that a row says 'awaiting_payment';
   she cares that she should not start yet. */
function statusWords(b, asTech) {
  switch (b.status) {
    case "awaiting_payment":
      return asTech ? ["waiting on payment", "warn"] : ["not paid yet", "warn"];
    case "paid":
      return asTech ? ["paid — go ahead", "good"] : ["paid and held", "good"];
    case "released":
      return asTech ? ["scanned, money released", "good"] : ["finished", "muted"];
    case "cancelled":  return ["cancelled", "muted"];
    case "expired":    return ["hold expired", "muted"];
    case "refunded":   return ["refunded", "muted"];
    case "disputed":   return ["being looked at", "warn"];
    default:           return [b.status.replace(/_/g, " "), "muted"];
  }
}

/* Filled by the list screens from API.threads(), read by bookingRow. Kept as a
   module value rather than threaded through every caller, because the row is
   rendered from four places. */
let UNREAD = {};

function bookingRow(b) {
  const asTech = b.role === "tech";
  const at = new Date(b.starts_at).getTime();
  const [words, tone] = statusWords(b, asTech);
  const who = asTech ? (b.customer_name || "A customer") : b.tech.business_name;
  return `
  <button class="card row" data-a="go" data-v="job" data-id="${esc(b.id)}"
          style="width:100%;text-align:left">
    <div class="avatar sq">${esc(initials(who))}</div>
    <div style="flex:1;min-width:0">
      <div class="ttl">${esc(who)}</div>
      <div class="tiny sub">${dayLabel(at)} · ${hhmm(at)} · ${
        b.items.map((i) => esc(i.name)).join(", ") || "—"}</div>
      <div class="tiny ${tone === "good" ? "ok" : tone === "warn" ? "warn" : "sub"}"
           style="margin-top:3px;font-weight:700">${esc(words)}</div>
    </div>
    <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
      <div style="font-weight:700">${kobo(b.total_kobo)}</div>
      ${UNREAD[b.id] ? `<span class="unread">${UNREAD[b.id] > 9 ? "9+" : UNREAD[b.id]}</span>`
                     : I.chev()}
    </div>
  </button>`;
}

function emptyCard(title, line) {
  return `<div class="empty"><div class="ic">${I.cal()}</div><b>${esc(title)}</b>${esc(line)}</div>`;
}

/* Every screen below needs to know who is asking. Signed out, the request goes
   to Supabase as the anonymous role, which is refused by design — and the
   person sees "permission denied for function api_my_bookings", which tells
   her nothing and reads like a broken app. It is not broken; it does not know
   her yet. Say that instead. */
function askToSignIn(what) {
  fillHost(`
    <div class="pad stack gap12">
      <div class="empty"><div class="ic">${I.user()}</div>
        <b>Sign in to see ${esc(what)}</b>
        This is kept on your account, not on this device.</div>
      <button class="btn" data-a="go" data-v="signin">Sign in</button>
    </div>`);
}

/* ── the customer's bookings ─────────────────────────── */
function vBookingsLive() {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("your bookings");
    const [all, threads] = await Promise.all([
      API.bookings(true), API.threads().catch(() => []),
    ]);
    UNREAD = {};
    threads.forEach((t) => { if (t.unread) UNREAD[t.booking_id] = t.unread; });
    const up = upcoming(all), old = earlier(all);
    fillHost(`
      <div class="pad stack gap12">
        <div id="rateNudge"></div>
        ${up.length ? `<div class="lbl">Coming up</div>${up.map(bookingRow).join("")}`
                    : emptyCard("Nothing booked yet",
                        "Find a tech under Salons and pick a time.")}
        ${old.length ? `<div class="lbl mt16">Earlier</div>${old.map(bookingRow).join("")}` : ""}
      </div>`);
    // Filled in afterwards and quietly: an appointment waiting to be rated is
    // worth offering, and never worth delaying the list she came to see.
    reviewNudge();
  });
  return head("Bookings", "Everything you have booked") + host();
}

/* ── the tech's requests ─────────────────────────────────
   This is the screen that was reading her own device. A booking made on
   another phone reaches her here, and nowhere else, until push lands.      */
function vRequestsLive() {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("your requests");
    const [rows, threads] = await Promise.all([
      API.bookings(true), API.threads().catch(() => []),
    ]);
    UNREAD = {};
    threads.forEach((t) => { if (t.unread) UNREAD[t.booking_id] = t.unread; });
    const all = rows.filter((b) => b.role === "tech");
    const up = upcoming(all);
    const waiting = up.filter((b) => b.status === "awaiting_payment");
    const ready = up.filter((b) => b.status === "paid");
    const week = all.filter((b) => ["paid", "released"].includes(b.status) &&
      Math.abs(new Date(b.starts_at) - Date.now()) < 7 * 864e5);
    const held = week.reduce((a, b) => a + b.total_kobo, 0);

    fillHost(`
      <div class="pad stack gap12">
        <div class="hero" style="padding:18px">
          <div class="eyebrow" style="color:rgba(255,255,255,.85)">Paid, this week</div>
          <div style="font-size:32px;font-weight:800;letter-spacing:-.035em;margin-top:4px">${kobo(held)}</div>
          <div style="display:flex;gap:18px;margin-top:12px">
            <div><div style="font-size:16px;font-weight:800">${ready.length}</div>
              <div class="tiny" style="font-weight:600;opacity:.85">Ready</div></div>
            <div><div style="font-size:16px;font-weight:800">${waiting.length}</div>
              <div class="tiny" style="font-weight:600;opacity:.85">Awaiting payment</div></div>
          </div>
        </div>

        ${ready.length ? `<div class="lbl">Paid — you can start these</div>
          ${ready.map(bookingRow).join("")}` : ""}

        ${waiting.length ? `<div class="lbl mt16">Not paid yet</div>
          <div class="note"><div>The slot is held while she pays. If the money does
            not arrive, it frees itself and you keep the time.</div></div>
          ${waiting.map(bookingRow).join("")}` : ""}

        ${!up.length ? emptyCard("No requests yet",
            "When someone books you, it appears here.") : ""}
      </div>`);
  });
  return head("Requests", "What has come in") + host();
}

/* ── the tech's diary ────────────────────────────────── */
function vDiaryLive() {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("your diary");
    const all = (await API.bookings(true)).filter((b) => b.role === "tech");
    const up = upcoming(all).filter((b) => ["paid", "awaiting_payment"].includes(b.status));
    // Grouped by day, because a diary is read a day at a time.
    const days = [];
    up.forEach((b) => {
      const d = new Date(b.starts_at); d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      const found = days.find((x) => x.key === key);
      (found || days[days.push({ key, rows: [] }) - 1]).rows.push(b);
    });
    fillHost(`
      <div class="pad stack gap12">
        ${days.length ? days.map((d) => `
          <div class="lbl">${dayLabel(d.key)}</div>
          ${d.rows.map(bookingRow).join("")}`).join("")
          : emptyCard("Nothing in the diary", "Paid appointments show up here.")}
      </div>`);
  });
  return head("Diary", "Your week") + host();
}

/* ── one appointment, from whichever side ────────────── */
function vJob(bookingId) {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("this appointment");
    const all = await API.bookings(true);
    const b = all.find((x) => x.id === bookingId);
    if (!b) return fillHost(`<div class="pad"><div class="note"><div>That appointment is gone.</div></div></div>`);

    const asTech = b.role === "tech";
    const at = new Date(b.starts_at).getTime();
    const [words] = statusWords(b, asTech);

    fillHost(`
      <div class="pad stack gap12">
        <div class="ticket"><div style="padding:18px" class="stack gap12">
          <div class="kv"><span class="k">${asTech ? "Customer" : "Tech"}</span>
            <span class="v">${esc(asTech ? (b.customer_name || "A customer")
                                        : b.tech.business_name)}</span></div>
          <div class="kv"><span class="k">When</span>
            <span class="v">${dayLabel(at)} · ${hhmm(at)}</span></div>
          <div class="kv"><span class="k">Services</span>
            <span class="v">${b.items.map((i) => esc(i.name)).join("<br>") || "—"}</span></div>
          ${b.note ? `<div class="kv"><span class="k">Her note</span>
            <span class="v">${esc(b.note)}</span></div>` : ""}
          ${b.scan_shape ? `<div class="kv"><span class="k">Her scan</span>
            <span class="v">${esc(b.scan_shape)}</span></div>` : ""}
          <div class="kv" style="padding-top:12px;border-top:1px solid var(--line)">
            <span class="k">${b.status === "released" ? "Paid out" : "Held"}</span>
            <span class="v" style="font-size:19px">${kobo(b.total_kobo)}</span></div>
          <div class="kv"><span class="k">Status</span><span class="v">${esc(words)}</span></div>
        </div></div>

        ${["cancelled", "expired", "refunded"].includes(b.status) ? "" : `
          <button class="btn ghost" data-a="go" data-v="chat" data-id="${esc(b.id)}"
                  style="display:flex;align-items:center;justify-content:center;gap:9px">
            ${I.chat()} Message ${esc(asTech ? (b.customer_name || "her")
                                             : b.tech.business_name)}</button>`}

        ${!asTech && b.status === "awaiting_payment"
          ? `<button class="btn" data-a="go-pay" data-id="${esc(b.id)}">Pay now</button>` : ""}
        ${!asTech && b.status === "paid"
          ? `<button class="btn" data-a="go" data-v="ticket" data-id="${esc(b.id)}">
               Show the code</button>` : ""}
        ${asTech && b.status === "paid"
          ? `<div class="note pink"><div>Do her nails first, then scan her code from
               the Scan tab. Scanning is what pays you.</div></div>
             <button class="btn" data-a="go" data-v="scanner">Open the scanner</button>` : ""}
        ${!asTech && ["awaiting_payment", "paid"].includes(b.status)
          ? `<button class="btn ghost sm" data-a="cancel" data-id="${esc(b.id)}">
               Cancel this appointment</button>` : ""}
      </div>`);
  });
  return head("Appointment", "") + host();
}

/* ── home, as a map ───────────────────────────────────────
   Home and Salons are NOT the same screen, and now they are not even the same
   shape. Salons is the list, closest first. Home is the map: she opens Oma and
   sees where the techs are, the way she sees where the drivers are.

   Three things this screen has to survive, because all three happen here: the
   browser refuses location, the tiles do not load, and Leaflet itself never
   arrives. In each of them the screen must still be a screen you can book an
   appointment from — so location falls back to Lagos Island, and no Leaflet
   falls back to the plain list this function used to be.                    */

let MAP = null;      // the Leaflet instance, while the map screen is on
let PINS = [];       // { id, m, t } per tech, so a tap can find its marker
let NEAR = [];       // the techs the map was drawn from
let NEXTUP = null;   // her next appointment, shown in the sheet
let HOMEPOS = null;  // where we centred, and whether we had to guess it
let PICKID = null;   // the tech whose card is open, or null
let MAPRO = null;    // watches the map's box, see drawMap

/* paint() replaces the whole view. Leaflet keeps listeners on window and a
   running animation frame, so an instance left behind after its container is
   gone leaks and, worse, fights the next one for the same div. Every
   navigation calls this first. */
function stopMap() {
  if (MAPRO) { try { MAPRO.disconnect(); } catch (e) { /* gone */ } MAPRO = null; }
  if (MAP) { try { MAP.remove(); } catch (e) { /* already torn down */ } }
  MAP = null; PINS = []; NEAR = []; NEXTUP = null; HOMEPOS = null; PICKID = null;
}

/* Leaflet is deferred, so it is genuinely absent when boot() paints the first
   screen. Poll briefly rather than block the page on it. */
function waitForL(ms) {
  return new Promise((res) => {
    if (window.L) return res(window.L);
    const t0 = Date.now();
    const tick = setInterval(() => {
      if (window.L || Date.now() - t0 > ms) {
        clearInterval(tick);
        res(window.L || null);
      }
    }, 60);
  });
}

function vHomeLive() {
  load(async () => {
    stopMap();

    // Location and her bookings in parallel; neither should wait on the other,
    // and a GPS fix that never comes must not hold up the whole screen.
    const [pos, mine] = await Promise.all([
      whereAmI(),
      API.signedIn() ? API.bookings(false).catch(() => []) : Promise.resolve([]),
    ]);
    HOMEPOS = pos;
    NEAR = (await API.nearby(pos.lat, pos.lng, 15).catch(() => []))
      .filter((t) => Number.isFinite(+t.lat) && Number.isFinite(+t.lng));
    NEXTUP = upcoming(mine).filter((b) => b.status !== "cancelled")[0] || null;

    const L = await waitForL(6000);
    if (!L) return homeAsList();

    fillHost(`
      <div id="map"></div>
      <div class="mapbtns">
        <button class="mapbtn" data-a="map-me" aria-label="Centre the map on me">${I.pin()}</button>
        <button class="mapbtn pink" data-a="startscan" aria-label="Scan your hands">${I.scan()}</button>
        <button class="mapbtn" data-a="paste-tech"
                aria-label="Paste a nail tech's link">${I.clip()}</button>
      </div>
      <div class="mapsheet" id="msheet">
        <button class="mapgrip" id="mgrip" type="button"
                aria-label="Drag to resize the list, or tap to collapse it"><i></i></button>
        <div class="mapbody" id="mbody"></div>
      </div>`);

    // The sheet is painted first so the map can be fitted around it. Fitting
    // to a guessed height put the nearest tech — the one she most wants —
    // underneath the card that is supposed to be about her.
    SNAP = 1;
    paintSheet();
    wireSheetDrag();
    drawMap(pos, NEAR);
  });

  const me = DB.me || {};
  // The map comes FIRST and fills the whole view; the greeting is laid over it
  // rather than sitting in a bar above it. That is the difference between a map
  // in a rectangle and a map that is the screen.
  return `
  <div class="mapwrap" id="ahost">${spinner("Looking around you")}</div>
  <div class="maptop">
    <div class="mapgreet">
      <div class="who">
        <div class="small sub" style="font-weight:600">${greet()}</div>
        <div class="nm">${esc((me.name || "there").split(" ")[0])}</div>
      </div>
      <button class="avatar" data-a="go" data-v="profile">${esc(initials(me.name))}</button>
    </div>
  </div>`;
}

/* One pin. The initials rather than a dot, so a map of six techs is readable
   without tapping any of them. */
function pinIcon(t, on) {
  const n = on ? 44 : 36;
  return L.divIcon({
    className: "",
    html: `<div class="tpin${on ? " on" : ""}"><b><span>${esc(initials(t.business_name))}</span></b></div>`,
    iconSize: [n, n],
    iconAnchor: [n / 2, n],
  });
}

function drawMap(pos, list) {
  const el = document.getElementById("map");
  if (!el) return;

  MAP = L.map(el, { zoomControl: false, attributionControl: false });
  L.control.attribution({ position: "topleft" }).addTo(MAP);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, minZoom: 9,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(MAP);

  // Her own position is a dot, not a pin, and cannot be tapped — it is not a
  // place you can book.
  L.marker([pos.lat, pos.lng], {
    icon: L.divIcon({ className: "", html: '<div class="mepin"></div>',
                      iconSize: [16, 16], iconAnchor: [8, 8] }),
    interactive: false, keyboard: false,
  }).addTo(MAP);

  PINS = list.map((t) => {
    // This pin is the centre of her hexagon, not her address — see hex.sql.
    // The hexagon itself is deliberately NOT drawn: the customer sees an
    // ordinary pin and does not need a lesson in how the rounding works. The
    // rounding still happens, in the database, where it cannot be undone.
    const m = L.marker([+t.lat, +t.lng], { icon: pinIcon(t, false), title: t.business_name })
      .addTo(MAP);
    // Leaflet stops marker clicks from reaching the page, so these cannot go
    // through the one delegated handler like everything else does.
    m.on("click", () => choosePin(t.id));
    return { id: t.id, m, t };
  });

  // Open on her and the five nearest rather than on the whole city. The extra
  // padding at the bottom is the sheet's; without it the nearest tech opens
  // underneath the card that is meant to be about her.
  if (list.length) {
    const sheet = document.getElementById("msheet");
    const room = el.getBoundingClientRect().height;
    const under = Math.min(room * 0.62,
      (sheet ? sheet.getBoundingClientRect().height : 220) + 24);
    MAP.fitBounds([[pos.lat, pos.lng], ...list.slice(0, 5).map((t) => [+t.lat, +t.lng])], {
      paddingTopLeft: [40, 48], paddingBottomRight: [40, under], maxZoom: 15,
    });
  } else {
    MAP.setView([pos.lat, pos.lng], 14);
  }
  /* Leaflet measures its container ONCE and only draws tiles for that box. On a
     phone the box is still settling when the map is built — the address bar
     hides, the safe area resolves — so a single delayed nudge is not enough:
     the map ends up with tiles across the top and a blank band underneath,
     which is exactly what happened. Watch the box instead and re-measure every
     time it actually changes. */
  const nudge = () => { if (MAP) MAP.invalidateSize({ animate: false }); };
  if (window.ResizeObserver) {
    MAPRO = new ResizeObserver(nudge);
    MAPRO.observe(el);
  }
  requestAnimationFrame(nudge);
  setTimeout(nudge, 120);
  setTimeout(nudge, 600);       // iOS settles late
}

function choosePin(id) {
  PICKID = PICKID === id ? null : id;
  PINS.forEach((p) => {
    p.m.setIcon(pinIcon(p.t, p.id === PICKID));
  });
  const hit = PINS.find((p) => p.id === PICKID);
  if (hit && SNAP === 0) setSnap(1);   // her card is no use behind a shut sheet
  if (hit && MAP) {
    // Close in on the tech she tapped, the way a ride app does. Never zoom
    // back out; she may have zoomed in herself.
    const z = Math.max(MAP.getZoom(), 15);
    // And put her ABOVE the sheet rather than in the middle of the map, which
    // is behind it. Shifting the centre down in world pixels moves her up the
    // screen by the same amount.
    const s = document.getElementById("msheet");
    const drop = s ? s.getBoundingClientRect().height / 2 : 0;
    MAP.setView(MAP.unproject(MAP.project(hit.m.getLatLng(), z).add([0, drop]), z),
                z, { animate: true });
  }
  paintSheet();
}

function recentreMap() {
  if (!MAP) return;
  whereAmI().then((p) => {
    if (p.guessed) return askLocation();     // explain, do not silently guess
    HOMEPOS = p;
    if (MAP) MAP.setView([p.lat, p.lng], 15, { animate: true });
  });
}

/* ── the sheet over the map ─────────────────────────────
   Two states and no more: the short list of who is near, or the one tech whose
   pin was tapped. */
function paintSheet() {
  const b = document.getElementById("mbody");
  if (!b) return;
  const chosen = NEAR.find((t) => t.id === PICKID);
  b.innerHTML = chosen ? sheetOne(chosen) : sheetMany();
  b.scrollTop = 0;
}

/* ── the sheet slides ──────────────────────────────────
   Three positions: out of the way, half, and most of the screen. Snapping
   rather than free height means it always lands somewhere deliberate, and the
   map is never left with a useless sliver.                                  */
const SNAPS = [0.16, 0.46, 0.84];   // of the room between the map top and the bar
let SNAP = 1;

/* How tall the sheet is allowed to be. Measured rather than assumed: the gap
   under it belongs to the bottom bar, and that gap is different on a phone
   with a home indicator. */
function sheetRoom() {
  const wrap = document.querySelector(".mapwrap");
  const s = document.getElementById("msheet");
  if (!wrap || !s) return 0;
  const w = wrap.getBoundingClientRect(), r = s.getBoundingClientRect();
  return Math.max(120, w.height - (w.bottom - r.bottom) - 16);
}
const snapPx = (i) => Math.round(sheetRoom() * SNAPS[i]);

function setSnap(i) {
  SNAP = Math.max(0, Math.min(SNAPS.length - 1, i));
  const s = document.getElementById("msheet");
  if (s) s.style.height = snapPx(SNAP) + "px";
}

function wireSheetDrag() {
  const s = document.getElementById("msheet"), g = document.getElementById("mgrip");
  if (!s || !g) return;
  setSnap(SNAP);

  let from = null, startH = 0, moved = 0;

  g.addEventListener("pointerdown", (e) => {
    from = e.clientY;
    startH = s.getBoundingClientRect().height;
    moved = 0;
    s.classList.add("dragging");
    try { g.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  });

  g.addEventListener("pointermove", (e) => {
    if (from === null) return;
    const dy = e.clientY - from;             // down is positive, so height falls
    moved = Math.max(moved, Math.abs(dy));
    s.style.height =
      Math.max(snapPx(0), Math.min(snapPx(SNAPS.length - 1), startH - dy)) + "px";
  });

  function land() {
    if (from === null) return;
    from = null;
    s.classList.remove("dragging");
    // A tap, not a drag: collapse it, or open it again if it is already down.
    if (moved < 6) return setSnap(SNAP === 0 ? 1 : 0);
    const h = s.getBoundingClientRect().height;
    let best = 0;
    SNAPS.forEach((_, i) => {
      if (Math.abs(snapPx(i) - h) < Math.abs(snapPx(best) - h)) best = i;
    });
    setSnap(best);
  }
  g.addEventListener("pointerup", land);
  g.addEventListener("pointercancel", land);

  // Up and down arrows do the same thing for anyone not using a finger.
  g.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp")   { e.preventDefault(); setSnap(SNAP + 1); }
    if (e.key === "ArrowDown") { e.preventDefault(); setSnap(SNAP - 1); }
  });
}

function sheetOne(t) {
  return `
    <div class="rowbetween" style="margin-bottom:8px">
      <div class="lbl" style="margin:0">Nail tech</div>
      <button class="tiny sub" data-a="map-clear" style="font-weight:700">Close</button>
    </div>
    ${techRowLive(t)}
    <div class="tiny sub" style="margin-top:8px">
      You get her address once you have booked.</div>
    <button class="btn mt12" data-a="tech-open" data-id="${esc(t.id)}"
            data-name="${esc(t.business_name)}">See what she does</button>`;
}

function sheetMany() {
  const n = NEAR.length;
  return `
    ${NEXTUP ? `<div class="lbl">Coming up</div>${bookingRow(NEXTUP)}
                <div style="height:14px"></div>` : ""}
    <div class="rowbetween" style="margin-bottom:8px">
      <div class="lbl" style="margin:0">${n
        ? `${n} nail tech${n > 1 ? "s" : ""} near you`
        : "Nail techs near you"}</div>
      ${n > 3 ? `<span class="seeall" data-a="go" data-v="salons">See all</span>` : ""}
    </div>
    ${HOMEPOS && HOMEPOS.guessed ? `<div class="note warn" style="margin-bottom:10px"><div>
      <b>These are not distances from you.</b> Oma could not tell where you are,
      so it is showing Lagos Island.
      <button class="lnk" data-a="ask-loc">Use my location</button>
    </div></div>` : ""}
    ${HOMEPOS && !HOMEPOS.guessed ? `
      <div class="locline ${HOMEPOS.acc > 150 ? "rough" : ""}">
        ${I.pin(true)}
        <span>${HOMEPOS.acc
          ? `Using your location, to about ${HOMEPOS.acc < 1000
               ? Math.round(HOMEPOS.acc) + " m"
               : (HOMEPOS.acc / 1000).toFixed(1) + " km"}`
          : "Using your location"}</span>
        <button class="lnk" data-a="ask-loc">Refresh</button>
      </div>` : ""}
    ${n ? NEAR.slice(0, 3).map(techRowLive).join("")
        : `<div class="empty" style="padding:18px 12px"><div class="ic">${I.pin()}</div>
             <b>No nail techs near you yet</b>
             Oma shows techs who have listed themselves and passed their ID check.</div>`}
`;
}

/* ── home without a map ─────────────────────────────────
   Leaflet did not arrive. This is the screen home was before it was a map, and
   it books an appointment just as well. */
function homeAsList() {
  const last = DB.scans[0];
  fillHost(`
    <div class="maplist">
      <div class="pad mt16">
        <button class="hero" data-a="startscan">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="flex:1">
              <div class="eyebrow" style="color:rgba(255,255,255,.85)">Hand scan</div>
              <div style="font-size:19px;font-weight:800;letter-spacing:-.025em;line-height:1.25;margin-top:6px">
                Find the shape that suits your hands</div>
              <div style="margin-top:14px;display:inline-flex;align-items:center;gap:7px;background:#fff;
                  color:#c22a66;font-size:13.5px;font-weight:700;padding:9px 15px;border-radius:99px">
                ${last ? "Scan again" : "Start scan"}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>
              </div>
            </div>
          </div>
        </button>
      </div>

      ${last ? `<div class="pad mt12">${scanCard(last)}</div>` : ""}

      ${NEXTUP ? `<div class="pad mt16"><div class="lbl">Coming up</div></div>
                  <div class="pad stack gap12">${bookingRow(NEXTUP)}</div>` : ""}

      <div class="seehead">
        <h3>Nail techs near you</h3>
        ${NEAR.length > 3 ? `<span class="seeall" data-a="go" data-v="salons">See all</span>` : ""}
      </div>
      <div class="pad stack gap12">
        ${NEAR.length
          ? NEAR.slice(0, 3).map(techRowLive).join("")
          : `<div class="empty"><div class="ic">${I.pin()}</div>
               <b>No nail techs near you yet</b>
               Oma shows techs who have listed themselves and passed their ID check.</div>`}
      </div>
      <div style="height:16px"></div>
    </div>`);
}

/* Her position, or Lagos Island so a screen is never empty merely because a
   browser would not say where she is. High accuracy is asked for on purpose:
   the question this screen answers is "which of these two streets", and a
   network-derived fix in Lagos can be a kilometre out — which is exactly the
   confusion this is meant to remove. It costs a few seconds, so the timeout is
   generous rather than the eight seconds it was. */
function whereAmI() {
  const LAGOS = { lat: 6.4478, lng: 3.4723, guessed: true, why: "unavailable" };
  return new Promise((res) => {
    if (!navigator.geolocation) return res(LAGOS);
    navigator.geolocation.getCurrentPosition(
      (p) => res({
        lat: p.coords.latitude, lng: p.coords.longitude, guessed: false,
        // Metres. Worth showing when it is bad: a 900 m fix makes "400 m away"
        // a lie, and she should be able to see that rather than trust it.
        acc: Math.round(p.coords.accuracy || 0),
      }),
      (err) => res(Object.assign({}, LAGOS, {
        why: err && err.code === 1 ? "denied"
           : err && err.code === 3 ? "timeout" : "unavailable",
      })),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

/* granted | prompt | denied | unknown. Worth knowing before offering a button:
   once a browser has been told no, asking again does nothing at all, and a
   button that silently does nothing is worse than no button. */
function locState() {
  return new Promise((res) => {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return res("unknown");
      navigator.permissions.query({ name: "geolocation" })
        .then((p) => res(p.state)).catch(() => res("unknown"));
    } catch (e) { res("unknown"); }
  });
}

/* The button on the "Showing Lagos Island" note, and the arrow on the map. */
async function askLocation() {
  if (await locState() === "denied") {
    return toast("Location is blocked for Oma. Turn it back on in your browser's "
               + "settings for this site, then try again.");
  }
  toast("Looking for you\u2026");
  const p = await whereAmI();
  if (p.guessed) {
    return toast(p.why === "denied"
      ? "Without your location Oma has to guess, and it is guessing Lagos Island."
      : "Could not get a fix. Outdoors, or with Wi-Fi on, usually does it.");
  }
  HOMEPOS = p;
  paint();                       // redraw home around where she actually is
}
