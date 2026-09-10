/* ══ finding a nail tech ═════════════════════════════
   Kamsy: "let salons not just be nailtechs nearby let that just be one of the
   features i want users to be able to search for nail techs".

   So nearby is no longer the only door. It is the door that opens when nobody
   has typed anything — the list starts closest-first, exactly as it did — and
   the moment she types, the search leaves the neighbourhood and covers the
   whole country. Distance stays on every row, because knowing something is
   529 km away is useful; being hidden for it is not.

   Four things match, and they are the four reasons somebody looks for a nail
   tech at all: a NAME she was given, an AREA she is going to, the SERVICE she
   wants, or the SHAPE her scan just recommended. The last one is why the
   result screen's button lands here with the shape already typed.           */

let FQ = "";              // what she has typed, kept across screens
/* Where she is, and WHEN we asked.

   Kamsy: "customer locations should not be pinned, they are not shops, they
   move around". She is right, and this was the worst offender — it asked the
   phone once and reused that answer for the whole session, so somebody who
   searched in Yaba and then drove to Lekki was still being sorted by where
   she had been an hour ago.

   Worth being straight about the limit: a web page cannot follow anybody
   around in the background, and should not try. What it can do is take a
   FRESH fix whenever a screen actually needs a distance, and that is what
   this does — the answer is reused for two minutes, which is short enough
   that a journey moves it and long enough that typing four letters does not
   wake the GPS four times. */
let FPOS = null;
let FPOSAT = 0;
const POS_STALE_MS = 120000;
let FSEQ = 0;             // which search is the current one
let FTIMER = null;

function stopFind() {
  if (FTIMER) { clearTimeout(FTIMER); FTIMER = null; }
  FSEQ++;
}

function matchTag(m) {
  // Why this result is here. Without it, searching "lekki" and getting a
  // salon whose name has nothing to do with Lekki looks like a bug. It sits
  // under the name rather than beside it — as a column it stole enough width
  // to wrap "Abuja Nail Room" onto two lines.
  const label = { area: "this area", service: "this service", shape: "this shape" }[m];
  return label
    ? `<span class="tag" style="font-weight:700;margin-top:7px;display:inline-block">${label}</span>`
    : "";
}

function howFar(km) {
  if (km == null) return "";
  // "0 m away" is what rounding gives you when she is standing in the doorway,
  // and it reads as a missing number rather than a very small one.
  if (km < 0.05) return "<b>Right here</b>";
  if (km < 1) return `<b>${Math.round(km * 1000)} m</b> away`;
  if (km < 100) return `<b>${km.toFixed(1)} km</b> away`;
  return `<b>${Math.round(km).toLocaleString("en")} km</b> away`;
}

/* Browsing shows PLACES; searching shows people.
   Five techs renting chairs in one shop used to be five cards on one pin,
   which reads as duplicated data rather than a busy salon. Collapsed while
   she is browsing — but the moment she types a name or a service she is
   looking for a particular person, so search still returns individuals. */

/* ══ one salon ═══════════════════════════════════════════════════════
   The techs who work in a shop, and nothing about the shop itself
   beyond its name and where it is. A salon has no rating and no
   services of its own, because a salon does not do nails — the people
   inside it do, and it is one of them the customer is choosing. */
let SALON = null, SALON_ID = null;

async function loadSalon(id) {
  SALON_ID = id;
  try {
    const [s, list] = await Promise.all([API.salon(id), API.salonTechs(id)]);
    SALON = { ...s, list };
  } catch (e) {
    SALON = { error: e.message, list: [] };
  }
  if (ROUTE.v === "salon") {
    paint();
    // ratingSlot paints a "·" placeholder that fillRatings replaces. Without
    // this the salon page shows a row of lonely middle dots where the scores
    // should be — it looked like a rendering bug, and was a missing call.
    fillRatings((SALON.list || []).map((x) => x.id));
  }
}

function vSalon(id) {
  if (!SALON || SALON_ID !== id) { SALON = null; loadSalon(id); }
  const s = SALON;
  if (!s) return head("Loading…") + `<div class="pad"><div class="tiny faint">Looking…</div></div>`;
  if (s.error) return head("Salon") + `<div class="pad"><div class="note warn"><div>${esc(s.error)}</div></div></div>`;

  return `
  ${head(s.name, [s.area, s.address].filter(Boolean).join(" · ") || null)}
  <div class="pad">
    <div class="note">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-6h6v6"/></svg>
      <div><b>${s.techs} nail tech${Number(s.techs) === 1 ? "" : "s"} work here.</b>
        You book one of them, not the shop — she is the one Oma pays, and the
        one whose reviews you are reading.</div>
    </div>

    <div class="seehead" style="padding-left:0;padding-right:0"><h3>Who works here</h3></div>
    ${s.list.length ? `<div class="stack gap12">
      ${s.list.map((x) => `
        <button class="card row" data-a="tech-open" data-id="${esc(x.id)}">
          <div class="avatar sq">${esc(initials(x.business_name))}</div>
          <div style="flex:1;min-width:0;text-align:left">
            <div class="ttl">${esc(x.business_name)}${verifiedBadge()}</div>
            <div class="tiny sub">${x.years ? `${x.years} yrs` : ""}${
              x.years && x.opens ? " · " : ""}${x.opens ? `${String(x.opens).slice(0,5)}–${String(x.closes).slice(0,5)}` : ""}</div>
            <div style="margin-top:5px">${ratingSlot(x.id)}</div>
            ${x.from_kobo ? `<div class="tiny" style="margin-top:6px">from ${kobo(x.from_kobo)}</div>` : ""}
          </div>
          ${I.chev()}
        </button>`).join("")}
    </div>` : `<div class="empty"><b>Nobody is listed here yet</b>
        The techs who work here have not finished their listings.</div>`}
  </div>
  <div style="height:24px"></div>`;
}

function placeRow(r) {
  if (r.kind !== "salon") return findRow({ ...r, business_name: r.name });
  const bits = [howFar(r.km), r.from_kobo ? "from " + kobo(r.from_kobo) : null]
    .filter(Boolean).join(" · ");
  return `
  <button class="card row" data-a="salon-open" data-id="${esc(r.id)}">
    <div class="avatar sq" style="background:var(--fill2);color:var(--sub)">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-6h6v6"/></svg>
    </div>
    <div style="flex:1;min-width:0;text-align:left">
      <div class="ttl">${esc(r.name)}</div>
      <div class="tiny sub">${esc(r.area || "")}${r.area ? " · " : ""}<b>${
        r.techs} nail tech${Number(r.techs) === 1 ? "" : "s"}</b></div>
      ${bits ? `<div class="tiny" style="margin-top:6px">${bits}</div>` : ""}
    </div>
    ${I.chev()}
  </button>`;
}

function findRow(t) {
  const bits = [howFar(t.km), t.from_kobo ? "from " + kobo(t.from_kobo) : null]
    .filter(Boolean).join(" · ");
  return `
  <button class="card row" data-a="tech-open" data-id="${esc(t.id)}">
    <div class="avatar sq">${esc(initials(t.business_name))}</div>
    <div style="flex:1;min-width:0;text-align:left">
      <div class="ttl">${esc(t.business_name)}${verifiedBadge()}</div>
      <div class="tiny sub">${esc(t.area || "")}${t.years ? ` · ${t.years} yrs` : ""}</div>
      <div style="margin-top:5px">${ratingSlot(t.id)}</div>
      ${bits ? `<div class="tiny" style="margin-top:6px">${bits}</div>` : ""}
      ${matchTag(t.matched)}
    </div>
    ${I.chev()}
  </button>`;
}

function findInto(html) {
  const el = document.getElementById("findResults");
  if (el) el.innerHTML = html;
}

/* The clear button lives in the header, which is NOT repainted while she
   types — that is what keeps the keyboard up — so it has to be shown and
   hidden by hand. */
function findClearBtn() {
  const b = document.getElementById("findClear");
  if (b) b.classList.toggle("hidden", !FQ);
}

async function runFind() {
  const mine = ++FSEQ;
  const q = FQ.trim();
  findClearBtn();
  findInto(`<div class="tiny faint" style="padding:4px 2px">Looking…</div>`);

  // Asked once per session, and never blocking: without it search still works,
  // it just cannot say how far anything is.
  if ((FPOS === null || Date.now() - FPOSAT > POS_STALE_MS) &&
      typeof whereAmI === "function") {
    const p = await whereAmI();
    if (mine !== FSEQ) return;
    FPOS = p && !p.guessed ? p : false;
    FPOSAT = Date.now();
  }

  let list;
  try {
    list = q
      ? await API.search(q, FPOS ? FPOS.lat : null, FPOS ? FPOS.lng : null)
      // No query means she is browsing, and browsing is where a shop with
      // three chairs should be one card rather than three.
      : await API.placesNearby(FPOS ? FPOS.lat : 6.4478, FPOS ? FPOS.lng : 3.4723, 25);
  } catch (e) {
    if (mine !== FSEQ) return;
    return findInto(`<div class="note warn"><div>${esc(
      (e && e.message) || "That search could not be run just now.")}</div></div>`);
  }
  if (mine !== FSEQ) return;         // she typed again while this was in flight

  if (!list.length) {
    return findInto(q
      ? `<div class="empty"><b>Nothing matched “${esc(q)}”</b>
           Try a shorter word — a salon's name, an area like Lekki, a service
           like acrylic, or a shape like almond.</div>`
      : `<div class="empty"><b>No nail techs have listed themselves yet</b>
           When they do, they show up here.</div>`);
  }

  const head = q
    ? `${list.length} result${list.length === 1 ? "" : "s"} for “${esc(q)}”`
    : FPOS ? "Nearest first" : "Everyone listed";
  findInto(`
    <div class="tiny faint" style="padding:2px 2px 10px">${head}${
      !FPOS && q ? " · turn on location to see how far away they are" : ""}</div>
    <div class="stack gap12">${list.map(q ? findRow : placeRow).join("")}</div>`);

  // After the list, never before it. Waiting on scores to show results would
  // make every search slower for something that is decoration until she is
  // actually choosing between two people.
  fillRatings(list.filter((r) => q || r.kind !== "salon").map((r) => r.id));
}

function vFind() {
  // The results are filled in after paint, and only the results — replacing
  // the whole screen on every keystroke would take the keyboard away with it.
  afterPaint();
  setTimeout(runFind, 0);
  return `
  <div class="topbar plain">
    <div class="rowbetween">
      <h2 style="font-size:22px;font-weight:800;letter-spacing:-.035em">Nail techs</h2>
      <button class="iconbtn" data-a="paste-tech" aria-label="Paste a tech's link">${I.clip()}</button>
    </div>
    <label class="search mt16">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>
      <input id="qFind" placeholder="Name, area, service or shape"
             value="${esc(FQ)}" autocomplete="off" autocapitalize="none" spellcheck="false">
      <button class="iconbtn sm${FQ ? "" : " hidden"}" id="findClear" data-a="find-clear"
        aria-label="Clear the search">${I.x()}</button>
    </label>
    <div class="tiny faint" style="margin-top:8px">Searches everywhere, not just around you.</div>
  </div>
  <div class="pad" id="findResults"></div>
  <div style="height:16px"></div>`;
}

/* Used by the scan result's "Find a tech for almond" button, so the bridge
   from a recommendation to a person is one tap and the search box shows why
   these results are the ones on screen. */
function findFor(text) {
  FQ = String(text || "");
  nav("salons");
  const el = document.getElementById("qFind");
  if (el) { el.focus(); el.setSelectionRange(FQ.length, FQ.length); }
}
