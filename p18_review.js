/* ══ ratings and reviews ═════════════════════════════
   Search could find a customer twenty nail techs and tell her nothing about
   which of them are any good. This is that missing half.

   Two rules, decided by Kamsy, and the whole design follows from them:

     * only after a COMPLETED appointment — one where the tech scanned the QR
       code and the money was released
     * stars, and words only if she wants to write any

   The first rule is what makes this trustworthy without a moderation queue.
   `released` cannot be faked from a phone: it needs the customer's one-time
   code, scanned by that specific tech, which is the same moment the tech got
   paid. A tech cannot rate herself and a rival cannot bomb her. The escrow
   was already doing this work; reviews just lean on it.

   The honest cost: a new tech has no reviews, and these screens say exactly
   that rather than showing four grey stars or a hopeful "New!". */

/* ── drawing stars ───────────────────────────────────
   Half a star matters: 4.5 shown as four is a tech losing a rating she
   earned, and shown as five is a customer being misled. */
function starSvg(fill) {
  const id = "sg" + Math.random().toString(36).slice(2, 8);
  const path = "M12 3.6l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 17l-5.25 2.75 1-5.85"
             + "L3.5 9.75l5.9-.85z";
  if (fill >= 0.99) {
    return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
      ><path d="${path}" fill="currentColor"/></svg>`;
  }
  if (fill <= 0.01) {
    return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
      ><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6"
       opacity=".45"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <defs><linearGradient id="${id}">
      <stop offset="${fill * 100}%" stop-color="currentColor"/>
      <stop offset="${fill * 100}%" stop-color="transparent"/>
    </linearGradient></defs>
    <path d="${path}" fill="url(#${id})"/>
    <path d="${path}" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".45"/>
  </svg>`;
}

function starsHtml(n) {
  const v = Math.max(0, Math.min(5, Number(n) || 0));
  let out = "";
  for (let i = 1; i <= 5; i++) out += starSvg(Math.max(0, Math.min(1, v - i + 1)));
  return `<span class="stars" role="img" aria-label="${v.toFixed(1)} out of 5"
    style="display:inline-flex;gap:1px;color:var(--pink);vertical-align:-2px">${out}</span>`;
}

/* The count is never dropped. "5.0" from one appointment and "4.6" from forty
   are different facts, and a line that shows only the first lies by omission
   in the direction that flatters whoever has fewest reviews. */
function ratingLine(r) {
  if (!r || !r.reviews) {
    return `<span class="tiny faint">No reviews yet</span>`;
  }
  const n = Number(r.stars);
  return `${starsHtml(n)} <b style="font-size:12.5px">${n.toFixed(1)}</b>
    <span class="tiny faint">(${r.reviews})</span>`;
}

/* ── filling scores into a list that is already on screen ──
   api_search and api_nearby deliberately do not carry the score. One call for
   a whole screen is a round trip; redefining their return types in a second
   SQL file would have meant whichever file ran last silently won. That trade
   was made once today already, the expensive way.

   Rendered after the list, never before it: a screen that waits for ratings
   to show results would be slower for a feature that is decoration until she
   is actually choosing. */
let RATESEQ = 0;
async function fillRatings(ids) {
  const mine = ++RATESEQ;
  if (!ids || !ids.length) return;
  let rows;
  try { rows = await API.ratings(ids); } catch (e) { return; }  // silent: no score is not an error
  if (mine !== RATESEQ) return;
  const by = {};
  (rows || []).forEach((r) => { by[r.tech_id] = r; });
  ids.forEach((id) => {
    const slot = document.querySelector(`[data-rating="${cssEsc(id)}"]`);
    if (slot) slot.innerHTML = ratingLine(by[id]);
  });
}

/* An id goes into a CSS selector, so anything that could end an attribute has
   to be handled. Ids are uuids today; that is not a reason to write a
   selector that breaks the day they are not. */
function cssEsc(s) {
  return String(s).replace(/["\\]/g, "\\$&");
}

/* The empty box a row leaves for its score. */
function ratingSlot(id) {
  return `<span data-rating="${esc(id)}" class="tiny faint">·</span>`;
}

/* ── the reviews on a tech's page ────────────────────── */
function reviewsBlock(list, r) {
  if (!list || !list.length) {
    return `<div class="lbl mt16">Reviews</div>
      <div class="empty"><b>No reviews yet</b>
        Only customers who have actually been to an appointment here can leave
        one, so a new nail tech starts with none.</div>`;
  }
  return `
    <div class="lbl mt16">Reviews</div>
    <div class="tiny faint" style="margin:-4px 0 10px">${ratingLine(r)} · only from
      customers who completed an appointment here</div>
    <div class="stack gap12">
      ${list.map((v) => `
        <div class="card" style="display:block">
          <div class="rowbetween">
            <div>${starsHtml(v.stars)}</div>
            <div class="tiny faint">${esc(whenShort(v.created_at))}</div>
          </div>
          ${v.words ? `<div style="margin-top:8px;line-height:1.5">${esc(v.words)}</div>` : ""}
          <div class="tiny faint" style="margin-top:8px">${esc(v.who || "Someone")}</div>
        </div>`).join("")}
    </div>`;
}

function whenShort(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "";
  const days = Math.floor((Date.now() - d) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return days + " days ago";
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/* ── leaving one ─────────────────────────────────────── */
/* Held outside the view so tapping a star does not have to survive a repaint
   of the whole screen — the stars are redrawn on their own. */
let RATING = { booking: null, stars: 0, words: "", name: "", saving: false };

function drawStars() {
  const box = document.getElementById("rateStars");
  if (!box) return;
  box.innerHTML = [1, 2, 3, 4, 5].map((i) => `
    <button class="starbtn" data-a="rate-star" data-n="${i}"
      aria-label="${i} star${i === 1 ? "" : "s"}"
      style="background:none;border:0;padding:6px 4px;cursor:pointer;color:${
        i <= RATING.stars ? "var(--pink)" : "currentColor"};${
        i <= RATING.stars ? "" : "opacity:.35"}">
      <svg viewBox="0 0 24 24" width="34" height="34"><path
        d="M12 3.6l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 17l-5.25 2.75 1-5.85L3.5 9.75l5.9-.85z"
        fill="${i <= RATING.stars ? "currentColor" : "none"}"
        stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
    </button>`).join("");
  const w = document.getElementById("rateWord");
  if (w) {
    w.textContent = ["", "Poor", "Not great", "Fine", "Good", "Excellent"][RATING.stars] || "";
  }
  const go = document.getElementById("rateSave");
  // Words are optional; stars are not. A review with no stars is not a review.
  if (go) go.disabled = !RATING.stars || RATING.saving;
}

function setStars(n) {
  RATING.stars = Number(n) || 0;
  drawStars();
}

function vReview(bookingId) {
  load(async () => {
    let mine = null, b = null;
    try {
      const [r, list] = await Promise.all([
        API.myReview(bookingId).catch(() => null),
        API.bookings(true).catch(() => []),
      ]);
      mine = r;
      b = (list || []).find((x) => x.id === bookingId);
    } catch (e) { /* the form still works; it just cannot prefill */ }

    if (b && b.status !== "released") {
      return fillHost(`<div class="pad"><div class="note warn"><div>
        <b>This appointment is not finished yet.</b> You can leave a review once
        the nail tech has scanned your code — that is the moment she gets paid,
        and it is what makes a review here impossible to fake.</div></div></div>`);
    }

    RATING = { booking: bookingId, stars: mine ? mine.stars : 0,
               words: (mine && mine.words) || "",
               name: (b && b.tech && b.tech.business_name) || "", saving: false };

    fillHost(`
      <div class="pad">
        <div class="card" style="display:block;text-align:center;padding:20px 16px">
          <div style="font-weight:800;font-size:17px">${
            RATING.name ? `How was ${esc(RATING.name)}?` : "How was it?"}</div>
          <div id="rateStars" style="display:flex;justify-content:center;margin-top:10px"></div>
          <div id="rateWord" class="tiny" style="font-weight:700;height:16px"></div>
        </div>
        <div class="lbl mt16">Anything you want to add?</div>
        <textarea id="rateWords" rows="4" maxlength="600"
          placeholder="Optional — what was good, what was not."
          style="width:100%">${esc(RATING.words)}</textarea>
        <div class="tiny faint" style="margin-top:6px">Your first name and the
          initial of your surname are shown with it. Nothing else.</div>
        <button class="btn mt16" id="rateSave" data-a="rate-save" disabled>${
          mine ? "Update my review" : "Post my review"}</button>
        ${mine ? `<div class="tiny faint" style="text-align:center;margin-top:10px">
          You reviewed this on ${esc(whenShort(mine.created_at))}. Saving replaces it.
        </div>` : ""}
      </div>`);
    drawStars();
  });
  return head("Rate your appointment", "Only you can see this screen") + host();
}

async function saveReview() {
  if (RATING.saving || !RATING.stars) return;
  const box = document.getElementById("rateWords");
  RATING.words = box ? box.value : "";
  RATING.saving = true; drawStars();
  try {
    await API.leaveReview(RATING.booking, RATING.stars, RATING.words);
  } catch (e) {
    RATING.saving = false; drawStars();
    return toast((e && e.message) || "That review could not be saved.");
  }
  RATING.saving = false;
  toast("Thank you — that helps the next person choose.");
  nav("bookings");
}

/* ── the nudge ───────────────────────────────────────
   Shown on the bookings screen for appointments that are finished and not yet
   rated. Not a popup, not on startup: it sits in the list she already came to
   look at, next to the appointment it is about. */
async function reviewNudge() {
  let list;
  try { list = await API.reviewable(); } catch (e) { return; }
  const slot = document.getElementById("rateNudge");
  if (!slot || !list || !list.length) return;
  const one = list[0];
  slot.innerHTML = `
    <button class="card row" data-a="rate-open" data-id="${esc(one.booking_id)}"
      style="width:100%">
      <div class="ic">${starSvg(1)}</div>
      <div style="flex:1;min-width:0;text-align:left">
        <div class="ttl">Rate ${esc(one.business_name || "your appointment")}</div>
        <div class="tiny sub">${list.length > 1
          ? `${list.length} appointments are waiting for a review`
          : "It takes one tap"}</div>
      </div>
      ${I.chev()}
    </button>`;
}
