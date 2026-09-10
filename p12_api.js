/* ══ the back end, and a stand-in for it ═════════════════
   One object, two implementations behind it.

   LIVE talks to Supabase over plain fetch. No SDK: the whole app is one file
   that has to work offline, and pulling in a library to make four kinds of
   POST request would cost more than it saves.

   MOCK does the same things in memory, faithfully enough to develop against —
   the thirty-minute hold, held versus available money, one-time scan, the
   five-attempt lockout. It is what lets every screen below be built and tested
   before a single account exists anywhere.

   Which one runs is decided by whether a project URL has been configured. That
   means the app works, end to end, on a phone with no backend at all — which
   is also exactly how it behaves today.                                    */

const API = (() => {
  const CFG_KEY = "oma-cfg";
  const SESS_KEY = "oma-session";
  const PRACTICE_KEY = "oma-practice";

  /* Baked in at build time from oma-config.js. Nobody should have to paste a
     URL and a key into a phone to use the app — that step is why three real
     accounts signed up, filled in a listing, and had every word of it written
     to their own device and nowhere else. Kamsy, 9 Sep 2026.

     The anon key belongs here. It is PUBLIC BY DESIGN: it identifies the
     project, not the person, and every function it can reach checks who is
     calling before it answers. The service_role key is the opposite of that
     and build.py refuses to build if it sees one. */
  const BUILT_IN = { url: "__SUPABASE_URL__", anon: "__SUPABASE_ANON__" };
  // Both tests fail on the un-substituted placeholders, so a build without the
  // details still produces a working practice app rather than a broken live one.
  const hasBuiltIn = () =>
    /^https:\/\/.+/.test(BUILT_IN.url) && (BUILT_IN.anon || "").length > 40;

  const practice = () => localStorage.getItem(PRACTICE_KEY) === "1";

  const cfg = () => {
    if (practice()) return {};                       // her choice wins
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { stored = {}; }
    if (stored.url && stored.anon) return stored;    // a hand-entered project
    return hasBuiltIn() ? BUILT_IN : {};             // otherwise the shipped one
  };
  const live = () => !!(cfg().url && cfg().anon);

  /* Same reasoning as configure() below: a session belongs to the backend that
     issued it. The practice version mints one with the literal token "mock",
     and carrying that into live would leave the app believing it is signed in
     while Supabase quietly refuses every call. */
  function setPractice(on) {
    if (on) localStorage.setItem(PRACTICE_KEY, "1");
    else localStorage.removeItem(PRACTICE_KEY);
    setSession(null);
  }

  function configure(url, anon) {
    const next = { url: (url || "").replace(/\/$/, ""), anon };
    const prev = cfg();
    localStorage.setItem(CFG_KEY, JSON.stringify(next));
    // Switching backends invalidates who you are. The practice version mints a
    // session with the literal token "mock"; left in place when a real project
    // is connected, the app believes it is signed in, never offers sign-in
    // again, and sends that fake token to Supabase — which quietly refuses it.
    // A session belongs to the backend that issued it, so drop it on any change.
    if (prev.url !== next.url || prev.anon !== next.anon) setSession(null);
  }

  /* ── the session ──────────────────────────────────────── */
  let SESSION = null;
  try { SESSION = JSON.parse(localStorage.getItem(SESS_KEY)); } catch { SESSION = null; }

  function setSession(s) {
    SESSION = s;
    if (s) localStorage.setItem(SESS_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESS_KEY);
  }
  // Self-heal an install that switched to a real project while holding a
  // practice session. Without this, anyone already in that state stays stuck:
  // the app thinks they are signed in, so it never offers sign-in again.
  if (SESSION && SESSION.access_token === "mock" && cfg().url && cfg().anon) {
    SESSION = null;
    try { localStorage.removeItem(SESS_KEY); } catch { /* private mode */ }
  }

  const signedIn = () => !!(SESSION && SESSION.access_token);
  const userId = () => (SESSION && SESSION.user && SESSION.user.id) || null;

  /* Supabase returns expires_in seconds; store the moment, not the duration,
     because the duration stops being true the second it is written down. */
  function stamp(s) {
    if (s && s.expires_in) s.expires_at = Date.now() + s.expires_in * 1000 - 60000;
    return s;
  }

  async function refresh() {
    if (!SESSION || !SESSION.refresh_token) return false;
    const r = await fetch(`${cfg().url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: cfg().anon, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: SESSION.refresh_token }),
    });
    if (!r.ok) { setSession(null); return false; }
    setSession(stamp(await r.json()));
    return true;
  }

  /* ── talking to Supabase ──────────────────────────────── */
  async function call(path, body, { auth = true, retry = true } = {}) {
    if (auth && SESSION && SESSION.expires_at && Date.now() > SESSION.expires_at) await refresh();

    const headers = { apikey: cfg().anon, "Content-Type": "application/json" };
    if (auth && SESSION) headers.Authorization = `Bearer ${SESSION.access_token}`;

    const r = await fetch(`${cfg().url}${path}`, {
      method: "POST", headers, body: JSON.stringify(body || {}),
    });

    if (r.status === 401 && auth && retry && await refresh()) {
      return call(path, body, { auth, retry: false });
    }

    const text = await r.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { message: text }; }

    if (!r.ok) {
      // Postgres messages are written for the person reading them — the ones in
      // api.sql say "there are less than 15 minutes left on this hold", not
      // "ERRCODE 23514". Pass them through rather than replacing them with
      // "Something went wrong".
      // PostgREST says "message"; GoTrue (auth) says "msg" and carries an
      // "error_code" like "otp_disabled". Reading only "message" turned every
      // auth failure into a bare status code with the actual reason discarded.
      const p = parsed || {};
      const msg = [p.message, p.msg, p.error_description, p.error, p.error_code]
        .find(v => typeof v === "string" && v.trim())
        || `request failed (${r.status})`;
      const e = new Error(msg);
      e.status = r.status;
      throw e;
    }
    return parsed;
  }

  const rpc = (fn, args) => call(`/rest/v1/rpc/${fn}`, args || {});
  const edge = (fn, body) => call(`/functions/v1/${fn}`, body || {});

  /* ── Storage ───────────────────────────────────────────────
     Portfolio photographs. Not JSON and not RPC: raw bytes go straight to
     Supabase Storage, so these do not go through call() — a 150 kB image has
     no business being base64'd into a JSON body.

     The bucket is public to READ, which is why photoUrl needs no token: these
     are advertising, meant to be seen by people who have not signed in. WRITING
     is another matter — the storage policy in photo.sql only accepts an upload
     into a folder named after the caller's own user id. */
  function photoUrl(path) {
    if (!live()) return path;               // the practice app keeps data URLs
    return `${cfg().url}/storage/v1/object/public/portfolio/${path}`;
  }

  async function storagePut(path, blob, type) {
    if (!SESSION) throw new Error("sign in first");
    const r = await fetch(`${cfg().url}/storage/v1/object/portfolio/${path}`, {
      method: "POST",
      headers: {
        apikey: cfg().anon,
        Authorization: `Bearer ${SESSION.access_token}`,
        "Content-Type": type || "image/jpeg",
        // Never overwrite silently. Every path carries a random part, so a
        // collision means something is wrong and should say so.
        "x-upsert": "false",
      },
      body: blob,
    });
    if (!r.ok) {
      const t = await r.text();
      let m = "That photo would not upload.";
      try { m = (JSON.parse(t) || {}).message || m; } catch (e) { /* not json */ }
      throw new Error(m);
    }
    return path;
  }

  async function storageDelete(path) {
    if (!SESSION) return;
    // Best effort. The ROW is what a listing reads, and it has already gone by
    // the time this runs; a file left behind is a few kilobytes nobody sees.
    try {
      await fetch(`${cfg().url}/storage/v1/object/portfolio/${path}`, {
        method: "DELETE",
        headers: { apikey: cfg().anon, Authorization: `Bearer ${SESSION.access_token}` },
      });
    } catch (e) { /* orphaned, and harmless */ }
  }

  /* ── signing in ───────────────────────────────────────────
     By EMAIL, with a six-digit code. It used to be a phone number and an SMS,
     which needs a Termii sender ID, which needs CAC — so nobody could sign in
     at all while that was pending. Supabase sends the email itself.

     Supabase sends a magic LINK by default; it sends a code instead only if
     the Magic Link email template contains {{ .Token }}. If somebody gets a
     link rather than a six-digit code, that template is the thing to fix, not
     this code. */
  async function sendOtp(email) {
    if (!live()) return MOCK.sendOtp(email);
    await call("/auth/v1/otp", { email }, { auth: false });
    return { sent: true };
  }

  async function verifyOtp(email, token) {
    if (!live()) return MOCK.verifyOtp(email, token);
    // "email", not "sms" — the verify endpoint keys off this and answers
    // "Token has expired or is invalid" for the wrong one, which reads like a
    // typed code being wrong rather than a mismatched type.
    //
    // And a FIRST sign-in is a different case again. Supabase sends a brand
    // new account its code from the "Confirm signup" template, not "Magic
    // Link", and there are reports of that code refusing to verify as "email"
    // while verifying happily as "signup". Which one a given project wants is
    // not something worth being confident about from documentation, so both
    // are tried. The cost is one extra request on a first sign-in only; the
    // alternative is somebody staring at "token has expired or is invalid"
    // while holding a code that is neither expired nor invalid.
    let s;
    try {
      s = stamp(await call("/auth/v1/verify",
                           { type: "email", email, token }, { auth: false }));
    } catch (first) {
      try {
        s = stamp(await call("/auth/v1/verify",
                             { type: "signup", email, token }, { auth: false }));
      } catch (second) {
        // Report the FIRST failure: for a genuinely wrong code both say the
        // same thing, and the first is the ordinary path.
        throw first;
      }
    }
    setSession(s);
    return s;
  }

  function googleUrl() {
    const back = location.origin + location.pathname;
    return `${cfg().url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
  }

  /* Supabase's implicit flow comes back with the tokens in the URL fragment.
     Read them, store them, then scrub the address bar — a shared screenshot of
     a URL containing an access token is a signed-in session for whoever sees it. */
  function captureRedirect() {
    if (!location.hash || location.hash.indexOf("access_token=") < 0) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    const s = stamp({
      access_token: p.get("access_token"),
      refresh_token: p.get("refresh_token"),
      expires_in: Number(p.get("expires_in") || 3600),
      user: null,
    });
    setSession(s);
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }

  function signOut() { setSession(null); }

  /* ── what the screens actually call ───────────────────── */
  const A = {
    configure, live, signedIn, userId, signOut, googleUrl, captureRedirect,
    practice, setPractice, hasBuiltIn,
    sendOtp, verifyOtp,

    me:            ()                       => live() ? rpc("api_me")               : MOCK.me(),
    saveProfile:   (name, area, lat, lng)   => live() ? rpc("api_save_profile", { p_name: name, p_area: area, p_lat: lat, p_lng: lng }) : MOCK.saveProfile(name, area, lat, lng),
    nearby:        (lat, lng, km)           => live() ? rpc("api_nearby", { p_lat: lat, p_lng: lng, p_km: km }) : MOCK.nearby(lat, lng, km),
    search:        (q, lat, lng)            => live() ? rpc("api_search", { p_q: q || "", p_lat: lat == null ? null : lat, p_lng: lng == null ? null : lng }) : MOCK.search(q, lat, lng),

    /* Where a nail tech who has no shop is RIGHT NOW. A salon has an address
       and never touches any of these; see live.sql for why a travelling tech
       gets a heartbeat instead of a pin, and p20_live.js for what sends it. */
    pingPosition:  (lat, lng, acc)          => live() ? rpc("api_ping_position", { p_lat: lat, p_lng: lng, p_acc: acc == null ? null : acc }) : MOCK.pingPosition(lat, lng, acc),
    goOffline:     ()                       => live() ? rpc("api_go_offline") : MOCK.goOffline(),
    myPresence:    ()                       => live() ? rpc("api_my_presence") : MOCK.myPresence(),
    setMobility:   (hasSalon, state)        => live() ? rpc("api_set_mobility", { p_has_salon: !!hasSalon, p_state: state || null }) : MOCK.setMobility(!!hasSalon, state),

    /* The whole-state map. api_nearby answers "who is within 15 km of me";
       this answers "who does Oma have in Lagos at all". */
    stateTechs:    (state, lat, lng)        => live() ? rpc("api_state_techs", { p_state: state, p_lat: lat == null ? null : lat, p_lng: lng == null ? null : lng, p_limit: 300 }) : MOCK.stateTechs(state, lat, lng),
    states:        ()                       => live() ? rpc("api_states") : MOCK.states(),

    /* She comes to you. The QUOTE is asked of the server, never worked out
       here: the tech's real coordinates never leave the database, so the
       distance cannot be measured on a phone even if it were wise to let it.
       See home.sql. */
    // Does she travel at all, and on what terms. Read beside her services so
    // the "she comes to me" choice is only offered when it is real.
    homeTerms:     (techId)                 => live() ? rpc("api_home_terms", { p_tech: techId }) : MOCK.homeTerms(techId),
    homeQuote:     (techId, ids, lat, lng)  => live() ? rpc("api_home_quote", { p_tech: techId, p_service_ids: ids || [], p_lat: lat, p_lng: lng }) : MOCK.homeQuote(techId, ids, lat, lng),
    bookAtHome:    (techId, startsAt, ids, lat, lng, address, area, note, shape) => live() ? rpc("api_book_at_home", { p_tech: techId, p_starts: new Date(startsAt).toISOString(), p_service_ids: ids, p_lat: lat, p_lng: lng, p_address: address, p_area: area || null, p_note: note || null, p_shape: shape || null }) : MOCK.bookAtHome(techId, startsAt, ids, lat, lng, address, area, note, shape),
    // The customer's street, released to the tech only once the money is in
    // escrow. One function for both sides; the server decides what each sees.
    bookingWhere:  (bookingId)              => live() ? rpc("api_booking_where", { p_booking: bookingId }) : MOCK.bookingWhere(bookingId),
    setHomeService:(on, callout, perKm, maxKm) => live() ? rpc("api_set_home_service", { p_on: !!on, p_callout_kobo: callout, p_per_km_kobo: perKm, p_max_km: maxKm }) : MOCK.setHomeService(!!on, callout, perKm, maxKm),
    setServiceHomePrice: (id, kobo)         => live() ? rpc("api_set_service_home_price", { p_service: id, p_home_kobo: kobo }) : MOCK.setServiceHomePrice(id, kobo),
    // A device, not a subscription. The database is deliberately incurious
    // about which kind of token this is; see push.sql.
    registerDevice:(platform, token, label)  => live() ? rpc("api_register_device", { p_platform: platform, p_token: token, p_label: label || null }) : MOCK.registerDevice(platform, token, label),
    forgetDevice:  (token)                  => live() ? rpc("api_forget_device", { p_token: token }) : MOCK.forgetDevice(token),
    myDevices:     ()                       => live() ? rpc("api_my_devices", {}) : MOCK.myDevices(),
    services:      (techId)                 => live() ? rpc("api_services", { p_tech: techId }) : MOCK.services(techId),
    book:          (techId, startsAt, ids, note, shape) => live() ? rpc("api_book", { p_tech: techId, p_starts: new Date(startsAt).toISOString(), p_service_ids: ids, p_note: note, p_shape: shape }) : MOCK.book(techId, startsAt, ids, note, shape),
    bookings:      (past)                   => live() ? rpc("api_my_bookings", { p_past: !!past }) : MOCK.bookings(!!past),
    codes:         (bookingId)              => live() ? rpc("api_booking_codes", { p_booking: bookingId }) : MOCK.codes(bookingId),
    cancel:        (bookingId)              => live() ? rpc("api_cancel", { p_booking: bookingId }) : MOCK.cancel(bookingId),
    dispute:       (bookingId)              => live() ? rpc("api_dispute", { p_booking: bookingId }) : MOCK.dispute(bookingId),
    becomeTech:    (o)                      => live() ? rpc("api_become_tech", { p_business_name: o.name, p_address: o.address, p_area: o.area, p_lat: o.lat, p_lng: o.lng, p_years: o.years }) : MOCK.becomeTech(o),
    addService:    (name, mins, kobo, shapes) => live() ? rpc("api_add_service", { p_name: name, p_minutes: mins, p_price_kobo: kobo, p_shapes: shapes || [] }) : MOCK.addService(name, mins, kobo, shapes),
    setListed:     (on)                     => live() ? rpc("api_set_listed", { p_listed: !!on }) : MOCK.setListed(!!on),
    scan:          (code)                   => live() ? rpc("api_scan", { p_code: code })   : MOCK.scan(code),
    scanShort:     (bookingId, code)        => live() ? rpc("api_scan_short", { p_booking: bookingId, p_code: code }) : MOCK.scanShort(bookingId, code),
    /* Reviews. api_search and api_nearby deliberately do NOT carry the score:
       adding it would have meant redefining their return types in a second
       SQL file, and whichever file ran last would win. One extra call for a
       whole screen of results is the cheaper mistake. */
    ratings:       (ids)                    => live() ? rpc("api_ratings", { p_techs: ids || [] }) : MOCK.ratings(ids),
    techReviews:   (techId, limit)          => live() ? rpc("api_tech_reviews", { p_tech: techId, p_limit: limit || 20 }) : MOCK.techReviews(techId),
    leaveReview:   (bookingId, stars, words) => live() ? rpc("api_leave_review", { p_booking: bookingId, p_stars: stars, p_words: words || null }) : MOCK.leaveReview(bookingId, stars, words),
    myReview:      (bookingId)              => live() ? rpc("api_my_review", { p_booking: bookingId }) : MOCK.myReview(bookingId),
    reviewable:    ()                       => live() ? rpc("api_reviewable") : MOCK.reviewable(),

    earnings:      (limit)                  => live() ? rpc("api_earnings", { p_limit: limit || 30 }) : MOCK.earnings(limit),

    wallet:        ()                       => live() ? rpc("api_wallet")          : MOCK.wallet(),
    requestPayout: (kobo)                   => live() ? rpc("api_request_payout", { p_amount: kobo }) : MOCK.requestPayout(kobo),

    // Messages. A thread is a booking; see chat.sql for why.
    messages:      (bookingId)              => live() ? rpc("api_messages", { p_booking: bookingId }) : MOCK.messages(bookingId),
    send:          (bookingId, body)        => live() ? rpc("api_send", { p_booking: bookingId, p_body: body }) : MOCK.send(bookingId, body),
    threads:       ()                       => live() ? rpc("api_threads") : MOCK.threads(),
    readThread:    (bookingId)              => live() ? rpc("api_read", { p_booking: bookingId }) : MOCK.readThread(bookingId),

    // These two go to edge functions, because they talk to somebody else's API.
    payInit:       (bookingId)              => live() ? edge("pay-init", { booking_id: bookingId }) : MOCK.payInit(bookingId),
    verifyNin:     (vnin)                   => live() ? edge("kyc", { vnin })      : MOCK.verifyNin(vnin),

    /* HER WHOLE MENU, in one call. Add/edit/delete as three endpoints would
       mean the phone working out the difference and firing a burst of them —
       and a listing left half-saved when one fails. See menu.sql, and the bug
       it exists for: nothing ever sent her services to the server at all. */
    syncServices:  (menu)                   => live() ? rpc("api_sync_services", { p_menu: menu }) : MOCK.syncServices(menu),
    myServices:    ()                       => live() ? rpc("api_my_services") : MOCK.myServices(),

    /* O points. Every figure on that screen comes from here — the rate, the
       prizes and the cap all live on the season row, so changing a prize is
       one UPDATE rather than a rebuild and a re-upload. */
    deleteAccount: ()                     => live() ? rpc("api_delete_account") : MOCK.deleteAccount(),
    accountBlockers: ()                   => live() ? rpc("api_my_account_blockers") : MOCK.accountBlockers(),
    myPoints:      ()                       => live() ? rpc("api_my_points") : MOCK.myPoints(),
    leaderboard:   (role, limit)            => live() ? rpc("api_leaderboard", { p_role: role || "tech", p_limit: limit || 20 }) : MOCK.leaderboard(role, limit),
    myReferralCode:()                       => live() ? rpc("api_my_referral_code") : MOCK.myReferralCode(),
    useReferral:   (code)                   => live() ? rpc("api_use_referral", { p_code: code }) : MOCK.useReferral(code),

    /* Her work, under each service. The bytes go to Storage first and this
       registers the fact of them — see photo.sql for why those are two steps
       rather than one. */
    techPhotos:    (techId)                 => live() ? rpc("api_tech_photos", { p_tech: techId }) : MOCK.techPhotos(techId),
    addPhoto:      (serviceId, path, w, h, bytes, own) => live() ? rpc("api_add_service_photo", { p_service: serviceId, p_path: path, p_w: w, p_h: h, p_bytes: bytes, p_own_work: own !== false }) : MOCK.addPhoto(serviceId, path, w, h, bytes, own),
    removePhoto:   (id)                     => live() ? rpc("api_remove_service_photo", { p_id: id }) : MOCK.removePhoto(id),
    reportPhoto:   (id, why)                => live() ? rpc("api_report_photo", { p_id: id, p_why: why || null }) : MOCK.reportPhoto(id, why),
    photoUrl, storagePut, storageDelete,

    // Only the mock has this: it is how the demo pretends money arrived.
    pretendPaid:   (bookingId)              => MOCK.pretendPaid(bookingId),
    isMock:        ()                       => !live(),
  };

  /* ══ hexagons ═════════════════════════════════════════════
     The same grid as hex.sql, in JavaScript, so the practice version of the
     app looks and behaves like the real one. The REAL one computes this in the
     database and this code never runs against it — a tech's true position must
     not travel to a browser to be rounded there, which would defeat the whole
     point of rounding it.

     A pointy-top hex grid on Web Mercator metres. 350 m circumradius, so a
     cell is about 600 m across: she is somewhere in this shape, and the map
     says exactly that instead of drawing a door.                          */
  const HEX = (() => {
    const R = 6378137, S = 350;
    const mx = (lng) => R * lng * Math.PI / 180;
    const my = (lat) => R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    const lngOf = (x) => x / R * 180 / Math.PI;
    const latOf = (y) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;

    // Rounded in cube space: rounding q and r on their own lands outside the
    // hexagon near its corners, which leaves gaps and doubles up cells.
    function qr(lat, lng) {
      const x = mx(lng), y = my(lat);
      const cx = (Math.sqrt(3) / 3 * x - y / 3) / S, cz = (2 / 3 * y) / S, cy = -cx - cz;
      let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
      const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dy > dz)       ry = -rx - rz;
      else                    rz = -rx - ry;
      return [rx, rz];
    }
    const cx = (q, r) => S * Math.sqrt(3) * (q + r / 2);
    const cy = (q, r) => S * 1.5 * r;

    return {
      snap(lat, lng) {
        const [q, r] = qr(lat, lng);
        const corners = [];
        for (let i = 0; i < 6; i++) {
          const a = (60 * i - 30) * Math.PI / 180;
          corners.push([latOf(cy(q, r) + S * Math.sin(a)),
                        lngOf(cx(q, r) + S * Math.cos(a))]);
        }
        return { cell: q + ":" + r, lat: latOf(cy(q, r)), lng: lngOf(cx(q, r)),
                 boundary: corners };
      },
    };
  })();

  /* ══ the stand-in ═════════════════════════════════════════
     Same shapes, same rules, same error messages, no network. Money here is
     imaginary and the code signing is a toy hash rather than an HMAC — that is
     fine and deliberate, because nothing in this branch ever guards anything
     real. What it does have to get right is the BEHAVIOUR, so that a screen
     built against it does not need rewriting when the real one arrives.    */
  const MOCK = (() => {
    const KEY = "oma-mock-v1";
    let S = null;
    /* The exact text we last read or wrote. Holding it lets load() tell "this
       is our own copy" from "somebody else has written since", which matters
       for two reasons. Caching S for ever meant a second tab never saw the
       first one's bookings — the stand-in was pretending to be a server while
       behaving like a private variable. But re-parsing on EVERY call is worse:
       a function that does `const s = load(); ...; save()` with another load()
       in between would end up writing a different object than it edited, and
       silently drop the row it just added. Comparing the raw text gives a
       stable S inside one call and a fresh one across them. */
    let RAW = null;
    const load = () => {
      const cur = localStorage.getItem(KEY);
      if (S && cur === RAW) return S;
      RAW = cur;
      try { S = JSON.parse(cur); } catch { S = null; }
      if (!S) S = { user: null, techs: [], services: [], bookings: [], ledger: [],
                    reviews: [], attempts: {}, seeded: false };
      // A store written before reviews existed has no array to push into, and
      // the first rating would throw rather than save. Same for photos.
      if (!S.reviews) S.reviews = [];
      if (!S.photos) S.photos = [];
      seed();
      return S;
    };
    const save = () => { RAW = JSON.stringify(S); localStorage.setItem(KEY, RAW); };
    const uid = () => "mm" + Math.random().toString(36).slice(2, 10);
    const fail = (m) => { throw new Error(m); };

    /* Not a hash anybody should trust — it exists so the demo's codes look and
       behave like the real ones. The real one is HMAC-SHA256 in the database. */
    function toy(s) {
      let h1 = 0x811c9dc5, h2 = 0x01000193;
      for (let i = 0; i < s.length; i++) {
        h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 + s.charCodeAt(i) * (i + 7), 2246822519) >>> 0;
      }
      let out = "";
      for (let i = 0; i < 8; i++) {
        h1 = Math.imul(h1 ^ (h2 + i), 16777619) >>> 0;
        out += h1.toString(16).padStart(8, "0");
      }
      return out;
    }
    const longCode = (id) => `${id}.${toy("code:" + id)}`;
    const shortCode = (id) => String(parseInt(toy("short:" + id).slice(0, 8), 16) % 1000000).padStart(6, "0");

    function seed() {
      if (S.seeded) return;
      S.seeded = true;
      const names = [
        ["Nails by Tola", "Lekki Phase 1", 6.4478, 3.4723, 6],
        ["Glossy Lagos", "Victoria Island", 6.4281, 3.4219, 3],
        ["The Nail Room", "Ikoyi", 6.4550, 3.4350, 9],
        ["Ada's Studio", "Yaba", 6.5095, 3.3711, 2],
        ["Pretty Tips", "Surulere", 6.4969, 3.3550, 5],
      ];
      names.forEach(([name, area, lat, lng, years]) => {
        const id = uid();
        // Pretty Tips has no shop — she travels, and she is working now. The
        // practice app needs one of each or the map cannot be checked.
        const roams = name === "Pretty Tips";
        S.techs.push({ id, business_name: name, area, address: roams ? null : area + ", Lagos",
                       lat, lng, years, currency: "NGN", opens: "09:00", closes: "18:00",
                       kyc: "verified", listed: true, state: "Lagos",
                       // Two of the five travel, so the practice app can show
                       // both a salon and a home visit without any setting up.
                       home_service: roams || name === "The Nail Room",
                       callout_kobo: 300000, per_km_kobo: 130000, home_max_km: 15,
                       has_salon: !roams,
                       live_at: roams ? new Date().toISOString() : null });
        [["Acrylic full set", 120, 900000], ["Gel overlay", 75, 550000],
         ["Refill", 90, 650000], ["Soak off", 30, 200000]].forEach(([n, m, k]) => {
          S.services.push({ id: uid(), tech_id: id, name: n, minutes: m, price_kobo: k, active: true });
        });
      });
      save();
    }

    // Which side of a booking this device is on. The stand-in has one person
    // who may be both, so "me" is the user id and "my tech" is her listing.
    const myTechId = () => (load().user || {}).tech_id || null;
    const whoAmI = () => (load().user || {}).id || "me";

    const meRow = () => {
      const s = load();
      if (!s.user) s.user = { id: "me", full_name: "", phone: null, email: null,
                             area: null, is_tech: false, tech: null, kyc: null };
      return s.user;
    };

    const km = (a, b, c, d) => {
      const R = 6371, p = Math.PI / 180;
      const x = Math.sin((c - a) * p / 2) ** 2 +
        Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2;
      return R * 2 * Math.asin(Math.sqrt(x));
    };

    const myTech = () => {
      const s = load();
      return s.techs.find((t) => t.id === (s.user && s.user.tech_id)) || null;
    };

    const bal = (bucket) => {
      const s = load(), t = myTech();
      if (!t) return 0;
      return s.ledger.filter((l) => l.tech_id === t.id && l.bucket === bucket)
        .reduce((a, l) => a + l.delta_kobo, 0);
    };

    function expire() {
      const s = load(); let changed = false;
      s.bookings.forEach((b) => {
        if (b.status === "awaiting_payment" && Date.now() > b.pay_deadline_ms) {
          b.status = "expired"; changed = true;
        }
      });
      if (changed) save();
    }

    function shape(b) {
      const s = load();
      const t = s.techs.find((x) => x.id === b.tech_id) || {};
      // In the demo one person is both sides, which is the point — she needs to
      // see her own booking as a customer and then scan it as the tech. So the
      // two are decided separately rather than one excluding the other. In the
      // live database they genuinely are different accounts and only one of
      // these can ever be true.
      const asTech = !!(s.user && s.user.tech_id && b.tech_id === s.user.tech_id);
      const mine = !!(s.user && b.customer_id === s.user.id);
      return {
        id: b.id, starts_at: new Date(b.starts_at_ms).toISOString(), minutes: b.minutes,
        total_kobo: b.total_kobo, status: b.status, note: b.note, scan_shape: b.scan_shape,
        pay_deadline: new Date(b.pay_deadline_ms).toISOString(),
        role: asTech ? "tech" : "customer",
        tech: { id: t.id, business_name: t.business_name, area: t.area, address: t.address },
        customer_name: asTech ? ((s.user && s.user.full_name) || "Client") : null,
        items: b.items,
        code: mine && b.status === "paid" ? longCode(b.id) : null,
        short_code: mine && b.status === "paid" ? shortCode(b.id) : null,
      };
    }

    return {
      sendOtp: async () => ({ sent: true, mock: true }),
      verifyOtp: async (email, token) => {
        if (String(token).replace(/\D/g, "").length !== 6) fail("that code is six digits");
        const s = load();
        s.user = s.user || {};
        Object.assign(s.user, { id: s.user.id || "me", email, full_name: s.user.full_name || "" });
        save();
        setSession({ access_token: "mock", refresh_token: "mock", user: { id: s.user.id } });
        return { mock: true };
      },
      me: async () => {
        const u = meRow(), t = myTech();
        return { ...u, tech: t, kyc: t ? t.kyc : null };
      },
      saveProfile: async (name, area, lat, lng) => {
        const u = meRow();
        if (name) u.full_name = name;
        if (area != null) u.area = area;
        if (lat != null) { u.lat = lat; u.lng = lng; }
        save(); return await MOCK.me();
      },
      /* live.sql's tech_visible(), in the practice app. A salon is visible
         once she has listed herself; a travelling tech only while her phone
         is still saying where she is. 45 minutes, the same window. */
      visible: (t) => !!t && !!t.listed && (t.has_salon !== false ||
        (!!t.live_at && Date.now() - new Date(t.live_at).getTime() < 45 * 60000)),

      pingPosition: async (lat, lng) => {
        const s = load(), t = myTech();
        if (!t) throw new Error("list yourself first");
        if (t.has_salon !== false) throw new Error("this listing is a salon — its address does not move");
        const moved = t.lat == null ? null : km(t.lat, t.lng, lat, lng) * 1000;
        if (moved != null && moved > 100000) {
          throw new Error("that fix is " + Math.round(moved / 1000) + " km from your last one");
        }
        t.lat = lat; t.lng = lng; t.live_at = new Date().toISOString();
        save();
        return [{ live_at: t.live_at, moved_m: moved, listed: t.listed }];
      },
      goOffline: async () => {
        const t = myTech();
        if (t && t.has_salon === false) { t.live_at = null; save(); }
        return [{ live_at: (t && t.live_at) || null }];
      },
      myPresence: async () => {
        const t = myTech();
        if (!t) return [];
        return [{ has_salon: t.has_salon !== false, state: t.state || null,
                  live_at: t.live_at || null, listed: !!t.listed,
                  visible: MOCK.visible(t),
                  seconds_ago: t.live_at
                    ? (Date.now() - new Date(t.live_at).getTime()) / 1000 : null }];
      },
      setMobility: async (hasSalon, state) => {
        const t = myTech();
        if (!t) throw new Error("list yourself first");
        t.has_salon = !!hasSalon;
        if (state) t.state = state;
        if (hasSalon) t.live_at = null;
        save();
        return [{ has_salon: t.has_salon, state: t.state || null, live_at: t.live_at || null }];
      },
      stateTechs: async (state, lat, lng) => {
        const s = load(), want = String(state || "").toLowerCase().trim();
        return s.techs.filter(MOCK.visible)
          .filter((t) => (t.state || "").toLowerCase() === want ||
                         (!t.state && (t.area || "").toLowerCase().includes(want)))
          .map((t) => {
            const pin = HEX.snap(t.lat, t.lng);
            return { ...t, address: null,
                     km: lat == null ? null : km(lat, lng, t.lat, t.lng),
                     lat: pin.lat, lng: pin.lng, cell: pin.cell, boundary: pin.boundary,
                     from_kobo: Math.min(...s.services.filter((x) => x.tech_id === t.id).map((x) => x.price_kobo)) };
          })
          .sort((a, b) => (a.km == null ? 1 : b.km == null ? -1 : a.km - b.km));
      },
      states: async () => {
        const out = {};
        load().techs.filter(MOCK.visible).forEach((t) => {
          const k = (t.state || "").trim() || "(not said)";
          out[k] = (out[k] || 0) + 1;
        });
        return Object.keys(out).map((state) => ({ state, techs: out[state] }))
          .sort((a, b) => b.techs - a.techs || a.state.localeCompare(b.state));
      },

      /* home.sql, in the practice app. Deliberately the same arithmetic and
         the same refusals, so the demo and the real thing behave alike. */
      fareKm: (km) => Math.max(1, Math.ceil((km || 0) * 2) / 2),

      homeTerms: async (techId) => {
        const t = load().techs.find((x) => x.id === techId && x.listed);
        if (!t) return null;
        return { home_service: !!t.home_service,
                 callout_kobo: t.callout_kobo == null ? 300000 : t.callout_kobo,
                 per_km_kobo: t.per_km_kobo == null ? 130000 : t.per_km_kobo,
                 home_max_km: t.home_max_km == null ? 15 : t.home_max_km };
      },

      homeQuote: async (techId, ids, lat, lng) => {
        const s = load();
        const t = s.techs.find((x) => x.id === techId);
        if (!t || !t.listed) throw new Error("that tech is not listed");
        const svcs = s.services.filter((x) => ids.includes(x.id) && x.tech_id === techId && x.active);
        if (svcs.length !== (ids || []).length || !svcs.length) {
          throw new Error("one of those services is not available from that tech");
        }
        const base = svcs.reduce((a, x) => a + (x.home_kobo || x.price_kobo), 0);
        const salon = svcs.reduce((a, x) => a + x.price_kobo, 0);
        if (!t.home_service) {
          return { ok: false, why: "not_offered", base_kobo: base,
                   says: t.business_name + " does not travel to customers." };
        }
        if (lat == null || lng == null) {
          return { ok: false, why: "no_position", base_kobo: base,
                   says: "Oma needs to know where you are to work out the travel." };
        }
        const d = km(lat, lng, t.lat, t.lng);
        const max = t.home_max_km == null ? 15 : t.home_max_km;
        if (d > max) {
          return { ok: false, why: "too_far", km: Math.round(d * 10) / 10, max_km: max,
                   base_kobo: base,
                   says: t.business_name + " travels up to " + max + " km, and you are "
                         + (Math.round(d * 10) / 10) + " km away." };
        }
        const callout = t.callout_kobo == null ? 300000 : t.callout_kobo;
        const perKm = t.per_km_kobo == null ? 130000 : t.per_km_kobo;
        const cKm = MOCK.fareKm(d);
        const fare = Math.round(cKm * perKm);
        return { ok: true, km: Math.round(d * 10) / 10, charged_km: cKm,
                 base_kobo: base, callout_kobo: callout, per_km_kobo: perKm,
                 fare_kobo: fare, total_kobo: base + callout + fare, salon_kobo: salon };
      },

      bookAtHome: async (techId, startsAt, ids, lat, lng, address, area, note, shapeName) => {
        if (!String(address || "").trim()) throw new Error("she needs an address to come to");
        const q = await MOCK.homeQuote(techId, ids, lat, lng);
        if (!q.ok) throw new Error(q.says || "she cannot come to you");
        const s = load();
        const svcs = s.services.filter((x) => ids.includes(x.id));
        const items = svcs.map((x) => ({ service_id: x.id, name: x.name, minutes: x.minutes,
                                         price_kobo: x.home_kobo || x.price_kobo }));
        // The two lines with no service_id. That is the whole mechanism by
        // which Oma's fee stays off the tech's petrol — see booking_base_kobo.
        if (q.callout_kobo) items.push({ service_id: null, name: "Home visit", minutes: 0,
                                         price_kobo: q.callout_kobo });
        if (q.fare_kobo) items.push({ service_id: null, name: "Travel (" + q.charged_km + " km)",
                                      minutes: 0, price_kobo: q.fare_kobo });
        const b = await MOCK.bookItems(techId, startsAt, items, note, shapeName);
        b.at_home = true; b.cust_address = String(address).trim();
        b.cust_area = area || null; b.cust_lat = lat; b.cust_lng = lng; b.km = q.km;
        save();
        return Object.assign({}, shape(b), { at_home: true, km: q.km, quote: q });
      },

      bookingWhere: async (bookingId) => {
        const s = load();
        const b = s.bookings.find((x) => x.id === bookingId);
        const mine = (s.user || {}).id;
        if (!b || (b.customer_id !== mine && b.tech_id !== mine)) throw new Error("no such booking");
        if (!b.at_home) return { at_home: false };
        const open = b.customer_id === mine
          || ["paid", "released", "disputed"].includes(b.status);
        return { at_home: true, km: b.km, area: b.cust_area,
                 address: open ? b.cust_address : null,
                 lat: open ? b.cust_lat : null, lng: open ? b.cust_lng : null,
                 why: open ? null : "The address comes through once the appointment is paid for." };
      },

      setHomeService: async (on, callout, perKm, maxKm) => {
        const t = myTech();
        if (!t) throw new Error("list yourself first");
        t.home_service = !!on;
        if (callout != null) t.callout_kobo = callout;
        if (perKm != null) t.per_km_kobo = perKm;
        if (maxKm != null) t.home_max_km = maxKm;
        save();
        return { home_service: t.home_service, callout_kobo: t.callout_kobo,
                 per_km_kobo: t.per_km_kobo, home_max_km: t.home_max_km };
      },

      setServiceHomePrice: async (id, kobo) => {
        const s = load(), t = myTech();
        const sv = s.services.find((x) => x.id === id && t && x.tech_id === t.id);
        if (!sv) throw new Error("that is not one of your services");
        sv.home_kobo = kobo == null ? null : kobo;
        save();
        return { id, home_kobo: sv.home_kobo };
      },

      /* menu.sql, in the practice app: the same reconcile, so the demo and
         the real thing agree about what a second Save does. */
      syncServices: async (menu) => {
        const s = load(), t = myTech();
        if (!t) throw new Error("set up your listing first");
        if (!Array.isArray(menu)) throw new Error("that is not a menu");
        const keep = [];
        for (const it of menu) {
          const nm = String((it && it.name) || "").trim();
          if (!nm) continue;                       // started and abandoned
          const kobo = Number(it.price_kobo) || 0;
          if (kobo <= 0) throw new Error(nm + " needs a price");
          if (kobo > 100000000) throw new Error(nm + " costs more than a million naira — check the price");
          let row = it.id ? s.services.find((x) => x.id === it.id && x.tech_id === t.id) : null;
          if (!row) {
            row = { id: uid(), tech_id: t.id };
            s.services.push(row);
          }
          row.name = nm;
          row.minutes = Math.max(1, Math.min(1440, Number(it.minutes) || 60));
          row.price_kobo = kobo;
          row.shapes = Array.isArray(it.shapes) ? it.shapes : [];
          row.home_kobo = it.home_kobo || null;
          row.active = true;
          keep.push(row.id);
        }
        s.services.forEach((x) => {
          if (x.tech_id === t.id && !keep.includes(x.id)) x.active = false;
        });
        save();
        return keep.map((id) => {
          const x = s.services.find((y) => y.id === id);
          return { id: x.id, name: x.name, minutes: x.minutes,
                   price_kobo: x.price_kobo, shapes: x.shapes || [],
                   home_kobo: x.home_kobo || null };
        });
      },
      myServices: async () => {
        const s = load(), t = myTech();
        if (!t) return [];
        return s.services.filter((x) => x.tech_id === t.id && x.active)
          .map((x) => ({ id: x.id, name: x.name, minutes: x.minutes,
                         price_kobo: x.price_kobo, shapes: x.shapes || [],
                         home_kobo: x.home_kobo || null }));
      },

      /* photo.sql, in the practice app. The "path" here is a data URL rather
         than an object in Storage — the demo has no Storage — but everything
         above it behaves the same, including the cap and the reporting. */
      techPhotos: async (techId) => {
        const s = load();
        const out = {};
        (s.photos || []).filter((p) => p.tech_id === techId && !p.hidden_at)
          .forEach((p) => {
            (out[p.service_id] = out[p.service_id] || [])
              .push({ id: p.id, path: p.path, w: p.w, h: p.h });
          });
        return out;
      },
      addPhoto: async (serviceId, path, w, h, bytes, own) => {
        const s = load(), t = myTech();
        const sv = s.services.find((x) => x.id === serviceId);
        if (!sv || !t || sv.tech_id !== t.id) throw new Error("that is not one of your services");
        s.photos = s.photos || [];
        const n = s.photos.filter((p) => p.service_id === serviceId && !p.hidden_at).length;
        if (n >= 3) throw new Error("that service already has 3 photos — remove one first");
        const row = { id: uid(), service_id: serviceId, tech_id: t.id, path,
                      w: w || null, h: h || null, bytes: bytes || null,
                      own_work: own !== false, reports: 0, hidden_at: null,
                      created_at: new Date().toISOString() };
        s.photos.push(row); save();
        return { id: row.id, path };
      },
      removePhoto: async (id) => {
        const s = load(), t = myTech();
        const i = (s.photos || []).findIndex((p) => p.id === id && t && p.tech_id === t.id);
        if (i < 0) throw new Error("that is not one of your photos");
        const [gone] = s.photos.splice(i, 1); save();
        return { path: gone.path };
      },
      reportPhoto: async (id) => {
        const s = load();
        const p = (s.photos || []).find((x) => x.id === id);
        if (p) { p.reports = (p.reports || 0) + 1; save(); }
        return { ok: true };
      },

      nearby: async (lat, lng, radius) => {
        const s = load();
        return s.techs.filter(MOCK.visible)
          .map((t) => {
            // Distance from where she really is; position from her hexagon.
            // The address is withheld exactly as the real one withholds it.
            const pin = HEX.snap(t.lat, t.lng);
            return { ...t, address: null, km: km(lat, lng, t.lat, t.lng),
                     lat: pin.lat, lng: pin.lng,
                     cell: pin.cell, boundary: pin.boundary,
                     from_kobo: Math.min(...s.services.filter((x) => x.tech_id === t.id).map((x) => x.price_kobo)) };
          })
          .filter((t) => t.km <= (radius || 10))
          .sort((a, b) => a.km - b.km);
      },
      /* The same search as api_search in search.sql, close enough that the
         practice app and the real one behave alike: every word has to land
         somewhere, the best kind of match ranks first, and being far away is
         not a reason to be missing. */
      search: async (q, lat, lng) => {
        const s = load();
        const query = String(q || "").trim().toLowerCase();
        const toks = query ? query.split(/\s+/) : null;
        const out = [];
        for (const t of s.techs) {
          // Not just "listed": a travelling tech whose phone stopped reporting
          // is off the map, and being searchable by name would be a way round
          // that. See MOCK.visible and live.sql's tech_visible.
          if (!MOCK.visible(t)) continue;
          const svcs = s.services.filter((x) => x.tech_id === t.id && x.active);
          const n = (t.business_name || "").toLowerCase();
          const a = (t.area || "").toLowerCase();
          const sv = svcs.map((x) => x.name.toLowerCase()).join(" ");
          const sh = svcs.map((x) => (x.shapes || []).join(" ").toLowerCase()).join(" ");
          const hay = [n, a, sv, sh].join(" ");
          if (toks && !toks.every((w) => hay.includes(w))) continue;
          let rank = 9, matched = null;
          if (toks) {
            if (n.startsWith(query)) { rank = 1; matched = "name"; }
            else if (n.includes(query)) { rank = 2; matched = "name"; }
            else if (a.includes(query)) { rank = 3; matched = "area"; }
            else if (sv.includes(query)) { rank = 4; matched = "service"; }
            else if (sh.includes(query)) { rank = 5; matched = "shape"; }
            else { rank = 6; matched = "match"; }
          }
          const pin = HEX.snap(t.lat, t.lng);
          out.push({ ...t, address: null, rank, matched,
                     km: lat == null || lng == null ? null : km(lat, lng, t.lat, t.lng),
                     lat: pin.lat, lng: pin.lng, cell: pin.cell, boundary: pin.boundary,
                     from_kobo: svcs.length ? Math.min(...svcs.map((x) => x.price_kobo)) : null });
        }
        return out.sort((x, y) => x.rank - y.rank ||
          (x.km == null ? 1 : y.km == null ? -1 : x.km - y.km) ||
          String(x.business_name).localeCompare(String(y.business_name))).slice(0, 50);
      },
      registerDevice: async (platform, token, label) => {
        const s = load();
        s.devices = s.devices || [];
        const at = s.devices.findIndex((d) => d.token === token);
        if (at >= 0) s.devices[at].last_seen = Date.now();
        else s.devices.push({ id: s.devices.length + 1, platform, token, label,
                              last_seen: Date.now() });
        save();
        return s.devices.length;
      },
      forgetDevice: async (token) => {
        const s = load();
        s.devices = (s.devices || []).filter((d) => d.token !== token);
        save();
      },
      myDevices: async () => (load().devices || []).map((d) =>
        ({ id: d.id, platform: d.platform, label: d.label, last_seen: d.last_seen })),
      services: async (techId) => load().services.filter((s) => s.tech_id === techId && s.active),

      /* ── messages ──────────────────────────────────────────
         Same rules as chat.sql: only the two people on the booking, no sender
         the caller can name, nothing to say once the appointment is off. */
      messages: async (bookingId) => {
        const s = load();
        const b = s.bookings.find((x) => x.id === bookingId);
        if (!b || (b.customer_id !== meRow().id && b.tech_id !== myTechId()))
          fail("no such conversation");
        return (s.messages || []).filter((m) => m.booking_id === bookingId)
          .map((m) => ({ id: m.id, body: m.body, at: new Date(m.at).toISOString(),
                         mine: m.sender === whoAmI() }));
      },
      send: async (bookingId, body) => {
        const s = load();
        const b = s.bookings.find((x) => x.id === bookingId);
        if (!b || (b.customer_id !== meRow().id && b.tech_id !== myTechId()))
          fail("no such conversation");
        if (["cancelled", "expired", "refunded"].includes(b.status) ||
            b.starts_at_ms < Date.now() - 30 * 864e5)
          fail("this appointment is closed, so the conversation is too");
        const text = String(body || "").trim();
        if (!text) fail("write something first");
        s.messages = s.messages || [];
        const m = { id: uid(), booking_id: bookingId, sender: whoAmI(),
                    body: text.slice(0, 2000), at: Date.now() };
        s.messages.push(m); save();
        return { id: m.id, body: m.body, at: new Date(m.at).toISOString(), mine: true };
      },
      threads: async () => {
        const s = load();
        const reads = s.reads || {};
        return s.bookings
          .filter((b) => b.customer_id === meRow().id || b.tech_id === myTechId())
          .map((b) => {
            const ms = (s.messages || []).filter((m) => m.booking_id === b.id)
              .sort((x, y) => x.at - y.at);
            if (!ms.length) return null;
            const last = ms[ms.length - 1];
            const t = s.techs.find((x) => x.id === b.tech_id) || {};
            const mine = b.customer_id === meRow().id;
            return {
              booking_id: b.id, starts_at: new Date(b.starts_at_ms).toISOString(),
              status: b.status, role: mine ? "customer" : "tech",
              who: mine ? t.business_name : (meRow().full_name || "A customer"),
              last: last.body, last_at: new Date(last.at).toISOString(),
              last_mine: last.sender === whoAmI(),
              unread: ms.filter((m) => m.sender !== whoAmI() &&
                                       m.at > (reads[whoAmI() + "|" + b.id] || 0)).length,
            };
          })
          .filter(Boolean)
          .sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
      },
      readThread: async (bookingId) => {
        const s = load();
        s.reads = s.reads || {};
        // Keyed by person as well as booking, exactly like message_read: one
        // browser is one person, but the store is shared and the tech reading
        // a thread must not clear the customer's badge.
        s.reads[whoAmI() + "|" + bookingId] = Date.now();
        save();
      },
      /* The same seam create_booking gives the server: hand it a list of
         itemised lines and it makes the appointment. A home visit is that
         list plus two lines with no service_id, and NOTHING else about
         booking, escrow or the scan needs to know. */
      bookItems: async (techId, startsAt, items, note, shapeName) => {
        const s = load(); expire();
        const at = new Date(startsAt).getTime();
        if (at <= Date.now()) fail("that time has already passed");
        const clash = s.bookings.find((b) => b.tech_id === techId && b.starts_at_ms === at &&
          ["awaiting_payment", "paid", "released"].includes(b.status));
        if (clash) fail("somebody has just taken that slot");
        const b = {
          id: uid(), customer_id: meRow().id, tech_id: techId, starts_at_ms: at,
          minutes: Math.max(1, items.reduce((a, x) => a + (x.minutes || 0), 0)),
          total_kobo: items.reduce((a, x) => a + x.price_kobo, 0),
          status: "awaiting_payment", note: note || null, scan_shape: shapeName || null,
          pay_deadline_ms: Date.now() + 30 * 60000,
          items: items.map((x) => ({ service_id: x.service_id == null ? null : x.service_id,
                                     name: x.name, minutes: x.minutes || 0,
                                     price_kobo: x.price_kobo })),
        };
        s.bookings.push(b); save();
        return b;
      },
      book: async (techId, startsAt, ids, note, shapeName) => {
        const s = load();
        const chosen = s.services.filter((x) => ids.includes(x.id) && x.tech_id === techId && x.active);
        if (chosen.length !== ids.length) fail("one of those services is not available from that tech");
        return shape(await MOCK.bookItems(techId, startsAt,
          chosen.map((x) => ({ service_id: x.id, name: x.name, minutes: x.minutes,
                               price_kobo: x.price_kobo })), note, shapeName));
      },
      /* fee.sql's booking_base_kobo(): the lines that ARE services. The
         call-out and the fare are not Oma's to charge on. */
      baseKobo: (b) => {
        const svc = (b.items || []).filter((i) => i.service_id != null);
        return svc.length ? svc.reduce((a, i) => a + i.price_kobo, 0) : b.total_kobo;
      },
      bookings: async (past) => {
        const s = load(); expire();
        return s.bookings
          .filter((b) => past || b.starts_at_ms > Date.now() - 86400000)
          .sort((a, b) => b.starts_at_ms - a.starts_at_ms)
          .map(shape);
      },
      codes: async (id) => {
        const s = load(), b = s.bookings.find((x) => x.id === id);
        if (!b) fail("no such booking");
        if (b.status !== "paid") fail("there is no code until the appointment is paid for");
        return { code: longCode(id), short_code: shortCode(id) };
      },
      cancel: async (id) => {
        const s = load(), b = s.bookings.find((x) => x.id === id);
        if (!b) fail("no such booking");
        if (b.status !== "awaiting_payment") fail(`that appointment is ${b.status} and cannot be cancelled here`);
        b.status = "cancelled"; save(); return shape(b);
      },
      dispute: async (id) => {
        const s = load(), b = s.bookings.find((x) => x.id === id);
        if (!b || b.status !== "paid") fail("only money still in escrow can be disputed");
        b.status = "disputed"; save(); return shape(b);
      },
      payInit: async (id) => {
        const s = load(), b = s.bookings.find((x) => x.id === id);
        if (!b) fail("no such booking");
        if (b.status !== "awaiting_payment") fail(`this appointment is ${b.status}`);
        const left = (b.pay_deadline_ms - Date.now()) / 60000;
        if (left <= 0) fail("that hold has expired — book the slot again");
        if (left < 15) fail("there are less than 15 minutes left on this hold, which is shorter " +
                            "than the bank can keep an account open. Book the slot again for a fresh 30 minutes.");
        return {
          account_number: "90" + toy(b.id).slice(0, 8).replace(/\D/g, "0").padEnd(8, "4"),
          account_name: "OMA / " + (s.techs.find((t) => t.id === b.tech_id) || {}).business_name,
          bank: "Wema Bank", amount_kobo: b.total_kobo,
          expires_at: new Date(b.pay_deadline_ms).toISOString(),
          reference: "mock_" + b.id, mock: true,
        };
      },
      /* The demo's version of a webhook. There is no equivalent in the live
         path on purpose: only Paystack can say money arrived. */
      pretendPaid: async (id) => {
        const s = load(), b = s.bookings.find((x) => x.id === id);
        if (!b || b.status !== "awaiting_payment") fail("nothing to pay for");
        b.status = "paid";
        b.auto_refund_ms = Date.now() + 7 * 86400000;
        s.ledger.push({ tech_id: b.tech_id, booking_id: b.id, bucket: "held",
                        delta_kobo: b.total_kobo, kind: "capture", at: Date.now() });
        save(); return shape(b);
      },
      becomeTech: async (o) => {
        const s = load(), u = meRow();
        let t = myTech();
        if (!t) {
          t = { id: uid(), kyc: "none", listed: false, currency: "NGN",
                opens: "09:00", closes: "18:00" };
          s.techs.push(t); u.tech_id = t.id; u.is_tech = true;
        }
        Object.assign(t, { business_name: o.name, address: o.address, area: o.area,
                           lat: o.lat, lng: o.lng, years: o.years });
        save(); return await MOCK.me();
      },
      /* The practice version keeps a score for the phone it is on and calls
         the board what it is. It does NOT invent rivals: a fake leaderboard
         with invented names is the one thing on this screen that would still
         look true after somebody screenshotted it. */
      /* Practice mode has no account to delete, and saying "done" would be a
         lie that looks identical to the real thing. It reports the one honest
         blocker instead: there is nothing here to delete. */
      accountBlockers: async () => ({ bookings_in_escrow: 0, jobs_in_escrow: 0,
        disputes: 0, wallet_kobo: 0, payouts_pending: 0 }),
      deleteAccount: async () => {
        fail("Practice mode has no account. Switch to the real Oma in Settings first.");
      },

      myPoints: async () => {
        const s = load(); s.opoints = s.opoints || { code: null, used: false, milli: 0 };
        return { season: "Practice season", ends_at: null,
                 role: myTech() ? "tech" : "customer",
                 points: +(s.opoints.milli / 1000).toFixed(2), place: null,
                 code: s.opoints.code, used_code: s.opoints.used, can_use_code: !s.opoints.used, referrals: 0,
                 per_point: 700000, pair_cap: 10,
                 tech_prize_kobo: 0, customer_prize_kobo: 0,
                 next_season: null, next_starts_at: null, lines: [] };
      },
      leaderboard: async () => [],
      myReferralCode: async () => {
        const s = load(); s.opoints = s.opoints || { code: null, used: false, milli: 0 };
        if (!s.opoints.code) { s.opoints.code = "PRACTICE"; save(); }
        return s.opoints.code;
      },
      useReferral: async () => {
        throw new Error("Codes only count on the real Oma. Turn off practice mode in Settings.");
      },
      addService: async (name, mins, kobo, shapes) => {
        const s = load(), t = myTech();
        if (!t) fail("set up your tech profile first");
        const row = { id: uid(), tech_id: t.id, name, minutes: mins, price_kobo: kobo,
                      shapes: shapes || [], active: true };
        s.services.push(row); save(); return row;
      },
      setListed: async (on) => {
        const t = myTech();
        if (!t) fail("you do not have a tech profile yet");
        if (on && t.kyc !== "verified") fail("your NIN check has to pass before you can be listed");
        if (on && (t.lat == null)) fail("set where you work before listing, so clients can find you");
        t.listed = on; save(); return await MOCK.me();
      },
      verifyNin: async (vnin) => {
        const t = myTech();
        if (!t) fail("set up your tech profile first");
        const n = String(vnin).replace(/\D/g, "");
        if (n.length !== 11 && n.length !== 16) fail("that does not look like a NIN (11 digits) or a vNIN (16 digits)");
        // The demo passes anything well-formed. The real one asks NIMC.
        t.kyc = "verified"; save();
        return { status: "verified", name_match: true, mock: true };
      },
      scan: async (code) => {
        const s = load();
        const id = String(code).split(".")[0];
        const b = s.bookings.find((x) => x.id === id);
        if (!b || longCode(id) !== String(code).trim()) fail("that code is not valid");
        return release(b);
      },
      scanShort: async (id, typed) => {
        const s = load(), b = s.bookings.find((x) => x.id === id);
        if (!b) fail("no such appointment");
        const key = "a" + id;
        const tries = (s.attempts[key] || []).filter((t) => t > Date.now() - 3600000);
        s.attempts[key] = tries;
        if (tries.length >= 5) {
          save();
          return { ok: false, reason: "locked",
                   message: "too many wrong codes for this appointment — try again in an hour, or scan the QR instead" };
        }
        if (String(typed).replace(/\D/g, "") !== shortCode(id)) {
          tries.push(Date.now()); save();
          return { ok: false, reason: "wrong", message: "that code does not match",
                   attempts_left: 4 - tries.length + 1 };
        }
        save();
        return { ok: true, ...release(b) };
      },
      /* ── reviews ──────────────────────────────────────────────
         The same rule the database enforces, enforced here too, so the
         screens behave identically against the mock: only the customer, only
         on a released appointment, one review per appointment. A mock that is
         more permissive than the server teaches the UI to do things the
         server will refuse. */
      leaveReview: async (bookingId, stars, words) => {
        const s = load();
        if (!(stars >= 1 && stars <= 5)) fail("a review is one to five stars");
        const b = s.bookings.find((x) => x.id === bookingId);
        if (!b) fail("no such appointment");
        if (b.status !== "released") {
          fail("you can review an appointment once it has been completed");
        }
        const w = (words || "").trim() || null;
        if (w && w.length > 600) fail("that review is too long");
        const had = s.reviews.find((r) => r.booking_id === bookingId);
        if (had) {
          had.stars = stars; had.words = w; had.edited_at = new Date().toISOString();
        } else {
          s.reviews.push({ booking_id: bookingId, tech_id: b.tech_id,
                           customer_id: (s.user && s.user.id) || "me",
                           stars, words: w, created_at: new Date().toISOString(),
                           edited_at: null });
        }
        save();
        return s.reviews.find((r) => r.booking_id === bookingId);
      },
      myReview: async (bookingId) =>
        load().reviews.find((r) => r.booking_id === bookingId) || null,
      reviewable: async () => {
        const s = load();
        return s.bookings
          .filter((b) => b.status === "released" &&
                         !s.reviews.some((r) => r.booking_id === b.id))
          .map((b) => ({ booking_id: b.id, tech_id: b.tech_id,
                         business_name: (s.techs.find((t) => t.id === b.tech_id) || {}).business_name,
                         // Stored bookings keep a millisecond stamp; shape()
                         // is what turns it into the ISO string the app sees.
                         starts_at: new Date(b.starts_at_ms).toISOString() }));
      },
      ratings: async (ids) => {
        const s = load(), want = ids || [];
        const out = [];
        want.forEach((id) => {
          const mine = s.reviews.filter((r) => r.tech_id === id);
          // No row rather than a zero, exactly as the SQL does — "not rated
          // yet" and "rated zero" must not look the same to a screen.
          if (!mine.length) return;
          const avg = mine.reduce((a, r) => a + r.stars, 0) / mine.length;
          out.push({ tech_id: id, stars: Math.round(avg * 10) / 10, reviews: mine.length });
        });
        return out;
      },
      techReviews: async (techId) => {
        const s = load();
        const who = (id) => {
          const n = ((id === ((s.user && s.user.id) || "me")
                       ? (s.user && s.user.full_name) : null) || "").trim();
          if (!n) return "Someone";
          const p = n.split(/\s+/);
          return p.length < 2 ? p[0] : p[0] + " " + p[1][0] + ".";
        };
        return s.reviews.filter((r) => r.tech_id === techId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .map((r) => ({ stars: r.stars, words: r.words,
                         who: who(r.customer_id), created_at: r.created_at }));
      },

      /* Her record of what she was actually paid, appointment by appointment,
         with the deductions set out. Mirrors api_earnings in fee.sql. */
      earnings: async (limit) => {
        const s = load();
        return (s.fees || [])
          .slice()
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, limit || 30)
          .map((f) => {
            // Paystack IS on the full amount — that is what the card was
            // charged. Oma is on the base. The two really are different.
            const ps = paystackFeeKobo(f.total_kobo);
            const base = f.base_kobo == null ? f.total_kobo : f.base_kobo;
            return { booking_id: f.booking_id, paid_at: f.created_at,
                     total_kobo: f.total_kobo, base_kobo: base,
                     travel_kobo: f.total_kobo - base,
                     oma_kobo: f.fee_kobo, paystack_kobo: ps,
                     net_kobo: f.total_kobo - f.fee_kobo - ps };
          });
      },

      wallet: async () => {
        const s = load(), t = myTech();
        return {
          held: bal("held"), available: bal("available"),
          recent: !t ? [] : s.ledger.filter((l) => l.tech_id === t.id)
            .sort((a, b) => b.at - a.at).slice(0, 50)
            .map((l) => ({ at: new Date(l.at).toISOString(), bucket: l.bucket,
                           delta_kobo: l.delta_kobo, kind: l.kind })),
        };
      },
      requestPayout: async (kobo) => {
        const s = load(), t = myTech();
        if (!t) fail("you do not have a tech profile yet");
        if (kobo <= 0) fail("nothing to pay out");
        if (bal("available") < kobo) {
          fail(`only ₦${(bal("available") / 100).toLocaleString()} is available; ` +
               `₦${(bal("held") / 100).toLocaleString()} is still held against appointments that have not been scanned`);
        }
        s.ledger.push({ tech_id: t.id, bucket: "available", delta_kobo: -kobo,
                        kind: "payout", at: Date.now() });
        save(); return { amount_kobo: kobo, status: "requested" };
      },
    };

    function release(b) {
      const s = load();
      if (b.status === "released") fail("that code has already been used");
      if (b.status !== "paid") fail(`booking is ${b.status} and cannot be released`);
      b.status = "released";
      s.ledger.push({ tech_id: b.tech_id, booking_id: b.id, bucket: "held",
                      delta_kobo: -b.total_kobo, kind: "release_out", at: Date.now() });
      s.ledger.push({ tech_id: b.tech_id, booking_id: b.id, bucket: "available",
                      delta_kobo: b.total_kobo, kind: "release_in", at: Date.now() });
      // Oma's fee, charged at the scan exactly as the trigger in fee.sql
      // charges it. A mock that released the whole amount would show a tech a
      // balance the real system will never pay her.
      // On the SERVICES, not the sale: a home visit's call-out and fare are
      // the tech's time and petrol, and charging a percentage of those is
      // what this whole design avoids. Same rule as booking_base_kobo().
      const base = MOCK.baseKobo(b);
      const fee = omaFeeKobo(base);
      if (fee > 0) {
        s.fees = s.fees || [];
        if (!s.fees.some((f) => f.booking_id === b.id)) {
          s.fees.push({ booking_id: b.id, tech_id: b.tech_id,
                        total_kobo: b.total_kobo, base_kobo: base, fee_kobo: fee,
                        created_at: new Date().toISOString() });
          s.ledger.push({ tech_id: b.tech_id, booking_id: b.id, bucket: "available",
                          delta_kobo: -fee, kind: "oma_fee", at: Date.now() });
        }
      }
      save();
      return { booking: shape(b), released_kobo: b.total_kobo,
               customer_name: (s.user || {}).full_name || "your client" };
    }
  })();

  return A;
})();

if (typeof module !== "undefined") module.exports = API;
