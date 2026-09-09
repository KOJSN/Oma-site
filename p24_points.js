/* ══ O points ═════════════════════════════════════════
   The leaderboard, her own score, and her referral code.

   Everything on this screen comes from api_my_points and api_leaderboard.
   Nothing is computed here — a score worked out on the phone is a score
   that disagrees with the one the prize is paid against, and the phone
   is the copy she will screenshot.

   The rate, the prizes and the pair cap all arrive from the season row
   rather than being written into the app, so changing the prize is one
   UPDATE and not a rebuild.                                            */

let PTS = null, PBOARD = null, PROLE = "tech", PBUSY = false;

/* The share link carries the code, because reading six characters down a
   phone is how a referral quietly stops happening. Stashed at load and used
   to prefill the box — never applied on its own, since it has to be her
   choice and she has to be signed in for it to mean anything. */
try {
  const m = /[#&]r=([A-Za-z0-9]+)/.exec(location.hash || "");
  if (m) localStorage.setItem("oma-ref", m[1].toUpperCase());
} catch (e) { /* private mode */ }
function pendingRef() {
  try { return localStorage.getItem("oma-ref") || ""; } catch (e) { return ""; }
}

function naira(kobo) {
  if (kobo == null) return "—";
  return "₦" + Math.round(kobo / 100).toLocaleString("en");
}
function longDate(iso) {
  if (!iso) return "soon";
  const d = new Date(iso);
  if (isNaN(d)) return "soon";
  return d.toLocaleDateString("en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}
function daysLeft(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86400000));
}

async function loadPoints() {
  if (PBUSY) return;
  PBUSY = true;
  try {
    PTS = await API.myPoints();
    PBOARD = await API.leaderboard(PROLE, 20);
  } catch (e) {
    PTS = PTS || { error: e.message };
  }
  PBUSY = false;
  if (ROUTE.v === "points") paint();
}

function codeCard(p) {
  return `
      <!-- ── the referral code ── -->
      <div class="seehead" style="padding-left:0;padding-right:0"><h3>Your code</h3></div>
      ${p.code ? `
        <div class="card" style="text-align:center;padding:18px">
          <div style="font-size:30px;font-weight:800;letter-spacing:.14em;
                      font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(p.code)}</div>
          <div class="small sub" style="margin-top:8px">
            They get <b>0.1</b>, you get <b>0.3</b> — when they finish their
            first booking, not when they sign up.</div>
        </div>
        <div class="btnrow mt12">
          <button class="btn sm" data-a="shareCode">${I.share()} Share</button>
          <button class="btn sm ghost" data-a="copyCode">Copy</button>
        </div>
        ${p.referrals ? `<div class="small sub" style="margin-top:10px;text-align:center">
          <b>${p.referrals}</b> ${p.referrals === 1 ? "person has" : "people have"}
          joined on your code and booked.</div>` : ""}
      ` : `
        <button class="btn mt8" data-a="makeCode">Get my code</button>
      `}

      ${p.can_use_code ? `
      <div class="card mt16">
        <div style="font-size:15px;font-weight:700">Someone gave you a code?</div>
        <div class="small sub" style="margin-top:4px;margin-bottom:10px">
          One code, once, and only before your first booking — so make it
          the right one.</div>
        <div class="btnrow">
          <input id="fRefCode" placeholder="ABC123" autocapitalize="characters"
                 value="${esc(pendingRef())}"
                 maxlength="12" style="flex:1;text-transform:uppercase;
                 letter-spacing:.1em;font-family:ui-monospace,Menlo,monospace">
          <button class="btn sm" data-a="useCode">Use it</button>
        </div>
      </div>` : ""}`;
}

function vPoints() {
  // First paint has nothing yet; the fetch repaints when it lands.
  if (!PTS) { loadPoints(); }
  const p = PTS || {};
  const live = !!p.season;
  const left = daysLeft(p.ends_at);
  const board = PBOARD || [];

  return `
  ${head("O points")}
  <div class="pad">

    ${!live ? (p.next_season ? `
      <!-- The gathering year. She is here before anybody has heard of Oma,
           and that is exactly the person the board is meant to keep. Telling
           her a date is a reason to still be here on it; "no competition at
           the moment" is a reason to leave. -->
      <div class="card" style="background:var(--grad);color:#fff;padding:22px 20px">
        <div class="eyebrow" style="color:rgba(255,255,255,.85)">Coming</div>
        <div style="font-size:26px;font-weight:800;letter-spacing:-.035em;
                    line-height:1.15;margin-top:6px">${esc(p.next_season)}</div>
        <div style="margin-top:8px;font-size:14px;opacity:.92">Starts ${
          longDate(p.next_starts_at)}${(() => {
            const d = daysLeft(p.next_starts_at);
            return d == null ? "" : ` · ${d} day${d === 1 ? "" : "s"} away`;
          })()}</div>
      </div>

      ${(p.next_tech_prize_kobo > 0 || p.next_customer_prize_kobo > 0) ? `
      <div class="grid2 mt12">
        <div class="tile"><div class="k">Top nail tech</div>
          <div class="v">${naira(p.next_tech_prize_kobo)}</div></div>
        <div class="tile"><div class="k">Top customer</div>
          <div class="v">${naira(p.next_customer_prize_kobo)}</div></div>
      </div>` : ""}

      <div class="note mt16">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.1"/></svg>
        <div><b>Nothing counts yet.</b> Work you do before the start does not
          score — the board opens with everybody on nothing, so somebody who
          joins in January is not already behind.</div>
      </div>

      <div class="small sub" style="margin-top:16px;line-height:1.55">
        1 O point will be ${naira(p.per_point)} of work. Your code works
        already — someone who joins on it now still pays out when they book
        once the season opens.
      </div>

      ${codeCard(p)}`
    : `
      <div class="empty" style="margin-top:8px">
        <b>No season running</b>
        There is no competition open at the moment. When one starts, every
        booking you complete starts counting toward it.
      </div>`)
    : `
      <!-- her own standing. The place is deliberately quieter than the
           score: the score is a fact about her work, the place is a fact
           about everybody else's and it moves while she is asleep. -->
      <div class="card" style="background:var(--grad);color:#fff;padding:22px 20px">
        <div class="eyebrow" style="color:rgba(255,255,255,.85)">${esc(p.season)}${
          left != null ? ` · ${left} day${left === 1 ? "" : "s"} left` : ""}</div>
        <div style="display:flex;align-items:flex-end;gap:14px;margin-top:8px">
          <div style="font-size:44px;font-weight:800;letter-spacing:-.045em;line-height:1">${
            Number(p.points || 0).toLocaleString("en", { maximumFractionDigits: 2 })}</div>
          <div style="font-size:15px;font-weight:700;padding-bottom:7px;opacity:.9">
            O point${Number(p.points) === 1 ? "" : "s"}</div>
        </div>
        <div style="margin-top:6px;font-size:13.5px;opacity:.9">${
          p.place ? `You are <b>#${p.place}</b> among ${
            p.role === "tech" ? "nail techs" : "customers"}`
          : "Complete a booking and you are on the board"}</div>
      </div>

      <div class="note mt16">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.1"/></svg>
        <div><b>1 O point = ${naira(p.per_point)} of work.</b> ${
          p.role === "tech"
            ? "Counted on the services you did, never on travel or the call-out."
            : "Counted on the services you booked, never on travel."}
          Points land when the appointment is scanned, and come back off if it
          is refunded.</div>
      </div>

      ${(p.tech_prize_kobo > 0 || p.customer_prize_kobo > 0) ? `
      <div class="grid2 mt12">
        <div class="tile"><div class="k">Top nail tech</div>
          <div class="v">${naira(p.tech_prize_kobo)}</div></div>
        <div class="tile"><div class="k">Top customer</div>
          <div class="v">${naira(p.customer_prize_kobo)}</div></div>
      </div>` : ""}

      ${codeCard(p)}

      <!-- ── the board ── -->
      <div class="seehead" style="padding-left:0;padding-right:0"><h3>The board</h3></div>
      <div class="tabs2 mb12">
        <button data-a="pboard" data-id="tech"${
          PROLE === "tech" ? ' class="on"' : ""}>Nail techs</button>
        <button data-a="pboard" data-id="customer"${
          PROLE === "customer" ? ' class="on"' : ""}>Customers</button>
      </div>

      ${board.length ? `
      <div class="stack gap8">
        ${board.map((r) => `
          <div class="prow${r.is_me ? " me" : ""}">
            <span class="pplace">${r.place}</span>
            <span class="pname">${esc(r.label)}${r.is_me ? " · you" : ""}</span>
            <span class="ppts">${Number(r.points).toLocaleString("en",
              { maximumFractionDigits: 2 })}</span>
          </div>
          <!-- How many DIFFERENT people that score came from. A big total
               from one person is what collusion looks like, and it belongs
               beside the score rather than being noticed after a prize has
               been paid. -->
          <div class="small faint" style="margin:-4px 0 4px 46px">${
            r.partners} ${r.partners === 1 ? "person" : "people"}</div>`).join("")}
      </div>`
      : `<div class="empty"><b>Nobody has scored yet</b>
           The first completed booking of the season puts somebody here.</div>`}

      <div class="small sub" style="margin-top:16px;line-height:1.55">
        Only appointments that were actually scanned count, and a booking
        between the same two people stops counting past ${
          p.pair_cap || 10} points — so the board rewards being busy with
        many people rather than one.
      </div>
    `}
  </div>
  <div style="height:24px"></div>`;
}
