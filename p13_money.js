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
function hostError(e) {
  fillHost(`<div class="pad"><div class="note warn">
    <span style="flex:none">${I.warn ? I.warn(16) : "!"}</span>
    <div>${esc(e && e.message ? e.message : String(e))}</div></div>
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

/* ── 20 sign in ───────────────────────────────────────── */
let SIGNIN = { phone: "", sent: false };

function vSignIn() {
  const s = SIGNIN;
  return `
  ${head("Sign in", "So your bookings follow you, not this phone")}
  <div class="pad stack gap12">
    ${API.isMock() ? `<div class="note">
      <div>No backend is configured, so this is the practice version. Any
      six-digit code will let you in and no message is sent.</div></div>` : ""}

    ${!s.sent ? `
      <label class="fld">
        <span class="lbl">Phone number</span>
        <input id="fSignPhone" type="tel" inputmode="tel" autocomplete="tel"
               placeholder="0801 234 5678" value="${esc(s.phone)}">
      </label>
      <button class="btn" data-a="otp-send">Send me a code</button>
      <div class="or"><span>or</span></div>
      <button class="btn ghost" data-a="google">Continue with Google</button>
      <div class="tiny sub" style="text-align:center">
        We only ever use this to know it is you.</div>
    ` : `
      <div class="note"><div>We sent a six-digit code to
        <b>${esc(s.phone)}</b>.</div></div>
      <label class="fld">
        <span class="lbl">The code</span>
        <input id="fOtp" type="text" inputmode="numeric" autocomplete="one-time-code"
               maxlength="6" placeholder="000000" style="letter-spacing:.4em;font-size:22px">
      </label>
      <button class="btn" data-a="otp-check">Sign in</button>
      <button class="btn ghost sm" data-a="otp-again">Use a different number</button>
    `}
  </div>`;
}

/* ── 21 nail techs nearby ─────────────────────────────── */
/* One row for a listed tech, shared by Home's short list and the full Salons
   list — so the two screens cannot drift into looking like different products.
   Distance comes from the database, which computed it; the app never guesses. */
function techRowLive(t) {
  return `
  <button class="card row" data-a="tech-open" data-id="${esc(t.id)}">
    <div class="avatar sq">${esc(initials(t.business_name))}</div>
    <div style="flex:1;min-width:0;text-align:left">
      <div class="ttl">${esc(t.business_name)}</div>
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
let PICKED = { techId: null, name: "", ids: [], at: null };

function vTechLive(id) {
  load(async () => {
    const list = await API.services(id);
    PICKED = { techId: id, name: PICKED.name, ids: [], at: null };
    fillHost(`
      <div class="pad stack gap12">
        <div class="tiny sub">Choose what you want done.</div>
        ${list.map((s) => `
          <label class="card row" style="cursor:pointer">
            <input type="checkbox" class="svc" value="${esc(s.id)}"
                   data-mins="${s.minutes}" data-kobo="${s.price_kobo}">
            <div style="flex:1;min-width:0;text-align:left">
              <div class="ttl">${esc(s.name)}</div>
              <div class="tiny sub">${mins(s.minutes)}</div>
            </div>
            <div style="font-weight:700">${kobo(s.price_kobo)}</div>
          </label>`).join("")}
        <div id="svcTotal" class="tiny sub" style="text-align:right"></div>
        <button class="btn" data-a="pick-time" disabled id="toTime">Choose a time</button>
      </div>`);
    wireServicePicker();
  });
  return head(PICKED.name || "Services", "Prices are hers, not ours") + host();
}

function wireServicePicker() {
  const boxes = [...document.querySelectorAll(".svc")];
  const total = document.getElementById("svcTotal");
  const go = document.getElementById("toTime");
  const update = () => {
    const on = boxes.filter((b) => b.checked);
    PICKED.ids = on.map((b) => b.value);
    const k = on.reduce((a, b) => a + Number(b.dataset.kobo), 0);
    const m = on.reduce((a, b) => a + Number(b.dataset.mins), 0);
    total.textContent = on.length ? `${kobo(k)} · about ${mins(m)}` : "";
    go.disabled = !on.length;
  };
  boxes.forEach((b) => b.addEventListener("change", update));
  update();
}

/* ── 23 a time ────────────────────────────────────────── */
function vTimeLive() {
  const days = [];
  for (let d = 1; d <= 7; d++) {
    const t = new Date(); t.setDate(t.getDate() + d); t.setHours(0, 0, 0, 0);
    days.push(t);
  }
  const slots = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  return `
  ${head("Pick a time", PICKED.name)}
  <div class="pad">
    <div class="chips" id="dayChips">
      ${days.map((d, i) => `<button class="chip${i === 0 ? " on" : ""}" data-a="mday"
         data-ts="${d.getTime()}">${dayLabel(d.getTime())}</button>`).join("")}
    </div>
    <div class="grid3 mt16" id="slotGrid">
      ${slots.map((h) => `<button class="chip" data-a="mslot" data-h="${h}">${
        String(h).padStart(2, "0")}:00</button>`).join("")}
    </div>
    <div class="note mt16"><div>You will have <b>30 minutes</b> to pay into an
      account we show you next. The slot is held for you until then.</div></div>
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
        <button class="btn ghost sm" data-a="dispute" data-id="${esc(b.id)}">
          Something went wrong with this appointment</button>
      </div>`);
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
    <div class="kv" style="padding-top:12px;border-top:1px solid var(--line)">
      <span class="k">Paid</span><span class="v" style="font-size:19px">${kobo(b.total_kobo)}</span></div>
  </div></div>`;
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
            Point at the code on her phone</div>
          <div class="or"><span>or type it</span></div>
        ` : `<div class="note"><div>This phone cannot scan a code from the camera —
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
    const w = await API.wallet();
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

        <button class="btn" data-a="payout" ${w.available <= 0 ? "disabled" : ""}>
          Withdraw ${kobo(w.available)}</button>

        ${!w.recent.length ? "" : `
          <div class="tiny sub mt16">Recent</div>
          <div class="menu">
            ${w.recent.slice(0, 12).map((l) => `
              <div style="display:flex;gap:10px;align-items:center;padding:12px 14px">
                <span style="flex:1">${esc(ledgerWords(l.kind))}</span>
                <b style="color:${l.delta_kobo > 0 ? "var(--good)" : "var(--ink)"}">
                  ${l.delta_kobo > 0 ? "+" : "−"}${kobo(Math.abs(l.delta_kobo))}</b>
              </div>`).join("")}
          </div>`}
      </div>`);
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
};
const ledgerWords = (k) => LEDGER_WORDS[k] || k.replace(/_/g, " ");

/* ── 28 the NIN check ─────────────────────────────────── */
function vKyc() {
  load(async () => {
    const me = await API.me();
    const status = (me && me.kyc) || "none";
    if (status === "verified") {
      return fillHost(`<div class="pad"><div class="note good">
        <div><b>Verified.</b> You can list yourself and take bookings.</div></div>
        <button class="btn mt16" data-a="go" data-v="listing">Your listing</button></div>`);
    }
    fillHost(`
      <div class="pad stack gap12">
        <div class="note"><div>Clients hand money to a stranger before you touch
          their nails. This is what makes that reasonable.</div></div>

        <div class="tiny sub">
          <b>Use a virtual NIN, not your real one.</b> Dial <b>*346#</b> or open
          the NIMC app and generate a 16-digit vNIN. It lasts 72 hours and works
          only for us. Oma never sees your real number, and never stores either.
        </div>

        <label class="fld"><span class="lbl">Your vNIN (16 digits)</span>
          <input id="fNin" type="text" inputmode="numeric" maxlength="19"
                 placeholder="0000 0000 0000 0000" style="letter-spacing:.12em"></label>
        <button class="btn" data-a="kyc-send">Check it</button>

        <div class="tiny sub">We keep three things: that it passed, the checker's
          reference, and whether the name matched. Nothing else — not your date
          of birth, not your address.</div>

        ${status === "failed" ? `<div class="note warn"><div>The last check did not
          pass. If the name on your Oma profile is your business name rather than
          the name on your ID, fix that first.</div></div>` : ""}
      </div>`);
  });
  return head("Verify your identity", "Once, with a virtual NIN") + host();
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
        : "Oma is running its practice version: everything works, nothing is real, and it all stays on this phone."}</div>
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
      rule in your database and belongs on a server, never on a phone.</div></div>

    <div class="tiny sub">Settings → API in your Supabase dashboard has both.
      Everything in your project is protected by the row-level security in
      <code>api.sql</code>, not by keeping this key quiet.</div>
  </div>`;
}
