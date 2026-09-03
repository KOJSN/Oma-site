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
let FPOS = null;          // where she is, asked once
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

function findRow(t) {
  const bits = [howFar(t.km), t.from_kobo ? "from " + kobo(t.from_kobo) : null]
    .filter(Boolean).join(" · ");
  return `
  <button class="card row" data-a="tech-open" data-id="${esc(t.id)}">
    <div class="avatar sq">${esc(initials(t.business_name))}</div>
    <div style="flex:1;min-width:0;text-align:left">
      <div class="ttl">${esc(t.business_name)}</div>
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
  if (FPOS === null && typeof whereAmI === "function") {
    const p = await whereAmI();
    if (mine !== FSEQ) return;
    FPOS = p && !p.guessed ? p : false;
  }

  let list;
  try {
    list = await API.search(q, FPOS ? FPOS.lat : null, FPOS ? FPOS.lng : null);
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
    <div class="stack gap12">${list.map(findRow).join("")}</div>`);

  // After the list, never before it. Waiting on scores to show results would
  // make every search slower for something that is decoration until she is
  // actually choosing between two people.
  fillRatings(list.map((t) => t.id));
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
