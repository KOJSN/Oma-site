/* ══ WORKING, AND WHERE ════════════════════════════════════════════════
   For the nail tech who has no shop.

   Kamsy, 8 Sep 2026: "not all nail techs have a store, so before the tech
   fills her form let her confirm she has a salon or not; if she doesn't, let
   her location be tracked for her to be visible."

   A salon is a place. A tech who works out of a bag is not: she is wherever
   she is this afternoon, and a pin she dropped last week is a lie that costs
   a customer a taxi fare. So she gets a HEARTBEAT instead of a pin — her
   phone says where she is while she is working, and live.sql shows her for as
   long as that heartbeat is fresh. Stop working and she leaves the map,
   rather than sitting on it, wrong.

   ── the honest shape of "24/7" ───────────────────────────────────────

   A WEB PAGE CANNOT FOLLOW ANYBODY AROUND IN THE BACKGROUND. The moment she
   locks her phone or switches app, iOS and Android suspend the page and
   watchPosition stops. There is no flag, permission or trick that changes
   that; anyone who says otherwise is describing a native app.

   So this file has two halves that do the same job at different depths:

     ON THE WEB (today)      watchPosition while the app is open and visible,
                             plus a renewal tick so a tech standing still
                             still counts as here. She is visible for 45
                             minutes after her last fix, which covers a phone
                             in a pocket through one appointment.

     IN THE APP (App Store)  the native wrapper keeps CoreLocation /
                             FusedLocationProvider running with the app in the
                             background and calls window.OmaLive.position(...)
                             here. Everything downstream — the throttle, the
                             API call, what the screen says — is the same code.
                             See ios/BACKGROUND-LOCATION.md.

   The bridge is deliberately the whole of the difference. When the wrapper
   ships, no screen and no server function changes; a wrapper that is not
   there simply never calls in, and the web half carries on alone.

   ── what is never done ───────────────────────────────────────────────

   No trail. Each heartbeat overwrites the last, here and in the database.
   Oma holds WHERE SHE IS, never WHERE SHE HAS BEEN — a record of a woman's
   movements is a far more dangerous thing to keep than a current position,
   it is not needed to put her on a map, and the reliable way not to leak it
   is not to have it.

   Nothing here runs for a customer, ever. A customer's position is asked of
   her phone when a screen needs a distance and then dropped.               */

const LIVE = {
  on: false,        // she has said she is working
  watch: null,      // navigator.geolocation.watchPosition id
  tick: null,       // the renewal timer
  last: null,       // { lat, lng, at } — the last fix we SENT
  liveAt: null,     // what the SERVER said, not what we hoped
  err: null,        // the last refusal, in her words
  src: "web",       // or "ios" / "android" once a wrapper is calling in
  native: false,    // a wrapper answered when we asked
};

// A fix is worth sending when she has moved 25 m, or when four minutes have
// passed and the freshness itself needs renewing. Both are well inside
// live.sql's 45-minute window, so a missed send is never a disappearance.
const LIVE_MOVE_M = 25;
const LIVE_RENEW_MS = 240000;
const LIVE_MIN_GAP_MS = 20000;      // never more than three sends a minute
const LIVE_KEY = "oma-working";     // she was working when the app last closed

function metresApart(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2
          + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

/* ── the one place a position goes to the server ────────────────────
   Every source — the web watcher, the renewal tick, the native wrapper —
   comes through here, so the throttle cannot be bypassed by adding a fourth
   source later. */
async function liveSend(lat, lng, acc, src) {
  if (!LIVE.on) return;
  if (!Number.isFinite(+lat) || !Number.isFinite(+lng)) return;
  const now = { lat: +lat, lng: +lng, at: Date.now() };
  if (src) { LIVE.src = src; LIVE.native = src !== "web"; }

  if (LIVE.last) {
    const since = now.at - LIVE.last.at;
    if (since < LIVE_MIN_GAP_MS) return;                 // too soon, whatever moved
    if (metresApart(LIVE.last, now) < LIVE_MOVE_M && since < LIVE_RENEW_MS) return;
  }

  try {
    const r = (await API.pingPosition(now.lat, now.lng, acc))[0] || {};
    LIVE.last = now;
    LIVE.liveAt = r.live_at || null;
    LIVE.err = null;
  } catch (e) {
    // Her screen must not claim she is visible because we sent something. It
    // says visible only when the SERVER said so.
    LIVE.err = (e && e.message) || "Could not reach Oma";
  }
  paintWorking();
}

/* ── the web half ───────────────────────────────────────────────────── */
function liveWatchStart() {
  if (LIVE.watch !== null || !navigator.geolocation) return;
  LIVE.watch = navigator.geolocation.watchPosition(
    (p) => liveSend(p.coords.latitude, p.coords.longitude,
                    Math.round(p.coords.accuracy || 0), "web"),
    (e) => {
      LIVE.err = e && e.code === 1
        ? "Location is off for Oma, so customers cannot see you."
        : "No fix yet — outdoors, or with Wi-Fi on, usually does it.";
      paintWorking();
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
  );
  // watchPosition fires when she MOVES. A tech doing somebody's nails for an
  // hour does not move, and without this she would quietly expire mid-
  // appointment. The tick re-sends the same position to renew the freshness.
  if (!LIVE.tick) {
    LIVE.tick = setInterval(() => {
      if (!LIVE.on) return;
      if (LIVE.last) return liveSend(LIVE.last.lat, LIVE.last.lng, null, LIVE.src);
      whereAmI().then((p) => { if (!p.guessed) liveSend(p.lat, p.lng, p.acc, "web"); });
    }, LIVE_RENEW_MS);
  }
}

function liveWatchStop() {
  if (LIVE.watch !== null && navigator.geolocation) {
    try { navigator.geolocation.clearWatch(LIVE.watch); } catch (e) { /* gone */ }
  }
  LIVE.watch = null;
  if (LIVE.tick) { clearInterval(LIVE.tick); LIVE.tick = null; }
}

/* ── the native half ─────────────────────────────────────────────────
   Two lines of contract, and the wrapper implements whichever side it is.
   Absent — which is every browser today — these do nothing at all. */
function nativeBridge() {
  try {
    if (window.webkit && webkit.messageHandlers && webkit.messageHandlers.omaLocation) {
      return { post: (m) => webkit.messageHandlers.omaLocation.postMessage(m), kind: "ios" };
    }
    if (window.OmaAndroid && typeof OmaAndroid.setBackgroundLocation === "function") {
      return { post: (m) => OmaAndroid.setBackgroundLocation(JSON.stringify(m)), kind: "android" };
    }
  } catch (e) { /* a wrapper that half-exists is the same as none */ }
  return null;
}

function nativeSay(on) {
  const b = nativeBridge();
  if (!b) return false;
  try {
    b.post({ action: on ? "start" : "stop", minMetres: LIVE_MOVE_M,
             minSeconds: Math.round(LIVE_RENEW_MS / 1000) });
    LIVE.native = true;
    return true;
  } catch (e) { return false; }
}

/* What the wrapper calls, from CoreLocation's didUpdateLocations or Android's
   LocationCallback, with the app in the background. This is the ONLY entry
   point it needs, and it is the same funnel the web watcher uses. */
window.OmaLive = {
  position(lat, lng, acc, src) {
    return liveSend(lat, lng, acc, src || "native");
  },
  // The wrapper asks this on launch so it knows whether to start CoreLocation
  // at all — a nail tech who is not working should not be tracked.
  wanted() { return !!LIVE.on; },
  // The wrapper calls this when the phone refuses. Her screen must say so
  // rather than showing a switch that is on and a listing nobody can find.
  denied(why) {
    LIVE.err = why === "denied"
      ? "Location is off for Oma in your phone's settings, so customers "
        + "cannot see you."
      : "Oma cannot get your position right now.";
    paintWorking();
  },
  version: 1,
};

/* ── on and off ─────────────────────────────────────────────────────── */
async function liveStart() {
  LIVE.on = true; LIVE.err = null;
  try { localStorage.setItem(LIVE_KEY, "1"); } catch (e) { /* private mode */ }
  liveWatchStart();
  nativeSay(true);
  paintWorking();
  // Send one immediately rather than waiting for the first movement, so she is
  // on the map the moment she says she is working.
  const p = await whereAmI();
  if (p.guessed) {
    LIVE.err = p.why === "denied"
      ? "Location is off for Oma, so customers cannot see you."
      : "No fix yet — Oma will keep trying.";
    return paintWorking();
  }
  LIVE.last = null;                       // never throttle the first one
  return liveSend(p.lat, p.lng, p.acc, LIVE.native ? LIVE.src : "web");
}

async function liveStop() {
  LIVE.on = false;
  try { localStorage.removeItem(LIVE_KEY); } catch (e) { /* private mode */ }
  liveWatchStop();
  nativeSay(false);
  LIVE.last = null;
  try {
    const r = (await API.goOffline())[0] || {};
    LIVE.liveAt = r.live_at || null;
  } catch (e) { LIVE.err = (e && e.message) || "Could not reach Oma"; }
  paintWorking();
}

function toggleWorking() {
  return LIVE.on ? liveStop() : liveStart();
}

/* Called once by boot(), and again whenever she signs in. Picks the working
   switch back up where she left it — but only after ASKING THE SERVER whether
   she is actually a travelling tech, because a salon must never start
   broadcasting. */
async function liveResume() {
  if (!API.signedIn()) return;
  let p;
  try { p = (await API.myPresence())[0]; } catch (e) { return; }
  if (!p || p.has_salon) return;                 // a shop does not move
  LIVE.liveAt = p.live_at || null;
  let wanted = false;
  try { wanted = localStorage.getItem(LIVE_KEY) === "1"; } catch (e) { /* private */ }
  // Fresh on the server counts as working even if this phone forgot — she may
  // have switched device, and the map already has her.
  if (wanted || p.visible) return liveStart();
  paintWorking();
}

/* ── what she sees ──────────────────────────────────────────────────── */
function agoWords(iso) {
  if (!iso) return null;
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  return Math.round(s / 3600) + " hr ago";
}

function workingCard() {
  const seen = agoWords(LIVE.liveAt);
  const on = LIVE.on && !!LIVE.liveAt && !LIVE.err;
  return `<div class="card work${on ? " on" : ""}" id="workCard">
    <div class="rowbetween">
      <div style="min-width:0">
        <div style="font-weight:800;letter-spacing:-.02em">
          ${on ? "Customers can see you" : "You are off the map"}</div>
        <div class="tiny faint" style="margin-top:3px">
          ${LIVE.err ? esc(LIVE.err)
            : on ? `Your position updated ${esc(seen || "just now")}. Oma shows
                    where you are now, and keeps no record of where you have been.`
                 : `Turn this on when you start work. Nobody can find you while
                    it is off, and Oma is not watching you.`}</div>
      </div>
      <button class="switch${LIVE.on ? " on" : ""}" data-a="work-toggle"
              role="switch" aria-checked="${LIVE.on ? "true" : "false"}"
              aria-label="Working now"><i></i></button>
    </div>
    ${LIVE.on && !LIVE.native ? `<div class="tiny faint" style="margin-top:9px">
      Keep Oma open while you work. A website cannot follow you once the phone
      is locked — the Oma app from the App Store will, and this switch is what
      it uses.</div>` : ""}
  </div>`;
}

/* Repaint the one card in place. paint() would rebuild the whole screen and
   throw away a half-typed price. */
function paintWorking() {
  const el = document.getElementById("workCard");
  if (!el) return;
  const box = document.createElement("div");
  box.innerHTML = workingCard();
  el.replaceWith(box.firstElementChild);
}

/* A page that is hidden is a page whose watchPosition has probably been
   suspended. Ask again the moment she comes back, so her first look at the
   screen is not a stale "updated 40 min ago". */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !LIVE.on) return;
  whereAmI().then((p) => { if (!p.guessed) liveSend(p.lat, p.lng, p.acc, LIVE.src); });
});
