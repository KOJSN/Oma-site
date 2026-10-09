/* ══ the marketplace screens ═════════════════════════════
   Signing in, finding a tech, paying into a thirty-minute account, the code
   she shows, the code the tech scans, the wallet, and the NIN check.

   Everything here goes through API, which is either Supabase or the local
   stand-in depending on whether a project has been configured. That is the
   whole reason these screens can exist today: the stand-in enforces the same
   rules, so nothing built here needs rewriting when the real one arrives.

   The views are ASYNC — they wait on a network — and paint() is not. So each
   one returns its frame immediately with a placeholder, and a loader fills the
   placeholder in afterwards. A screen that renders nothing until data arrives
   feels broken on a slow Lagos connection; one that renders its own shape
   first feels like it is working.                                          */

/* ── the async host ───────────────────────────────────── */
let LOADER = null;          // what to run after the next paint
let TICKER = null;          // the one countdown, cleared on every navigation

function host(inner) {
  return `<div id="ahost">${inner || spinner()}</div>`;
}
function spinner(label) {
  return `<div class="pad" style="text-align:center;padding-top:40px">
    <div class="spin" aria-hidden="true"></div>
    <div class="tiny sub mt12">${esc(label || "One moment")}</div></div>`;
}
/* Which painted screen we are on, and which one the running loader belongs to.
   Every screen here is async, so a loader can finish AFTER the person has
   navigated away — and then paint its contents into the host of whatever
   screen she is looking at now. vHomeLive made that visible: it waits up to
   six seconds for Leaflet, and a tech who opened her identity check in that
   window got the home screen dropped on top of it. Any slow request does the
   same thing; this closes it for all of them at once. */
let VIEWN = 0, LOADFOR = -1;

function fillHost(html) {
  if (LOADFOR !== VIEWN) return;      // she has left; do not paint over her
  const h = document.getElementById("ahost");
  if (h) h.innerHTML = html;
}
/* Kamsy, 27 Sep 2026: "when its offline or needs sign in it shows something
   like api_wallet — i want it to show offline or sign in depending on
   situation". Two specific causes were both landing here as a raw Postgres
   or fetch message:
     - offline: fetch() itself never got a response. That always throws a
       native TypeError, which is the one kind of error here that never
       carries a .status — every error call() throws does, because it only
       throws after reading a real HTTP response.
     - not signed in: call() reached Supabase and got refused — 401/403, or
       Postgres's "permission denied for function api_wallet" when the anon
       role has no grant on a function only a signed-in user may call. Real,
       but not something to show verbatim; API.signedIn() confirms it is
       actually a sign-in problem and not some other 403. */
function hostError(e) {
  const msg = (e && e.message) || String(e);
  const offline = !!(e && e.name === "TypeError" && e.status === undefined);
  const needsAuth = !offline && !API.signedIn() &&
    ((e && (e.status === 401 || e.status === 403)) || /permission denied/i.test(msg));

  if (offline) {
    return fillHost(`<div class="pad"><div class="note warn">
      <span style="flex:none">${I.warn ? I.warn(16) : "!"}</span>
      <div>You're offline. Check your connection and try again.</div></div>
      <button class="btn ghost mt16" data-a="reload">Try again</button></div>`);
  }
  if (needsAuth) {
    return fillHost(`<div class="pad"><div class="note warn">
      <span style="flex:none">${I.warn ? I.warn(16) : "!"}</span>
      <div>Sign in to see this.</div></div>
      <button class="btn mt16" data-a="goto-signin">Sign in</button></div>`);
  }
  fillHost(`<div class="pad"><div class="note warn">
    <span style="flex:none">${I.warn ? I.warn(16) : "!"}</span>
    <div>${esc(msg)}</div></div>
    <button class="btn ghost mt16" data-a="reload">Try again</button></div>`);
}
/** Wrap a loader so a thrown error lands on the screen instead of the console. */
function load(fn) {
  LOADER = () => Promise.resolve().then(fn).catch(hostError);
}
function afterPaint() {
  VIEWN++;
  if (TICKER) { clearInterval(TICKER); TICKER = null; }
  const f = LOADER; LOADER = null;
  if (f) { LOADFOR = VIEWN; f(); }
}

const kobo = (k) => "₦" + (Number(k || 0) / 100).toLocaleString("en-NG");
/* What Oma charges on top of the appointment price, once per booking: ₦75. It
   is Oma's, never the nail tech's. pay-init adds it to the charge and reports
   it back as fee_kobo; this copy is only for showing it before she pays. */
const BOOKING_FEE_KOBO = 7500;

/* ── 20 sign in ───────────────────────────────────────── */
/* mode: null until she picks a door, then "up" (new account) or "in".

   Under the surface these are the SAME thing — an email, a six-digit code, and
   Supabase makes the account if there is not one. One button would work, and
   it is what was built first.

   It is still wrong. Somebody arriving at a screen that says only "Sign in"
   with no account does not think "I expect this will register me"; she thinks
   she is in the wrong place and leaves. Two doors cost one tap and remove that
   doubt. Nothing here pretends the mechanism differs — the words change, the
   code path does not. */
/* sent: false | "confirm" (account made, waiting on the six-digit code from
   the confirmation email) | "reset" (waiting on the six-digit code from the
   password-reset email). reset: true once that code has verified and she is
   choosing the new password. Both codes, no links anywhere. */
/* known: she tried to create an account with an address that already has one.
   A toast said so and then vanished after three seconds, which is the wrong
   lifetime for the one fact that explains why the screen just changed under
   her. It stays on the screen until she goes somewhere else. */
let SIGNIN = { email: "", sent: false, mode: null, reset: false, known: false };

/* ── the eye on a password box ───────────────────────────────────────────
   Kamsy, 5 Oct 2026: "when creating or sign in keep the eye icon for them to
   see what they are typing". A phone keyboard makes typing a password blind
   a common cause of a wrong one, and a wrong one when CREATING an account is
   worse: the account exists and nobody knows what it is.

   The button is NOT data-a. Every data-a click runs through the shell handler
   and most of those end in paint(), which would rebuild the screen and wipe
   what she has typed — the very text she wanted to look at. This one flips the
   input's type in place and nothing else moves. It is also type="button" so
   it can never submit anything, and it keeps the cursor where it was. */
const EYE_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

function passBox(id, attrs) {
  return `<div class="pwbox">
    <input id="${id}" type="password" ${attrs}>
    <button type="button" class="pweye" data-eye="${id}" aria-pressed="false"
            aria-label="Show password" title="Show password">${EYE_ON}</button>
  </div>`;
}

(function () {
  // Pressing the eye must not take the cursor out of the box (on a phone that
  // would also close the keyboard), so the press itself is not allowed to move focus.
  document.addEventListener("mousedown", e => {
    if (e.target.closest && e.target.closest("[data-eye]")) e.preventDefault();
  });
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-eye]");
    if (!b) return;
    const i = document.getElementById(b.dataset.eye);
    if (!i) return;
    const show = i.type === "password";
    i.type = show ? "text" : "password";
    b.setAttribute("aria-pressed", show ? "true" : "false");
    b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    b.setAttribute("title", show ? "Hide password" : "Show password");
    b.innerHTML = show ? EYE_OFF : EYE_ON;
  });
})();

function vSignIn() {
  const s = SIGNIN;
  const up = s.mode === "up";
  const title = s.reset ? "Set a new password"
              : !s.mode ? "Your account"
              : up ? "Create an account" : "Sign in";
  return `
  ${head(title, "So your bookings follow you, not this device")}
  <div class="pad stack gap12">
    ${API.isMock() ? `<div class="note">
      <div>No backend is configured, so this is the practice version. Any
      email and password will let you in and nothing is sent.</div></div>` : ""}

    ${s.reset ? `
      <div class="note"><div>Pick a password and you are back in. After this,
        signing in needs no email at all.</div></div>
      <label class="fld">
        <span class="lbl">New password</span>
        ${passBox("fPass1", 'autocomplete="new-password" placeholder="At least 8 characters"')}
      </label>
      <button class="btn" data-a="pass-set">Save it and continue</button>

    ` : s.sent === "confirm" ? `
      <!-- A code, typed here, rather than a link tapped in a mail app that
           would have opened a different browser and signed her in somewhere
           she is not looking. Until she types it there is no account she can
           use — the session only exists on the other side of this box. -->
      <div class="note"><div>We sent a six-digit code to <b>${esc(s.email)}</b>.
        Type it in below to finish creating your account. It can take a
        minute, and it may land in spam.${API.isMock()
          ? " In the practice version any six digits will do." : ""}</div></div>
      <label class="fld">
        <span class="lbl">The code from your email</span>
        <!-- one-time-code is what makes a phone offer the code from the
             notification, so the common case is one tap and no typing. -->
        <input id="fSignCode" inputmode="numeric" autocomplete="one-time-code"
               maxlength="7" placeholder="123456"
               style="letter-spacing:.34em;font-size:20px;font-weight:800;text-align:center">
      </label>
      <button class="btn" data-a="signup-confirm">Confirm my email</button>
      <button class="btn ghost sm" data-a="signup-resend">Send me a new code</button>
      <button class="btn ghost sm" data-a="signin-mode" data-v="up">Use a different email</button>

    ` : s.sent === "reset" ? `
      <!-- A reset used to be a link. It opened in whatever browser the mail
           app preferred, signed her in there, and left this window saying
           "we sent you a link" with nothing to do. Same six digits as the
           signup code, typed in the window she is already looking at. -->
      <div class="note"><div>We sent a six-digit code to <b>${esc(s.email)}</b>.
        Type it in and you can pick a new password. It can take a minute, and
        it may land in spam.${API.isMock()
          ? " In the practice version any six digits will do." : ""}</div></div>
      <label class="fld">
        <span class="lbl">The code from your email</span>
        <input id="fResetCode" inputmode="numeric" autocomplete="one-time-code"
               maxlength="7" placeholder="123456"
               style="letter-spacing:.34em;font-size:20px;font-weight:800;text-align:center">
      </label>
      <button class="btn" data-a="reset-confirm">Continue</button>
      <button class="btn ghost sm" data-a="reset-resend">Send me a new code</button>
      <button class="btn ghost sm" data-a="signin-mode" data-v="in">Back to sign in</button>

    ` : !s.mode ? `
      <button class="btn" data-a="signin-mode" data-v="up">Create an account</button>
      <button class="btn ghost" data-a="signin-mode" data-v="in">I already have one</button>
      <div class="tiny sub" style="text-align:center;line-height:1.55;margin-top:4px">
        Your email and a password. We only email you to confirm the address,
        and if you ever forget it.</div>

    ` : `
      ${s.known && !up ? `<div class="note warn">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--warn)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.1"/></svg>
        <div><b>${esc(s.email)} already has an Oma account.</b> Sign in below
          instead — or if you cannot remember the password, use the link under
          the box and we will send you a code.</div></div>` : ""}
      <label class="fld">
        <span class="lbl">Email address</span>
        <input id="fSignEmail" type="email" inputmode="email" autocomplete="email"
               autocapitalize="none" spellcheck="false"
               placeholder="you@example.com" value="${esc(s.email)}">
      </label>
      <!-- The password box and its "forgot" link are ONE child of the stack,
           so the link sits against the bottom-right corner of the box instead
           of twelve pixels below it looking like a third thing to decide
           between. It was a full-width ghost button, which gave a rescue hatch
           the same weight as "Sign in" — three big stacked buttons and no
           obvious primary one. A link is the right size for a thing you only
           want when something has gone wrong. -->
      <div>
        <label class="fld">
          <span class="lbl">Password</span>
          ${passBox("fSignPass", `autocomplete="${up ? "new-password" : "current-password"}"
                 placeholder="${up ? "At least 8 characters" : ""}"`)}
        </label>
        ${up ? "" : `<div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="lnk" style="margin-left:0;font-size:12.5px"
                  data-a="pw-forgot">I forgot my password</button></div>`}
      </div>
      <button class="btn" data-a="${up ? "pw-signup" : "pw-signin"}">${
        up ? "Create my account" : "Sign in"}</button>
      <button class="btn ghost sm" data-a="signin-mode" data-v="${up ? "in" : "up"}">${
        up ? "I already have an account" : "I need to create one"}</button>
    `}
  </div>`;
}

/* ── 21 nail techs nearby ─────────────────────────────── */
/* One row for a listed tech, shared by Home's short list and the full Salons
   list — so the two screens cannot drift into looking like different products.
   Distance comes from the database, which computed it; the app never guesses. */
/* A tech is only reachable through a query that filters on tech.listed, and
   the tech table carries `constraint listed_needs_kyc check (not listed or
   kyc = 'verified')`. tech.kyc is written by one thing only — the kyc edge
   function, with the service key, after a NIMC-licensed provider returns
   VERIFIED and the name on the ID matches the name on the Oma profile. So
   anybody a customer can see has passed it, and this badge cannot get out of
   step with the truth without the constraint being dropped first. */
function verifiedBadge(big) {
  return `<span class="vb${big ? " lg" : ""}" title="NIN checked against NIMC">${
    I.seal(big ? 13 : 12)} NIN verified</span>`;
}

function techRowLive(t) {
  return `
  <button class="card row" data-a="tech-open" data-id="${esc(t.id)}">
    <div class="avatar sq">${esc(initials(t.business_name))}</div>
    <div style="flex:1;min-width:0;text-align:left">
      <div class="ttl">${esc(t.business_name)}${verifiedBadge()}</div>
      <div class="tiny sub">${esc(t.area || "")}${t.years ? ` · ${t.years} yrs` : ""}</div>
      <div class="tiny" style="margin-top:6px">
        <b>${t.km < 1 ? Math.round(t.km * 1000) + " m" : t.km.toFixed(1) + " km"}</b> away
        ${t.from_kobo ? ` · from ${kobo(t.from_kobo)}` : ""}</div>
    </div>
    ${I.chev()}
  </button>`;
}

function vNearby() {
  load(async () => {
    let pos = null;
    try {
      pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 300000 }));
    } catch { /* she said no, or the browser could not tell. Fall back below. */ }

    // Lagos Island, so the screen is never empty just because location failed.
    const lat = pos ? pos.coords.latitude : 6.4478;
    const lng = pos ? pos.coords.longitude : 3.4723;

    const list = await API.nearby(lat, lng, 15);
    if (!list.length) {
      return fillHost(`<div class="pad"><div class="note">
        <div>No nail techs have listed themselves near you yet.</div></div></div>`);
    }
    fillHost(`
      ${!pos ? `<div class="pad" style="padding-bottom:0"><div class="note tiny">
        <div>Showing Lagos Island — turn on location for techs near you.</div></div></div>` : ""}
      <div class="pad stack gap12">
        ${list.map(techRowLive).join("")}
      </div>`);
  });
  return head("Nail techs nearby", "Closest first") + host();
}

/* ── 22 one tech, and her services ────────────────────── */
let PICKED = { techId: null, name: "", ids: [], at: null, terms: null, mins: 0, busy: [], hours: null };

function vTechLive(id) {
  load(async () => {
    // The reviews are asked for beside the services rather than after them:
    // this is the screen where somebody decides whether to book, so the score
    // should arrive with the prices, not a beat later.
    const [list, revs, rate, terms] = await Promise.all([
      API.services(id),
      API.techReviews(id, 8).catch(() => []),
      API.ratings([id]).catch(() => []),
      // Whether she travels. Asked here so the next screen can offer "she
      // comes to me" only when it is a real option.
      API.homeTerms(id).catch(() => null),
    ]);
    const r = (rate || []).find((x) => x.tech_id === id);
    PICKED = { techId: id, name: PICKED.name, ids: [], at: null, terms, mins: 0, busy: [], hours: null };
    resetHome();
    fillHost(`
      <div class="pad stack gap12">
        <div class="rowbetween">
          <div class="tiny sub">Choose what you want done.</div>
          <div>${ratingLine(r)}</div>
        </div>
        <!-- The photograph IS the card. Filled in after the paint, because
             the pictures come from a second call — until they arrive the card
             is the Oma gradient, which is what a service with no photographs
             stays as. Same shape either way: mixing tall photo cards with
             small text rows down one page reads as neither. -->
        ${list.map((s) => `
          <label class="svccard" data-svc="${esc(s.id)}">
            <input type="checkbox" class="svc" value="${esc(s.id)}"
                   data-mins="${s.minutes}" data-kobo="${s.price_kobo}">
            <div data-shotslot="${esc(s.id)}"></div>
            <div class="svcfoot">
              <div class="top">
                <h3>${esc(s.name)}</h3>
                <span class="pricepill">${kobo(s.price_kobo)}</span>
              </div>
              <div class="sub">${mins(s.minutes)}</div>
              ${(s.shapes || []).length ? `<div class="svcchips">${
                (s.shapes || []).slice(0, 4).map((x) => `<i>${esc(x)}</i>`).join("")
              }</div>` : ""}
              <span class="pickbtn">Choose this</span>
            </div>
          </label>`).join("")}
        <div id="svcTotal" class="tiny sub" style="text-align:right"></div>
        <button class="btn" data-a="pick-time" disabled id="toTime">Choose a time</button>
        ${reviewsBlock(revs, r)}
      </div>`);
    wireServicePicker();
    fillTechPhotos(id);
  });
  return head(PICKED.name || "Services", "Prices are hers, not ours")
    + `<div class="pad" style="margin-top:-4px;margin-bottom:12px">
         <div class="note">
           <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10"/></svg>
           <div><b>NIN verified.</b> Oma checked this tech's identity against
             NIMC before her listing could appear. Her prices and hours are
             still her own.</div>
         </div>
       </div>`
    + host();
}

function wireServicePicker() {
  const boxes = [...document.querySelectorAll(".svc")];
  const total = document.getElementById("svcTotal");
  const go = document.getElementById("toTime");
  const update = () => {
    const on = boxes.filter((b) => b.checked);
    /* The chosen state was styled and never switched on. p1_head has
       .svccard.on — a pink ring — and .svccard.on .pickbtn — the button
       filled pink — and nothing in here ever added the class. So choosing a
       service changed a total at the bottom of the page and the card looked
       exactly as it had a moment before, which is no feedback at all on a
       screen whose whole job is "pick these ones". */
    boxes.forEach((b) => {
      const card = b.closest(".svccard");
      if (!card) return;
      card.classList.toggle("on", b.checked);
      const btn = card.querySelector(".pickbtn");
      if (btn) btn.textContent = b.checked ? "Chosen" : "Choose this";
    });
    PICKED.ids = on.map((b) => b.value);
    const k = on.reduce((a, b) => a + Number(b.dataset.kobo), 0);
    const m = on.reduce((a, b) => a + Number(b.dataset.mins), 0);
    // How long this appointment actually runs — the "Pick a time" screen
    // needs this to grey out a slot that would run into a booking this tech
    // already has, not just the exact minute someone else already took.
    PICKED.mins = m;
    total.textContent = on.length ? `${kobo(k)} + ${kobo(BOOKING_FEE_KOBO)} booking fee (not refundable) · about ${mins(m)}` : "";
    go.disabled = !on.length;
  };
  boxes.forEach((b) => b.addEventListener("change", update));
  update();
}

/* ── 23 a time ────────────────────────────────────────── */
//
// Kamsy, 20 Sep 2026: "if an appointment takes more than an hour, let
// nobody be able to book the instant hour after the time booked." The
// database (no-overlap.sql) already refuses a booking that runs into one
// this tech already has, for anyone who tries. What this adds is showing
// that BEFORE she taps a slot, not after: a slot she could never actually
// get is greyed out here rather than looking free and then bouncing her
// with an error once she has already picked it.
//
// PICKED.busy holds whatever API.techBusy() last returned for this tech —
// {starts_at, minutes} for everything still on her calendar (awaiting
// payment, paid, or released — the same three statuses the database
// itself treats as "this time is spoken for"). Fetched once when this
// screen opens; re-checked for real at the moment of booking regardless,
// same as always, because a slot can be taken by someone else between
// opening this screen and tapping "confirm".
function busyOverlaps(candidateStartMs, candidateMins, busy) {
  const cEnd = candidateStartMs + Math.max(1, candidateMins || 60) * 60000;
  return (busy || []).some((w) => {
    const wStart = new Date(w.starts_at).getTime();
    const wEnd = wStart + Math.max(1, w.minutes || 0) * 60000;
    return candidateStartMs < wEnd && cEnd > wStart;
  });
}

// Kamsy, 30 Sep 2026: techs now have working hours, and clients can only
// book inside them. PICKED.hours is what API.techHours() returned:
// [{dow, opens_min, closes_min}] for each day she works (dow 0 = Sunday).
// Empty or missing means she has not set hours yet (an older listing), and the
// screen falls back to the old 09:00-17:00 grid so nobody loses bookings
// overnight. A day she does not work shows no times at all.
function slotStartsFor(dayTs, dur) {
  const hrs = PICKED.hours;
  if (!hrs || !hrs.length) return { open: true, hours: [9, 10, 11, 12, 13, 14, 15, 16, 17] };
  const dow = new Date(dayTs).getDay();
  const w = hrs.find((r) => Number(r.dow) === dow);
  if (!w) return { open: false, hours: [] };
  const out = [];
  // Whole-hour starts, and the appointment must finish by closing time.
  for (let m = Math.ceil(Number(w.opens_min) / 60) * 60; m + dur <= Number(w.closes_min); m += 60) {
    out.push(m / 60);
  }
  return { open: true, hours: out };
}

function slotGridHtml(dayTs) {
  const dur = PICKED.mins || 60;
  const now = Date.now();
  const plan = slotStartsFor(dayTs, dur);
  if (!plan.open) return `<div class="note" style="grid-column:1/-1"><div>She does not work this day. Pick another day.</div></div>`;
  if (!plan.hours.length) return `<div class="note" style="grid-column:1/-1"><div>No time this day is long enough for what you picked. Try another day.</div></div>`;
  return plan.hours.map((h) => {
    const at = new Date(dayTs); at.setHours(h, 0, 0, 0);
    const ts = at.getTime();
    const past = ts < now;
    const busy = !past && busyOverlaps(ts, dur, PICKED.busy);
    const off = past || busy;
    return `<button class="chip${off ? " off" : ""}" data-a="mslot" data-h="${h}"${off ? " disabled" : ""}>${
      String(h).padStart(2, "0")}:00${busy ? " · booked" : ""}</button>`;
  }).join("");
}

/* Redraws just the slot row for whichever day is now selected — called both
   right after the busy list arrives and whenever a day chip is tapped
   (p8_wire.js's "mday"), since a slot free on Tuesday can be exactly the
   one that is not free on Wednesday. */
function paintSlotGrid(dayTs) {
  const el = document.getElementById("slotGrid");
  if (el) el.innerHTML = slotGridHtml(dayTs);
}

function vTimeLive() {
  const days = [];
  for (let d = 1; d <= 7; d++) {
    const t = new Date(); t.setDate(t.getDate() + d); t.setHours(0, 0, 0, 0);
    days.push(t);
  }
  load(async () => {
    try { PICKED.busy = await API.techBusy(PICKED.techId); }
    catch (e) { PICKED.busy = []; }    // still bookable — just unable to grey anything out this time
    try { PICKED.hours = await API.techHours(PICKED.techId); }
    catch (e) { PICKED.hours = null; } // older database, or no answer: the old grid
    paintSlotGrid(days[0].getTime());
  });
  return `
  ${head("Pick a time", PICKED.name)}
  <div class="pad">
    ${homeBlock(PICKED.terms)}
    <div class="chips" id="dayChips">
      ${days.map((d, i) => `<button class="chip${i === 0 ? " on" : ""}" data-a="mday"
         data-ts="${d.getTime()}">${dayLabel(d.getTime())}</button>`).join("")}
    </div>
    <div class="grid3 mt16" id="slotGrid">${slotGridHtml(days[0].getTime())}</div>
    <div class="note mt16"><div>You will have <b>30 minutes</b> to pay into an
      account we show you next. The slot is held for you until then. A
      <b>${kobo(BOOKING_FEE_KOBO)} booking fee</b> is added at checkout. It is not refundable.</div></div>
  </div>`;
}

/* ── 24 pay ───────────────────────────────────────────── */
function vPay(bookingId) {
  load(async () => {
    let pay;
    try {
      pay = await API.payInit(bookingId);
    } catch (e) {
      return fillHost(`<div class="pad"><div class="note warn"><div>${esc(e.message)}</div></div>
        <button class="btn mt16" data-a="go" data-v="nearby">Book again</button></div>`);
    }

    fillHost(`
      <div class="pad stack gap12">
        <div class="ticket"><div style="padding:18px" class="stack gap12">
          <div class="tiny sub">Transfer exactly this amount</div>
          <div style="font-size:30px;font-weight:800;letter-spacing:-.03em">${kobo(pay.amount_kobo)}</div>
          ${Number(pay.fee_kobo) > 0 ? `
          <div class="kv"><span class="k">Appointment</span><span class="v">${kobo(Number(pay.amount_kobo) - Number(pay.fee_kobo))}</span></div>
          <div class="kv"><span class="k">Booking fee (not refundable)</span><span class="v">${kobo(pay.fee_kobo)}</span></div>` : ""}
          <div class="kv"><span class="k">Bank</span><span class="v">${esc(pay.bank || "")}</span></div>
          <div class="kv"><span class="k">Account number</span>
            <span class="v" style="font-size:20px;letter-spacing:.06em">${esc(pay.account_number)}</span></div>
          <div class="kv"><span class="k">Account name</span><span class="v">${esc(pay.account_name || "")}</span></div>
          <button class="btn ghost sm" data-a="copy-acct"
                  data-v="${esc(pay.account_number)}">Copy account number</button>
        </div></div>

        <div class="note pink" id="payClock"><div></div></div>

        <div class="tiny sub">The account closes when the clock runs out, and the
          slot goes back to whoever wants it. Nothing is charged to a card and
          nobody is holding your money but the bank.</div>

        ${API.isMock() ? `<button class="btn" data-a="pretend" data-id="${esc(bookingId)}">
          Pretend the transfer landed</button>
          <div class="tiny sub" style="text-align:center">Practice version only —
            with a real account this happens by itself.</div>` : `
          <button class="btn ghost" data-a="check-paid" data-id="${esc(bookingId)}">
            I have sent it</button>`}
      </div>`);

    const ends = new Date(pay.expires_at).getTime();
    const tick = () => {
      const el = document.querySelector("#payClock div");
      if (!el) return;
      const left = ends - Date.now();
      if (left <= 0) {
        el.innerHTML = "<b>Time is up.</b> That account is closed — book the slot again.";
        clearInterval(TICKER); TICKER = null;
        return;
      }
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      el.innerHTML = `<b>${m}:${String(s).padStart(2, "0")}</b> left to pay`;
    };
    tick();
    TICKER = setInterval(tick, 1000);
  });
  return head("Pay the tech", "A 30-minute account, just for this booking") + host();
}

/* ── 25 the code she shows ────────────────────────────── */
function vTicket(bookingId) {
  load(async () => {
    const all = await API.bookings(true);
    const b = all.find((x) => x.id === bookingId);
    if (!b) return fillHost(`<div class="pad"><div class="note"><div>That appointment is gone.</div></div></div>`);

    if (b.status !== "paid") {
      return fillHost(`
        <div class="pad stack gap12">
          ${ticketFace(b)}
          <div class="note"><div>${b.status === "released"
            ? "Done — the tech has scanned this and been paid."
            : `This appointment is <b>${esc(b.status.replace("_", " "))}</b>.`}</div></div>
          ${b.status === "awaiting_payment"
            ? `<button class="btn" data-a="go-pay" data-id="${esc(b.id)}">Pay now</button>` : ""}
        </div>`);
    }

    const c = await API.codes(b.id);
    fillHost(`
      <div class="pad stack gap12">
        ${ticketFace(b)}
        <div id="placeSlot"></div>
        <div class="ticket" style="text-align:center">
          <div style="padding:20px" class="stack gap12">
            <div class="tiny sub">Show this when she has finished</div>
            <div style="display:flex;justify-content:center">${QR.svg(c.code, { size: 232 })}</div>
            <div class="tiny sub" style="margin-top:4px">or read her these six digits</div>
            <div style="font-size:34px;font-weight:800;letter-spacing:.14em">${esc(c.short_code)}</div>
          </div>
        </div>
        <div class="note pink"><div><b>Do not show this before she has done your
          nails.</b> Scanning it is what pays her, and it only works once.</div></div>
      </div>`);
    fillPlace(b.id);
  });
  return head("Your appointment", "The code that pays her") + host();
}

function ticketFace(b) {
  const at = new Date(b.starts_at).getTime();
  return `<div class="ticket"><div style="padding:18px" class="stack gap12">
    <div class="kv"><span class="k">Tech</span><span class="v">${esc(b.tech.business_name)}</span></div>
    <div class="kv"><span class="k">When</span><span class="v">${dayLabel(at)} · ${hhmm(at)}</span></div>
    <div class="kv"><span class="k">Services</span><span class="v">${
      b.items.map((i) => esc(i.name)).join("<br>")}</span></div>
    ${b.status === "awaiting_payment" ? `
    <div class="kv" style="padding-top:12px;border-top:1px solid var(--line)">
      <span class="k">Appointment</span><span class="v">${kobo(b.total_kobo)}</span></div>
    <div class="kv"><span class="k">Booking fee (not refundable)</span><span class="v">${kobo(BOOKING_FEE_KOBO)}</span></div>
    <div class="kv"><span class="k">To pay</span><span class="v" style="font-size:19px">${kobo(Number(b.total_kobo) + BOOKING_FEE_KOBO)}</span></div>` : `
    <div class="kv" style="padding-top:12px;border-top:1px solid var(--line)">
      <span class="k">Appointment</span><span class="v" style="font-size:19px">${kobo(b.total_kobo)}</span></div>`}
  </div></div>`;
}

/* ── where to go ───────────────────────────────────────────────────────
   Kamsy, 5 Oct 2026: "the customers should see the location of the tech, then
   on the map she would see directions to the tech and know how far she is from
   the tech". And, straight after: "the only time the address shows is from 30
   mins before the appointment".

   So this card has two lives. Before that moment it says only when it opens —
   the server sends no street and no map point at all, so there is nothing here
   to leak. From 30 minutes before, it shows the place on a small map, how far
   she is from it, and a button that hands the trip to her phone's own maps app.

   A tech who has no shop has no address to show. For her the card shows where
   she is right now (the heartbeat she already sends while working), and keeps
   asking every minute so the pin follows her.

   The distance is a straight line, and says so. In Lagos the road can be
   twice that; the maps button is where the real route lives. Road distance and
   travel time in here need a routing service (a key and a bill) — parked, along
   with Google Maps, until Kamsy decides.

   Not a data-a screen: the map and the typed-in-nothing state must survive a
   refresh in place, so refreshes move the pin rather than repaint the card. */
let PLACE = null;   // { id, pl, me, at, mk, meMk, line } for the ticket on screen

function placeAgo(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m === 1 ? "1 minute ago" : m + " minutes ago";
}

function placeDist(m) {
  if (!isFinite(m)) return "";
  return m < 950 ? "about " + Math.max(10, Math.round(m / 10) * 10) + " m"
                 : "about " + (m / 1000).toFixed(1) + " km";
}

function placeDest(pl) {
  if (pl.lat != null && pl.lng != null) return pl.lat + "," + pl.lng;
  if (pl.address) return pl.address + (pl.area ? ", " + pl.area : "");
  return null;
}

/* Hand the trip to the phone's own maps app. No key, no account, nothing
   billed to Oma: these are ordinary links. */
function placeDirectionsUrl(pl) {
  const dest = placeDest(pl);
  if (!dest) return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
           || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios
    ? "https://maps.apple.com/?daddr=" + encodeURIComponent(dest) + "&dirflg=d"
    : "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest)
      + "&travelmode=driving";
}

function placeCard(P) {
  const pl = P.pl;
  const lock = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`;
  const pin = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>`;

  if (!pl.open) {
    const t = pl.opens_at ? new Date(pl.opens_at).getTime() : null;
    const day = t && new Date(t).toDateString() !== new Date().toDateString()
      ? dayLabel(t) + " at " : "";
    return `<div class="card placecard">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="flex:none;margin-top:1px">${lock}</span>
        <div>
          <div style="font-weight:700">Where to go</div>
          <div class="tiny sub" style="margin-top:3px">${t
            ? `Her address opens at <b>${esc(day + hhmm(t))}</b>, 30 minutes before your appointment.`
            : esc(pl.why || "Her address opens 30 minutes before your appointment.")}</div>
        </div>
      </div></div>`;
  }

  const has = pl.lat != null && pl.lng != null;
  const url = placeDirectionsUrl(pl);
  const who = pl.live
    ? `<div style="font-weight:700">${esc(pl.place_name || "Her")} — where she is now</div>
       <div class="tiny sub" id="plAsOf" style="margin-top:2px">${has && pl.as_of
         ? "Updated " + esc(placeAgo(pl.as_of)) : ""}</div>`
    : `<div style="font-weight:700">${esc(pl.place_name || "Her place")}</div>
       <div style="margin-top:2px">${pl.address
         ? esc(pl.address) + (pl.area ? `<span class="sub">, ${esc(pl.area)}</span>` : "")
         : pl.area ? esc(pl.area) : ""}</div>`;

  return `<div class="card placecard">
    <div style="display:flex;gap:10px;align-items:flex-start">
      <span style="flex:none;margin-top:1px">${pin}</span>
      <div style="min-width:0;flex:1"><div class="lbl" style="margin:0 0 3px">Where to go</div>${who}</div>
    </div>
    ${has ? `<div class="tmap" id="plMap" role="img"
        aria-label="Map showing ${esc(pl.place_name || "her")} and where you are"></div>` : ""}
    <div class="tiny sub" id="plDist" style="margin-top:10px">${placeDistLine(P)}</div>
    ${!has && pl.live ? `<div class="note" style="margin-top:10px"><div>${
        esc(pl.why || "She is not sharing her position right now. Try again in a few minutes.")}</div></div>` : ""}
    ${!has && !pl.live && !pl.address ? `<div class="note" style="margin-top:10px"><div>
        Her address is not on file yet. Ask her in Messages.</div></div>` : ""}
    <div class="stack gap8" style="margin-top:12px">
      ${url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Get directions</a>` : ""}
      ${has && !P.me ? `<button class="btn ghost sm" data-a="place-locate">How far am I?</button>` : ""}
    </div>
    ${url ? `<div class="tiny faint" style="margin-top:8px;text-align:center">
      Opens the maps app on your phone.</div>` : ""}
  </div>`;
}

function placeDistLine(P) {
  const pl = P.pl;
  if (pl.lat == null || pl.lng == null) return "";
  if (!P.me) return "Tap <b>How far am I?</b> to see the distance from where you are.";
  const m = metresApart({ lat: P.me.lat, lng: P.me.lng }, { lat: +pl.lat, lng: +pl.lng });
  return `You are ${esc(placeDist(m))} from ${pl.live ? "her" : "here"}, in a straight line. `
       + `The road is longer — <b>Get directions</b> has the real route.`;
}

function placeUpdateText() {
  const P = PLACE; if (!P) return;
  const d = document.getElementById("plDist"); if (d) d.innerHTML = placeDistLine(P);
  const a = document.getElementById("plAsOf");
  if (a && P.pl.as_of) a.textContent = "Updated " + placeAgo(P.pl.as_of);
}

/* Draw (or redraw) the card and its map. */
async function placePaint() {
  const P = PLACE, slot = document.getElementById("placeSlot");
  if (!P || !slot) return;
  stopMap(); P.mk = P.meMk = P.line = null;
  slot.innerHTML = placeCard(P);
  const el = document.getElementById("plMap");
  const pl = P.pl;
  if (!el || pl.lat == null || pl.lng == null) return;

  const Lf = await waitForL(6000);
  if (PLACE !== P || document.getElementById("plMap") !== el) return;   // she moved on
  if (!Lf) {
    el.outerHTML = `<div class="tiny sub" style="margin-top:10px">The map could not load. Get directions still works.</div>`;
    return;
  }
  MAP = Lf.map(el, {
    zoomControl: false, attributionControl: false, scrollWheelZoom: false,
    touchZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false,
    // On a phone a map that takes one-finger drags traps the page: she cannot
    // scroll past it. Desktop can pan; phones get a still picture.
    dragging: !Lf.Browser.mobile,
  });
  Lf.control.attribution({ position: "bottomright" }).addTo(MAP);
  Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, minZoom: 9,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(MAP);

  P.mk = Lf.marker([+pl.lat, +pl.lng], {
    icon: pinIcon({ business_name: pl.place_name, has_salon: !pl.live }, true),
    interactive: false, keyboard: false,
  }).addTo(MAP);

  if (P.me) {
    P.meMk = Lf.marker([P.me.lat, P.me.lng], {
      icon: Lf.divIcon({ className: "", html: '<div class="mepin"></div>',
                         iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false, keyboard: false,
    }).addTo(MAP);
    const pink = (getComputedStyle(document.documentElement).getPropertyValue("--pink") || "").trim() || "#f0518d";
    P.line = Lf.polyline([[P.me.lat, P.me.lng], [+pl.lat, +pl.lng]],
      { color: pink, weight: 3, opacity: .85, dashArray: "6 9", interactive: false }).addTo(MAP);
    MAP.fitBounds([[P.me.lat, P.me.lng], [+pl.lat, +pl.lng]],
      { padding: [46, 46], maxZoom: 16 });
  } else {
    MAP.setView([+pl.lat, +pl.lng], 16);
  }
  setTimeout(() => { if (MAP) MAP.invalidateSize(); }, 250);
}

async function placeMe(ask) {
  const st = await locState();
  if (!ask && st !== "granted") return null;      // never prompt on her behalf
  const p = await whereAmI();
  return p.guessed ? null : p;
}

/* Fetch, and either move the pin where it stands or redraw the card. */
async function placeRefresh() {
  const P = PLACE; if (!P) return;
  let pl;
  try { pl = await API.bookingPlace(P.id); } catch (e) { return; }
  if (PLACE !== P || !pl || !pl.ok || pl.at_home) return;
  const was = P.pl;
  P.pl = pl; P.at = Date.now();
  if (P.me || was.open) { const me = await placeMe(false); if (me && PLACE === P) P.me = me; }
  const inPlace = was.open && pl.open && P.mk && pl.lat != null && pl.lng != null
                  && was.lat != null && was.live === pl.live;
  if (!inPlace) return placePaint();
  P.mk.setLatLng([+pl.lat, +pl.lng]);
  if (P.me) {
    if (P.meMk) P.meMk.setLatLng([P.me.lat, P.me.lng]);
    if (P.line) P.line.setLatLngs([[P.me.lat, P.me.lng], [+pl.lat, +pl.lng]]);
    MAP.fitBounds([[P.me.lat, P.me.lng], [+pl.lat, +pl.lng]], { padding: [46, 46], maxZoom: 16 });
  }
  placeUpdateText();
}

async function fillPlace(bookingId) {
  const slot = document.getElementById("placeSlot");
  if (!slot) return;
  const here = VIEWN;
  let pl;
  try { pl = await API.bookingPlace(bookingId); }
  catch (e) { return; }               // an older server: the ticket works exactly as before
  if (VIEWN !== here || !pl || !pl.ok || pl.at_home) return;
  PLACE = { id: bookingId, pl, me: null, at: Date.now(), mk: null, meMk: null, line: null };
  // If she has already allowed location for Oma, use it; never ask unprompted.
  if (pl.open && pl.lat != null) {
    const me = await placeMe(false);
    if (VIEWN !== here) return;
    if (me) PLACE.me = me;
  }
  await placePaint();
  if (VIEWN !== here) return;
  // One timer for both jobs, and the ticket's own: afterPaint() stops it when
  // she leaves. It opens the card at the 30-minute mark without her doing a
  // thing, and keeps a tech who has no shop on the map.
  TICKER = setInterval(() => {
    const P = PLACE; if (!P) return;
    const pl = P.pl, age = Date.now() - P.at;
    const due = !pl.open
      ? pl.opens_at && Date.now() >= new Date(pl.opens_at).getTime() && age > 8000
      : pl.live && age > 60000;
    if (due) placeRefresh();
  }, 5000);
}

async function placeLocate() {
  const P = PLACE; if (!P) return;
  if (await locState() === "denied") {
    return toast("Location is blocked for Oma. Turn it back on in your browser's "
               + "settings for this site, then try again.");
  }
  toast("Looking for you…");
  const p = await whereAmI();
  if (PLACE !== P) return;
  if (p.guessed) {
    return toast(p.why === "opted_out"
      ? "You turned location off in Oma's settings."
      : "Could not get a fix. Outdoors, or with Wi-Fi on, usually does it.");
  }
  P.me = p;
  placePaint();
}

/* ── 26 the scanner ───────────────────────────────────── */
let CAM = null;

function vScanner() {
  const canScan = "BarcodeDetector" in window;
  load(async () => {
    const list = (await API.bookings(true))
      .filter((b) => b.role === "tech" && b.status === "paid")
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

    fillHost(`
      <div class="pad stack gap12">
        ${canScan ? `
          <div class="camwrap"><video id="camv" playsinline muted></video>
            <div class="camframe"></div></div>
          <div class="tiny sub" style="text-align:center" id="camMsg">
            Point at the code on her screen</div>
          <div class="or"><span>or type it</span></div>
        ` : `<div class="note"><div>This device cannot scan a code from the camera —
             Safari does not offer it. Type the six digits from her screen instead.
             </div></div>`}

        ${!list.length ? `<div class="note"><div>Nothing is waiting to be scanned.
          A code appears here once a client has paid.</div></div>` : `
          <label class="fld"><span class="lbl">Which appointment</span>
            <select id="fWhich">
              ${list.map((b) => `<option value="${esc(b.id)}">${
                esc(b.customer_name || "Client")} · ${dayLabel(new Date(b.starts_at).getTime())} ${
                hhmm(new Date(b.starts_at).getTime())} · ${kobo(b.total_kobo)}</option>`).join("")}
            </select></label>
          <label class="fld"><span class="lbl">Her six digits</span>
            <input id="fShort" type="text" inputmode="numeric" maxlength="7"
                   placeholder="000000" style="letter-spacing:.35em;font-size:22px"></label>
          <button class="btn" data-a="scan-typed">Release the payment</button>`}
      </div>`);

    if (canScan) startCamera();
  });
  return head("Scan to get paid", "At the end, in front of her") + host();
}

async function startCamera() {
  const v = document.getElementById("camv");
  const msg = document.getElementById("camMsg");
  if (!v) return;
  try {
    CAM = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }, audio: false });
    v.srcObject = CAM;
    await v.play();
  } catch {
    if (msg) msg.textContent = "The camera is not available — type the digits instead.";
    return;
  }

  const det = new BarcodeDetector({ formats: ["qr_code"] });
  let busy = false;
  const look = async () => {
    if (!CAM || busy) return;
    busy = true;
    try {
      const found = await det.detect(v);
      if (found.length) {
        const code = found[0].rawValue;
        stopCamera();
        await releaseByCode(code);
        return;
      }
    } catch { /* a frame that could not be read is not an error worth showing */ }
    busy = false;
  };
  TICKER = setInterval(look, 400);
}

function stopCamera() {
  if (TICKER) { clearInterval(TICKER); TICKER = null; }
  if (CAM) { CAM.getTracks().forEach((t) => t.stop()); CAM = null; }
}

async function releaseByCode(code) {
  try {
    const r = await API.scan(code);
    paidToast(r);
  } catch (e) {
    toast(e.message);
    nav("scanner");
  }
}

function paidToast(r) {
  toast(`${kobo(r.released_kobo)} released${r.customer_name ? " — " + r.customer_name : ""}`);
  nav("wallet");
}

/* ── 27 the wallet ────────────────────────────────────── */
function vWallet() {
  load(async () => {
    const [w, bank] = await Promise.all([
      API.wallet(),
      API.myBank().catch(() => ({})),
    ]);
    const hasBank = !!(bank && bank.account_number);
    fillHost(`
      <div class="pad stack gap12">
        <div class="ticket"><div style="padding:18px" class="stack gap12">
          <div class="tiny sub">Yours to withdraw</div>
          <div style="font-size:32px;font-weight:800;letter-spacing:-.03em">${kobo(w.available)}</div>
          <div class="kv" style="padding-top:12px;border-top:1px solid var(--line)">
            <span class="k">Held until you scan</span>
            <span class="v">${kobo(w.held)}</span></div>
        </div></div>

        ${w.held > 0 ? `<div class="note"><div>Money moves out of <b>held</b> the
          moment you scan a client's code. Until then it is hers, not yours —
          that is the promise that makes clients willing to pay first.</div></div>` : ""}

        <div class="menu">
          <button data-a="go" data-v="bank">
            <span class="ic">${I.pin ? I.pin(hasBank) : ""}</span>
            <span style="flex:1;min-width:0">Where the money goes
              <span class="tiny sub" style="display:block;font-weight:600;margin-top:1px">${
                hasBank
                  ? esc(bank.bank_name || "") + " &middot; &bull;&bull;&bull;&bull;" + esc(String(bank.account_number).slice(-4))
                  : "Not added yet — add your bank details before you withdraw"}</span></span>
            ${I.chev()}</button>
        </div>

        <button class="btn" data-a="payout" ${w.available <= 0 ? "disabled" : ""}>
          Withdraw ${kobo(w.available)}</button>

        <div id="paidList"></div>

        ${!w.recent.length ? "" : `
          <div class="tiny sub mt16">Every movement</div>
          <div class="menu">
            ${w.recent.slice(0, 12).map((l) => `
              <div style="display:flex;gap:10px;align-items:center;padding:12px 14px">
                <span style="flex:1">${esc(ledgerWords(l.kind))}</span>
                <b style="color:${l.delta_kobo > 0 ? "var(--good)" : "var(--ink)"}">
                  ${l.delta_kobo > 0 ? "+" : "−"}${kobo(Math.abs(l.delta_kobo))}</b>
              </div>`).join("")}
          </div>`}
      </div>`);
    // The bill for each completed appointment, filled in after the balances so
    // the numbers she came for are on screen first.
    drawEarnings();
  });
  return head("Earnings", "Held, and yours") + host();
}

const LEDGER_WORDS = {
  capture: "Client paid — held",
  release_out: "Released from held",
  release_in: "Released to you",
  payout: "Withdrawn",
  refund: "Refunded to client",
  auto_refund_no_scan: "Auto-refunded — never scanned",
  // Named, not hidden. A deduction a tech cannot point at is a deduction she
  // assumes is bigger than it is.
  oma_fee: "Oma's fee",
};
const ledgerWords = (k) => LEDGER_WORDS[k] || k.replace(/_/g, " ");

/* ── 28 the NIN check ─────────────────────────────────── */
/* One check, two people.
   This screen used to be a nail tech's screen and said so — "you can list
   yourself and take bookings" — because until home service was gated she
   was the only person Oma ever verified. A customer who arrived here from
   the home-service gate was told about listing herself as a nail tech,
   which is nobody's answer to "why are you asking for my NIN".

   It also read `me.kyc`, which api_me() takes from the TECH row. A
   customer has no tech row, so her answer was always null and the screen
   would have gone on offering the form after she had already passed. The
   truth about the PERSON is api_my_identity(). */
function vKyc() {
  const tech = DB.role === "tech";

  load(async () => {
    const id = await API.myIdentity().catch(e => ({ kyc: "none", verified: false, error: e.message }));
    const status = (id && id.kyc) || "none";

    if (status === "verified" && id.verified) {
      return fillHost(`<div class="pad"><div class="note good">
        <div><b>Verified.</b> ${tech
          ? "You can list yourself and take bookings."
          : "You can now book a nail tech to come to you."}</div></div>
        <button class="btn mt16" data-a="go" data-v="${tech ? "listing" : "nearby"}">${
          tech ? "Your listing" : "Find a nail tech"}</button></div>`);
    }

    // Verified with the provider and still refused. Said plainly, and
    // without an accusation on a screen anyone might be reading over her
    // shoulder — the reason belongs in a reply to an email, not here.
    if (status === "verified" && !id.verified) {
      return fillHost(`<div class="pad"><div class="note warn">
        <div><b>This identity cannot be used on Oma.</b> If you think that is
        a mistake, write to <a href="mailto:hello@omanails.com">hello@omanails.com</a>
        and a person will look at it.</div></div></div>`);
    }

    fillHost(`
      <div class="pad stack gap12">
        <div class="note"><div>${tech
          ? `Clients hand money to a stranger before you touch their nails.
             This is what makes that reasonable.`
          : `A nail tech coming to your address is arriving alone at a place
             she has never been. Oma checks her before she can be listed, and
             it checks you before she is asked to travel — the same check,
             both ways.`}</div></div>

        <!-- Kamsy, 20 Sep 2026: "before someone verifies ask them for their
             full name, and tell them to avoid hyphens." Asked here rather
             than trusted from the Profile screen, because she may never have
             opened that screen at all — this is the one moment the name is
             actually about to be checked against something, so it is the
             right moment to ask. Prefilled from whatever the Profile screen
             already has, so someone who set it there is not asked twice. -->
        <label class="fld"><span class="lbl">Your full name</span>
          <input id="fKycName" type="text" value="${esc((DB.me && DB.me.name) || "")}"
                 placeholder="As it is on your ID"></label>
        <div class="tiny sub" style="margin-top:-6px">Write it as separate
          words, not joined with a hyphen — <b>Amaka Okafor</b>, not
          <b>Amaka-Okafor</b>. This is what gets checked against your ID, and
          it is also what people see until you change it later.</div>

        <div class="tiny sub">
          <b>Use a virtual NIN, not your real one.</b> Dial <b>*346#</b> or open
          the NIMC app and generate an 11-digit vNIN. It lasts 72 hours and works
          only for us. Oma never sees your real number and stores neither.
        </div>

        <label class="fld"><span class="lbl">Your vNIN or NIN (11 digits)</span>
          <input id="fNin" type="text" inputmode="numeric" maxlength="13"
                 placeholder="000 0000 0000" style="letter-spacing:.12em"></label>
        <button class="btn" data-a="kyc-send">Check it</button>

        <!-- This used to say "three things", and adding the fingerprint quietly
             made it four. A page that promises exactly what it keeps has to be
             re-counted every time something is added to it, or it becomes a
             lie by arithmetic. -->
        <div class="tiny sub">We keep four things: that it passed, the checker's
          reference, whether the name matched, and a scrambled code that lets
          Oma recognise somebody it has already removed. The code cannot be
          turned back into your name, your number or your date of birth, and
          none of those are kept.</div>

        ${!tech ? `<div class="tiny sub">Booking at her salon needs none of
          this. It is only for appointments at your own address.</div>` : ""}

        ${status === "failed" ? `<div class="note warn"><div>The last check did not
          pass. ${tech
            ? `If the name on your Oma profile is your business name rather than
               the name on your ID, fix that first.`
            : `The name on your Oma profile has to be the name on your ID —
               check Profile if you signed up with a short version of it.`}</div></div>` : ""}
      </div>`);
  });
  return head("Verify your identity",
              tech ? "Once, with a virtual NIN"
                   : "Once, for home appointments") + host();
}

/* ── where a withdrawal goes ──────────────────────────────
   Kamsy, 19 Sep 2026: build the screen a tech uses to tell Oma her bank
   account, so a "Withdraw" request has somewhere real to land. The account
   name is confirmed against Paystack's bank-resolve lookup before saving —
   that works today, with no business verification needed, and it is the one
   thing standing between a typo and money sent into a stranger's account.

   Codes below are Paystack's own NUBAN codes for the well-established banks
   — stable for years. A few widely-used fintechs are included too; if a
   tech's bank is not in the list, "Other (I'll type the code)" lets her put
   in a bank code herself rather than being stuck. */
const NG_BANKS = [
  ["044", "Access Bank"], ["063", "Access Bank (Diamond)"],
  ["023", "Citibank Nigeria"], ["050", "Ecobank Nigeria"],
  ["070", "Fidelity Bank"], ["011", "First Bank of Nigeria"],
  ["214", "First City Monument Bank"], ["058", "Guaranty Trust Bank"],
  ["030", "Heritage Bank"], ["301", "Jaiz Bank"], ["082", "Keystone Bank"],
  ["076", "Polaris Bank"], ["101", "Providus Bank"], ["221", "Stanbic IBTC Bank"],
  ["068", "Standard Chartered Bank"], ["232", "Sterling Bank"],
  ["032", "Union Bank of Nigeria"], ["033", "United Bank For Africa"],
  ["215", "Unity Bank"], ["035", "Wema Bank"], ["057", "Zenith Bank"],
  ["50211", "Kuda Bank"], ["999992", "OPay"], ["100033", "PalmPay"],
  ["50515", "Moniepoint MFB"],
];
// A separate sentinel from "no bank chosen yet" (""), so a fresh screen can
// tell "nothing picked" apart from "she picked Other and typed her own code".
const NG_BANK_OTHER = "other";

function vBankDetails() {
  const tech = DB.role === "tech";
  if (!tech) return `${head("Bank details", "For nail techs only")}
    <div class="pad"><div class="empty">This is where a nail tech tells Oma
      where to pay her — there is nothing to add on a customer account.</div></div>`;

  load(async () => {
    const bank = await API.myBank().catch(() => ({}));
    RESOLVED = bank && bank.account_name ? bank.account_name : null;
    fillHost(bankForm(bank || {}));
  });
  return head("Where the money goes", "For your withdrawals") + host();
}

/* The confirmed name sits outside any input, because a name resolved against
   a bank is a fact she should not be able to silently overwrite by editing
   the field again — a fresh account number means a fresh confirmation.
   BANKPICK carries exactly what was resolved, so Save sends what Paystack
   actually confirmed rather than re-reading fields that may have changed
   since. */
let RESOLVED = null;
let BANKPICK = null;   // { bankCode, bankName, accountNumber } once verified

/** Reads the two-or-three fields on screen into one clean {code, number}. */
function readBankFields() {
  const sel = document.getElementById("fBankCode");
  const code = sel && sel.value === NG_BANK_OTHER
    ? (document.getElementById("fBankCodeOther") || {}).value || ""
    : (sel ? sel.value : "");
  const acct = (document.getElementById("fAcctNum") || {}).value || "";
  return { code: code.trim(), number: acct.replace(/\D/g, "") };
}

function bankForm(bank) {
  const saved = bank.bank_code || "";
  const known = NG_BANKS.some(([code]) => code === saved);
  // Three states, not two: nothing chosen yet, a bank from the list, or a
  // code that is not in the list (either she saved one before, or she just
  // picked "Other" in this session) — that last one shows the free-text code
  // box, the other two don't.
  const other = saved === NG_BANK_OTHER || (saved && !known);
  const otherCode = saved === NG_BANK_OTHER ? "" : (other ? saved : "");
  return `
    <div class="pad stack gap12">
      <div class="note"><div>Oma never automates a transfer without your
        confirmation, and today every withdrawal is still sent by a person
        at Oma, by hand — this just tells them where to send it. The account
        name below comes from your bank, not from what you type, so a
        mistyped digit is caught here rather than after money is sent.</div></div>

      <label class="fld"><span class="lbl">Bank</span>
        <select id="fBankCode">
          <option value="" ${!saved ? "selected" : ""} disabled>Choose your bank</option>
          ${NG_BANKS.map(([code, name]) => `<option value="${esc(code)}"
            ${code === saved ? "selected" : ""}>${esc(name)}</option>`).join("")}
          <option value="${NG_BANK_OTHER}" ${other ? "selected" : ""}>Other bank (I'll type the code)</option>
        </select></label>

      ${other ? `<label class="fld"><span class="lbl">Bank code (from your bank or Paystack)</span>
        <input id="fBankCodeOther" inputmode="numeric" value="${esc(otherCode)}"></label>` : ""}

      <label class="fld"><span class="lbl">Account number</span>
        <input id="fAcctNum" type="text" inputmode="numeric" maxlength="10"
               placeholder="0123456789" value="${esc(bank.account_number || "")}"></label>

      <button class="btn" data-a="bank-verify">Verify account</button>

      ${RESOLVED ? `<div class="note good"><div><b>${esc(RESOLVED)}</b><br>
        <span class="tiny sub">If that is not you, do not save — check the
        number and the bank and verify again.</span></div></div>
        <button class="btn" data-a="bank-save">Save</button>` : ""}
    </div>`;
}

/* ── 29 connect a backend ─────────────────────────────────
   Two fields and a test button, because the alternative is typing JavaScript
   into a phone's developer console — which is not a thing anyone should have
   to do to use their own app.

   The anon key belongs here and is safe here: it is shipped inside every copy
   of Oma and is public by design. What protects the data is the row-level
   security in api.sql, not the secrecy of this string. The service_role key is
   a different animal entirely and must never be typed into this screen.      */
function vBackend() {
  const c = (() => { try { return JSON.parse(localStorage.getItem("oma-cfg")) || {}; }
                     catch { return {}; } })();
  return `
  ${head("Your backend", API.live() ? "Connected" : "Not connected — running on the stand-in")}
  <div class="pad stack gap12">
    <div class="note ${API.live() ? "good" : ""}">
      <div>${API.live()
        ? "Bookings and payments are going to your Supabase project."
        : "Oma is running its practice version: everything works, nothing is real, and it all stays on this device."}</div>
    </div>

    <label class="fld"><span class="lbl">Project URL</span>
      <input id="fUrl" type="url" inputmode="url" autocapitalize="off" spellcheck="false"
             placeholder="https://abcdefgh.supabase.co" value="${esc(c.url || "")}"></label>

    <label class="fld"><span class="lbl">Anon public key</span>
      <input id="fAnon" type="text" autocapitalize="off" spellcheck="false"
             placeholder="eyJhbGciOi…" value="${esc(c.anon || "")}"></label>

    <button class="btn" data-a="cfg-save">Connect and test</button>
    ${API.live() ? `<button class="btn ghost sm" data-a="cfg-clear">
      Disconnect and go back to practice</button>` : ""}

    <div class="note warn"><div><b>Only ever paste the anon key here.</b> It is meant to be
      public — it ships inside the app. The <i>service_role</i> key bypasses every
      rule in your database and belongs on a server, never on a device.</div></div>

    <div class="tiny sub">Settings → API in your Supabase dashboard has both.
      Everything in your project is protected by the row-level security in
      <code>api.sql</code>, not by keeping this key quiet.</div>
  </div>`;
}
