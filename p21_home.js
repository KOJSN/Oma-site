/* ══ SHE COMES TO YOU ══════════════════════════════════════════════════
   Home appointments — the price, the address, and the tech's own settings.

   Kamsy, 8 Sep 2026: "sometimes users are lazy and don't want to go out, so
   let the nail techs come to them, and that costs money — base price + 3000 +
   transport fare at 1,300 per km, or the nail tech customizes her own
   standard price."

   ── the one number that matters ─────────────────────────────────────

   Nothing on this page decides what anything costs. Every figure below comes
   back from api_home_quote in home.sql, computed from the tech's own row
   against her real coordinates — which never leave the database. A fare the
   phone works out is a fare the phone can change, and the distance cannot
   even be measured here: the app only ever sees her hexagon.

   So this file asks, shows, and books. It does not calculate.

   ── what the customer is shown ──────────────────────────────────────

   Kamsy, 8 Sep 2026: "don't let the customer see the breakdown of price."

   ONE NUMBER, and a sentence saying what is in it:

       She comes to you
       ₦28,250
       Includes her call-out and the trip to you.

   Not "₦9,000 + ₦3,000 + ₦16,250". The itemised version was defensible —
   it showed her exactly where the money went — but it also invited an
   argument with each line in turn, and the fare is the tech's, not something
   a customer can negotiate down. A price is a price. What she needs is the
   figure, an honest word about what it covers, and the other option to
   compare it against.

   The two prices sit side by side, because a number with nothing beside it
   is just a number, and a customer who cannot see that going to the salon
   costs less is being quietly steered.

   Nothing about OMA'S fee appears here at all. What Oma takes from a tech is
   between Oma and the tech, and a customer reading it learns nothing she can
   act on.                                                                */

/* Where this appointment happens. Reset whenever a tech is chosen, because
   "she comes to me" is not a thing to carry over to a different tech. */
let HOME = {
  at: false,        // she comes to me
  addr: "",         // the street, typed
  pos: null,        // { lat, lng } — her phone, asked fresh
  quote: null,      // whatever the server last said
  asking: false,
};

function resetHome() { HOME = { at: false, addr: "", pos: null, quote: null, asking: false }; }

/* ── asking for a quote ──────────────────────────────────────────────
   Position first, because there is no fare without one, and a refused
   permission has to say so rather than leaving the screen half-drawn. */
async function askHomeQuote() {
  if (HOME.asking) return;
  HOME.asking = true;
  paintHome();
  try {
    if (!HOME.pos) {
      const p = await whereAmI();
      if (p.guessed) {
        HOME.quote = { ok: false, why: "no_position",
          says: p.why === "denied"
            ? "Oma needs your location to work out the travel. Turn it on for "
              + "this site and try again."
            : "Could not get a fix. Outdoors, or with Wi-Fi on, usually does it." };
        return;
      }
      HOME.pos = { lat: p.lat, lng: p.lng };
    }
    HOME.quote = await API.homeQuote(PICKED.techId, PICKED.ids, HOME.pos.lat, HOME.pos.lng);
  } catch (e) {
    HOME.quote = { ok: false, why: "error", says: (e && e.message) || "Could not get a price." };
  } finally {
    HOME.asking = false;
    paintHome();
  }
}

/* ── the block on the "pick a time" screen ──────────────────────────── */
function homeBlock(tech) {
  // A tech who does not travel is not offered as one. Showing the choice and
  // then refusing it is a worse screen than not showing it.
  if (!tech || !tech.home_service) return "";
  return `<div id="homeBlock">${homeInner()}</div>`;
}

function homeInner() {
  const q = HOME.quote;
  return `
    <div class="lbl" style="margin-bottom:7px">Where</div>
    <div class="pick">
      <button type="button" class="${HOME.at ? "" : "on"}" data-a="home-where" data-v="0">
        <b>I'll go to her</b><em>Her salon or wherever she is working.</em></button>
      <button type="button" class="${HOME.at ? "on" : ""}" data-a="home-where" data-v="1">
        <b>She comes to me</b><em>Costs more — a call-out and the travel.</em></button>
    </div>
    ${!HOME.at ? "" : `
      <label class="field"><span class="lab">Where should she come to?</span>
        <span class="inp"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--faint)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
          <input id="hAddr" value="${esc(HOME.addr)}"
                 placeholder="12 Herbert Macaulay Way, Flat 3"></span></label>
      <div class="note" style="margin-top:-4px">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-3.5 7-9V6l-7-3-7 3v6c0 5.5 7 9 7 9Z"/></svg>
        <div>She sees your <b>area</b> now and your <b>street only once you have
          paid</b> — the same way you only get hers after booking.</div></div>
      ${HOME.asking
        ? `<div class="card"><div class="tiny sub">Working out the travel…</div></div>`
        : q ? (q.ok ? homeBill(q) : `<div class="note warn"><div>${esc(q.says
              || "She cannot come to you for this one.")}</div></div>`)
            : ""}`}`;
}

/* One number, not a bill. The comparison stays: it is not a breakdown of this
   price, it is the OTHER price, and it is the only thing on the screen that
   lets her decide rather than just accept. */
function homeBill(q) {
  return `<div class="card">
    <div class="rowbetween" style="align-items:flex-end">
      <div style="min-width:0">
        <div class="tiny faint">She comes to you</div>
        <div style="font-size:26px;font-weight:800;letter-spacing:-.03em;
                    font-variant-numeric:tabular-nums">${kobo(q.total_kobo)}</div>
      </div>
      ${q.salon_kobo && q.salon_kobo !== q.total_kobo ? `<div style="text-align:right">
        <div class="tiny faint">At her place</div>
        <div style="font-weight:700;font-variant-numeric:tabular-nums">${kobo(q.salon_kobo)}</div>
      </div>` : ""}
    </div>
    ${(q.callout_kobo || q.fare_kobo) ? `<div class="tiny faint" style="margin-top:8px">
      Includes her call-out and the trip to you.</div>` : ""}
  </div>`;
}

/* Repaint just this block. paint() would rebuild the screen and throw away a
   half-typed address, which is exactly the sort of small cruelty that makes
   people abandon a booking. */
function paintHome() {
  const el = document.getElementById("homeBlock");
  if (!el) return;
  const typed = document.getElementById("hAddr");
  if (typed) HOME.addr = typed.value;
  el.innerHTML = homeInner();
}

/* ── where am I going / where is she coming ──────────────────────────
   One call, both sides. The server decides what each of them may see; this
   only renders the answer. */
function whereCard(w) {
  if (!w || !w.at_home) return "";
  const km = w.km == null ? "" : ` · ${Math.round(w.km * 10) / 10} km`;
  return `<div class="card">
    <div class="lbl">At the customer's place${esc(km)}</div>
    ${w.address
      ? `<div style="font-weight:600;margin-top:4px">${esc(w.address)}</div>`
      : `<div style="font-weight:600;margin-top:4px">${esc(w.area || "Her area")}</div>
         <div class="tiny faint" style="margin-top:4px">${esc(w.why || "")}</div>`}
  </div>`;
}

async function fillWhere(bookingId) {
  const slot = document.getElementById("whereSlot");
  if (!slot) return;
  try { slot.innerHTML = whereCard(await API.bookingWhere(bookingId)); }
  catch (e) { slot.innerHTML = ""; }
}

/* ══ the tech's side ═══════════════════════════════════════════════════
   Her settings sit under her service menu, because they are about the menu:
   whether she travels at all, what the trip costs, and how far she will go. */
function homeSettings(b) {
  const on = !!b.homeService;
  const n = (kb, d) => String(Math.round((kb == null ? d : kb) / 100));
  return `
    <div class="rowbetween" style="margin:16px 0 8px">
      <div style="font-size:14.5px;font-weight:800;letter-spacing:-.02em">Going to customers</div>
      <button class="switch${on ? " on" : ""}" data-a="home-toggle"
              role="switch" aria-checked="${on ? "true" : "false"}"
              aria-label="I travel to customers"><i></i></button>
    </div>
    ${!on ? `<div class="tiny faint">Off. Customers come to you.</div>` : `
      <div style="display:flex;gap:10px">
        <label class="field" style="flex:1;min-width:0"><span class="lab">Call-out, per visit</span>
          <span class="inp"><span class="pre">${esc(b.cur || DB.cur)}</span>
            <input id="hCallout" inputmode="numeric" value="${esc(n(b.calloutKobo, 300000))}"></span></label>
        <label class="field" style="flex:1;min-width:0"><span class="lab">Per kilometre</span>
          <span class="inp"><span class="pre">${esc(b.cur || DB.cur)}</span>
            <input id="hPerKm" inputmode="numeric" value="${esc(n(b.perKmKobo, 130000))}"></span></label>
      </div>
      <label class="field"><span class="lab">How far will you go?</span>
        <span class="inp"><input id="hMaxKm" inputmode="decimal"
          value="${esc(String(b.maxKm == null ? 15 : b.maxKm))}">
          <span class="tiny faint">km</span></span></label>
      <div class="note">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8.2v.1"/></svg>
        <div>The call-out is charged <b>once a visit</b>, however many services
          she books. <b>Oma takes nothing from either of these</b> — the fee is
          on your service prices only, because the trip is your time and your
          petrol. Prefer to quote one flat price instead? Put <b>0</b> in both
          boxes and set a home price on each service below.</div></div>`}`;
}

/* One extra row inside a service, when she travels. Empty means "the same as
   in my salon", which is both the default and the honest way to say it. */
function svcHomeRow(s, i, cur) {
  return `<label class="field" style="margin:9px 0 0"><span class="lab">Price at her home</span>
    <span class="inp" style="min-height:46px"><span class="pre">${esc(cur)}</span>
      <input data-s="hp" data-i="${i}" inputmode="numeric"
             value="${esc(s.hp || "")}" placeholder="same as above">
    </span></label>`;
}

/* Saving. Sent one at a time rather than in a lump, because api_set_home_service
   and api_set_service_home_price are separate for a reason: a bad number in one
   service must not silently discard her call-out. */
async function saveHomeSettings(b) {
  if (!API.signedIn()) return;
  const kb = (v, d) => {
    const n = Math.round(Number(String(v == null ? "" : v).replace(/[^\d.]/g, "")) * 100);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  await API.setHomeService(!!b.homeService, kb(b.calloutNaira, 300000),
                           kb(b.perKmNaira, 130000), Number(b.maxKm) || 15);
}
