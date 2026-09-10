/* ══ 14 more ═════════════════════════════════════════
   This was "Profile": a page that showed her own face back to her, then
   buried Settings behind a cog in the corner and the leaderboard three
   taps deep. Nobody opens an app to look at themselves. They open this
   tab to GET somewhere, so it is now a list of destinations and nothing
   else — every row one tap from the tab bar.                            */
function vMore() {
  const me = DB.me || {};
  const tech = DB.role === "tech";
  const row = (v, icon, label, note) => `
    <button data-a="go" data-v="${v}">
      <span class="ic">${icon}</span>
      <span style="flex:1;min-width:0">${label}${note
        ? `<span class="tiny sub" style="display:block;font-weight:600;margin-top:1px">${note}</span>` : ""}</span>
      ${I.chev()}</button>`;

  return `
  <div class="topbar"><h2>More</h2></div>
  <div class="pad mt16">

    ${API.signedIn() ? "" : `<div class="menu" style="margin-bottom:14px">
      ${row("signin", I.user(), "Sign in to book and pay")}
    </div>`}

    <div class="menu" style="margin-bottom:14px">
      ${row("editme", I.user(), "Profile",
            esc([me.name, me.area].filter(Boolean).join(" · ") || "Add your name and area"))}
      ${row("points", I.trophy(), "Leaderboard", "O points, the board and your code")}
      ${row("history", I.scan().replace(/#fff/g, "currentColor"), "Your scans",
            DB.scans.length ? DB.scans.length + " scan" + (DB.scans.length === 1 ? "" : "s") : "No scans yet")}
    </div>

    <div class="menu" style="margin-bottom:14px">
      ${tech ? `
        ${row("scanner", I.tick(16), "Scan a client's code")}
        ${row("wallet", I.cal(), "Earnings and withdrawals")}
        ${row("kyc", I.user(), "Verify your identity")}`
      : row("nearby", I.shop(), "Nail techs near me")}
    </div>

    <div class="menu">
      <button data-a="theme"><span class="ic">${I.moon()}</span>
        <span style="flex:1">Dark mode</span>
        <span class="switch ${isDark() ? "on" : ""}"><i></i></span></button>
      <button data-a="switchRole"><span class="ic">${I.shop()}</span>
        <span style="flex:1">${tech ? "Switch to a customer account"
                                    : "Switch to a nail tech account"}</span>${I.chev()}</button>
      ${row("settings", I.cog(), "Settings")}
    </div>
  </div>
  <div style="height:20px"></div>`;
}


/* ══ 14b closing the account ═════════════════════════════════════════
   App Store Review Guideline 5.1.1(v): an app that lets you make an
   account must let you delete it from inside the app. Oma had "erase
   everything on this device", which clears this phone and touches the
   account not at all.

   Two things this screen refuses to do. It does not hide the button
   behind an email to support, and it does not pretend the account is
   gone while money is still in escrow. Both are ways of saying no while
   appearing to say yes.                                              */
let CLOSE_BLOCKERS = null, CLOSE_BUSY = false;

async function loadCloseBlockers() {
  try { CLOSE_BLOCKERS = await API.accountBlockers(); }
  catch (e) { CLOSE_BLOCKERS = { error: e.message }; }
  if (ROUTE.v === "closeacct") paint();
}

function vCloseAccount() {
  if (!CLOSE_BLOCKERS) { loadCloseBlockers(); }
  const b = CLOSE_BLOCKERS || {};
  const n = (k) => Number(b[k] || 0);
  // Both forms written out. Appending "s" to the end of a phrase gives
  // "2 appointment you have been paid for but not yet dones", which is what
  // it did before somebody read it.
  const stop = [];
  const add = (k, one, many, fix) => { const c = n(k); if (c) stop.push([c, c === 1 ? one : many, fix]); };
  add("jobs_in_escrow",
      "appointment you have been paid for but not yet done",
      "appointments you have been paid for but not yet done",
      "Scan the client's code when you finish, and the money is yours.");
  add("bookings_in_escrow",
      "appointment you have paid for", "appointments you have paid for",
      "Let it finish, or cancel it and take the refund.");
  add("disputes",
      "appointment under dispute", "appointments under dispute",
      "Someone is looking at it. Deleting your account now would end the case with no one to answer for it.");
  add("payouts_pending",
      "withdrawal still going through", "withdrawals still going through",
      "Wait for it to land in your bank.");
  const money = n("wallet_kobo");

  return `
  ${head("Delete my account")}
  <div class="pad">

    ${b.error ? `<div class="note warn"><div>${esc(b.error)}</div></div>` : ""}

    ${(stop.length || money > 0) ? `
      <div class="note warn">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8v5M12 16v.1M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        <div><b>Not yet — there is money in the middle.</b>
          Deleting your account now would leave it with nobody to pay it to.</div>
      </div>
      <div class="stack gap10 mt16">
        ${money > 0 ? `<div class="card">
          <div style="font-size:15px;font-weight:800">${kobo(money)} in your wallet</div>
          <div class="small sub" style="margin-top:4px">Withdraw it first. It is yours,
            and it does not come back after the account is gone.</div></div>` : ""}
        ${stop.map(([c, what, fix]) => `<div class="card">
          <div style="font-size:15px;font-weight:800">${c} ${esc(what)}</div>
          <div class="small sub" style="margin-top:4px">${esc(fix)}</div></div>`).join("")}
      </div>
      <div class="small sub" style="margin-top:16px;line-height:1.55">
        Finish these and come back — the delete button appears once nothing is
        outstanding. Signing out works either way, and does not delete anything.
      </div>`
    : `
      <div class="note">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.1"/></svg>
        <div><b>This cannot be undone.</b> You will be signed out and will not be
          able to sign back in with this address.</div>
      </div>

      <div class="seehead" style="padding-left:0;padding-right:0"><h3>What goes</h3></div>
      <div class="menu">
        <div class="r"><span style="flex:1">Your name, email, phone and area</span></div>
        <div class="r"><span style="flex:1">Your listing, and it leaves search at once</span></div>
        <div class="r"><span style="flex:1">Your saved scans on this phone</span></div>
        <div class="r"><span style="flex:1">Notifications to your devices</span></div>
        <div class="r"><span style="flex:1">Your referral code and O points</span></div>
      </div>

      <div class="seehead" style="padding-left:0;padding-right:0"><h3>What stays</h3></div>
      <div class="menu">
        <div class="r"><span style="flex:1">Past appointments, with your name removed</span></div>
      </div>
      <div class="small sub" style="margin-top:10px;line-height:1.55">
        An appointment has two people in it. Deleting yours entirely would delete
        a nail tech's record of work she was paid for, so what is left carries no
        name, no address and no way back to you.
      </div>

      <div class="card mt20">
        <div style="font-size:15px;font-weight:700">Type <b>DELETE</b> to confirm</div>
        <div class="small sub" style="margin-top:4px;margin-bottom:10px">
          Deliberately awkward. This is the one button in Oma that cannot be undone.</div>
        <input id="fDelConfirm" placeholder="DELETE" autocapitalize="characters"
               maxlength="10" style="width:100%;text-transform:uppercase;letter-spacing:.14em;
               font-family:ui-monospace,Menlo,monospace">
      </div>
      <button class="btn danger mt12" data-a="doDelete"${CLOSE_BUSY ? " disabled" : ""}>
        ${CLOSE_BUSY ? "Deleting…" : "Delete my account for ever"}</button>`}
  </div>
  <div style="height:24px"></div>`;
}

/* ══ 15 scan history ═════════════════════════════════
   The design put a "nail strength +18%" chart here. Nothing in the pipeline
   measures nail strength, so this plots the one thing that was measured —
   the bed ratio of each scan, with its uncertainty band drawn on.        */
function vHistory() {
  const s = DB.scans.slice().reverse().filter(x => x.bed);
  const vals = s.map(x => x.bed);
  const lo = Math.min(...vals, 1), hi = Math.max(...vals, 1.4);
  return `
  ${head("Scan history", DB.scans.length + " scan" + (DB.scans.length === 1 ? "" : "s"))}
  ${s.length > 1 ? `<div class="pad">
    <div class="tile" style="border-radius:20px;padding:16px">
      <div class="rowbetween" style="align-items:baseline">
        <div style="font-size:13px;font-weight:700">Nail bed, length ÷ width</div>
        <div class="tag grey">${s.length} readings</div>
      </div>
      <div class="bars">
        ${s.map((x, i) => {
          const h = Math.max(12, ((x.bed - lo) / Math.max(0.001, hi - lo)) * 78 + 14);
          return `<div class="b ${i === s.length - 1 ? "now" : ""}">
            <i style="height:${Math.min(100, h)}%"></i>
            <span>${esc(when(x.ts))}</span></div>`;
        }).join("")}
      </div>
      <div class="tiny sub" style="margin-top:10px;line-height:1.5">
        Each bar is one scan's mean bed ratio. They move by measurement error as much as by
        anything real — the band on a single scan is ±0.11 at best, so read the trend, not the step.
      </div>
    </div>
  </div>` : ""}
  <div class="pad stack gap10 mt16">
    ${DB.scans.map((sc, i) => `
      <button class="card tap ${i === 0 ? "sel" : ""}" data-a="scan" data-id="${esc(sc.id)}"
          style="display:flex;gap:14px;align-items:center">
        <span class="thumb ${i === 0 ? "pink" : ""}" style="width:54px;height:54px;border-radius:17px">
          ${shapeSVG(sc.shape, 22, 33, i === 0 ? "var(--pink)" : "var(--sub)", i === 0 ? "var(--tint2)" : "var(--fill2)")}</span>
        <span style="flex:1;min-width:0">
          <span style="display:flex;align-items:center;gap:7px">
            <b style="font-size:16.5px;letter-spacing:-.02em">${esc(sc.label)}</b>
            ${i === 0 ? `<span class="tag" style="font-size:10.5px">CURRENT</span>` : ""}</span>
          <span class="small sub" style="display:block;margin-top:3px">${esc(when(sc.ts))}${sc.words ? " · " + esc(String(sc.words).toLowerCase()) : ""}${sc.counted < 4 ? " · " + sc.counted + " of 4 nails" : ""}</span>
        </span>
        <span style="text-align:right">
          <span style="display:block;font-size:16px;font-weight:800;color:${i === 0 ? "var(--pink)" : "var(--sub)"}">${sc.fit}%</span>
          <span class="tiny sub" style="font-weight:600">fit</span></span>
      </button>`).join("")}
  </div>
  <div class="small faint" style="text-align:center;margin:16px 20px;line-height:1.5">
    Scans stay on this phone. Nothing is uploaded, and clearing your browser data deletes them.</div>`;
}

function vScan(id) {
  const sc = DB.scans.find(x => x.id === id);
  if (!sc) return vHistory();
  return `
  ${head(sc.label + " scan", dayLabel(sc.ts) + " · " + hhmm(sc.ts),
    `<button class="iconbtn" data-a="delScan" data-id="${esc(sc.id)}" aria-label="Delete">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>`)}
  <div class="pad">
    <div class="card" style="display:flex;align-items:center;gap:18px;background:var(--grad);border:0;color:#fff">
      <span class="shapeart" style="width:78px;height:78px;border-radius:26px">${shapeSVG(sc.shape, 36, 54, "#fff", "rgba(255,255,255,.25)")}</span>
      <span>
        <span class="eyebrow" style="color:rgba(255,255,255,.85);display:block">${sc.fallback ? "Best available" : "Best match"}</span>
        <span style="display:block;font-size:30px;font-weight:800;letter-spacing:-.035em;line-height:1.1;margin-top:3px">${esc(sc.label)}</span>
        <span style="display:inline-flex;align-items:center;gap:6px;margin-top:7px;background:rgba(255,255,255,.2);
          padding:5px 11px;border-radius:99px;font-size:12.5px;font-weight:700">${sc.fit}% fit</span>
      </span>
    </div>
    <div class="grid2 mt16">
      <div class="tile"><div class="k">Nail bed</div><div class="v">${esc(sc.words || "—")}</div></div>
      <div class="tile"><div class="k">Fingers</div><div class="v">${esc(sc.fingers)}</div></div>
      <div class="tile"><div class="k">Also works</div><div class="v">${sc.alts.length ? esc(sc.alts.join(", ")) : "—"}</div></div>
      <div class="tile"><div class="k">Go easy on</div><div class="v">${sc.avoid.length ? esc(sc.avoid.join(", ")) : "—"}</div></div>
    </div>
    <div class="note pink mt16">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.4"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2"/></svg>
      <div>${esc(sc.note)}</div>
    </div>
    ${sc.bed ? `<div class="menu mt16">
      <div class="r"><span style="flex:1">Nail bed, length ÷ width</span><b>${sc.bed.toFixed(2)}</b></div>
      <div class="r"><span style="flex:1">Realistic range</span><b>${(sc.bed - sc.sigma).toFixed(2)} – ${(sc.bed + sc.sigma).toFixed(2)}</b></div>
      <div class="r"><span style="flex:1">Nails read</span><b>${sc.counted} of 4</b></div>
      <div class="r"><span style="flex:1">Outlines you corrected</span><b>${sc.counted - sc.auto} of ${sc.counted}</b></div>
      ${sc.mm ? `<div class="r"><span style="flex:1">Nail bed, actual size</span><b>${sc.mm.len} × ${sc.mm.wid} mm</b></div>` : ""}
    </div>` : ""}
    ${sc.sheet ? `<div class="note pink mt16">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2.4" stroke-linecap="round"><path d="M5 13l4 4 10-10"/></svg>
      <div>Taken on the guide sheet — flattened to a straight-down view before measuring, and
      sized against the printed squares to ${sc.sheet.err} mm.</div></div>` : ""}
    ${sc.reasons && sc.reasons.length ? `
      <div class="seehead" style="padding-left:0;padding-right:0"><h3>Why</h3></div>
      <div class="stack gap10">${sc.reasons.map(r => `<div class="card" style="display:flex;gap:11px;align-items:flex-start">
        <span class="tag ${r.p === "measured" ? "" : "grey"}" style="flex:none">${esc(r.p)}</span>
        <span class="small sub" style="line-height:1.5">${esc(r.t)}</span></div>`).join("")}</div>` : ""}
    <button class="btn mt20" data-a="find-for" data-v="${esc(sc.shape)}">Find a tech for ${esc(sc.label.toLowerCase())} ${I.arrow()}</button>
  </div>
  <div style="height:20px"></div>`;
}

/* ══ your details, and settings ══════════════════════ */
function vEditMe() {
  const m = DB.me || {};
  return `
  ${head("Your details")}
  <div class="pad">
    <label class="field"><span class="lab">Your name</span>
      <span class="inp"><input id="fName" value="${esc(m.name || "")}" placeholder="Your name"></span></label>
    <label class="field"><span class="lab">Your area</span>
      <span class="inp"><input id="fArea" value="${esc(m.area || "")}" placeholder="Lekki, Lagos"></span></label>
    <div class="tiny faint" style="margin:-8px 0 16px">A label for your bookings.
      How far away a tech is comes from your phone each time you search.</div>
    <button class="btn" data-a="saveMe" data-back="1">Save</button>
  </div>`;
}
function vSettings() {
  return `
  ${head("Settings")}
  <div class="pad">
    <div class="menu">
      <button data-a="theme"><span class="ic">${I.moon()}</span><span style="flex:1">Dark mode</span>
        <span class="switch ${isDark() ? "on" : ""}"><i></i></span></button>
      ${pushRow()}
      <button data-a="switchRole"><span class="ic">${I.shop()}</span>
        <span style="flex:1">Use Oma as a ${DB.role === "tech" ? "customer" : "nail tech"}</span>${I.chev()}</button>
      <button data-a="go" data-v="points"><span class="ic">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M6 4h12v5a6 6 0 0 1-12 0V4ZM18 5h2a2 2 0 0 1 0 4h-2M6 5H4a2 2 0 0 0 0 4h2"/></svg></span>
        <span style="flex:1">O points and the board</span>${I.chev()}</button>
      <button data-a="go" data-v="sheet"><span class="ic">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9V4h12v5M6 18h12v-5H6v5ZM6 13H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/></svg></span>
        <span style="flex:1">Print the guide sheet</span>${I.chev()}</button>
      ${API.hasBuiltIn() ? `
      <!-- The app ships knowing its own backend, so this is a switch and not a
           form. Asking a nail tech to paste a project URL and a key was the
           step that quietly kept three real accounts on the practice version. -->
      <button data-a="practice"><span class="ic">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg></span>
        <span style="flex:1">Practice mode<span class="tiny faint" style="display:block">${
          API.practice()
            ? "Nothing leaves this phone"
            : "Off — you are on the real Oma"}</span></span>
        <span class="switch ${API.practice() ? "on" : ""}"><i></i></span></button>`
      : `
      <button data-a="go" data-v="backend"><span class="ic">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg></span>
        <span style="flex:1">Connect to your backend</span>
        <span class="tiny ${API.live() ? "" : "faint"}" style="margin-right:6px">${
          API.live() ? "Live" : "Practice"}</span>${I.chev()}</button>`}
      ${API.signedIn() ? `<button data-a="signout"><span class="ic">${I.user()}</span>
        <span style="flex:1">Sign out${DB.me && DB.me.email
          ? ` · ${esc(DB.me.email)}` : ""}</span>${I.chev()}</button>` : ""}
      <button data-a="export"><span class="ic">${I.chart()}</span>
        <span style="flex:1">Export my scans as JSON</span>${I.chev()}</button>
      <button data-a="wipe"><span class="ic">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></span>
        <span style="flex:1">Erase everything on this device</span>${I.chev()}</button>
      ${/* Two different things, deliberately next to each other. The one above
            clears this phone. This one ends the account everywhere — Apple
            requires it be reachable from inside the app, and it is the honest
            counterpart to a service that holds your money. */
        API.signedIn() ? `
      <button data-a="go" data-v="closeacct"><span class="ic">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--bad)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg></span>
        <span style="flex:1;color:var(--bad)">Delete my Oma account</span>${I.chev()}</button>` : ""}
    </div>
    <div class="note mt20">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-3.5 7-9V6l-7-3-7 3v6c0 5.5 7 9 7 9Z"/></svg>
      <div>${API.live()
        ? `Your <b>scan photos</b> are still measured in this page and never leave it — that
           does not change. Bookings, payments and your profile now live in your Supabase
           project, which is why they follow you to another phone.`
        : `Oma has no account and no server. Your photos are measured in the page and never
           leave it; your scans, techs and bookings live in this browser's storage only.
           Clearing site data erases them, and nothing syncs to another phone.`}</div>
    </div>
    <div class="tiny faint" style="text-align:center;margin-top:18px;line-height:1.6">
      Ruleset ${esc(RULES.version || "—")} · thresholds are salon convention, not calibrated
      measurement.<br>Detector mean error 0.25 against hand-annotated ground truth on eight hands.
      <!-- The build id, on screen on purpose. Twice now a bug has been chased that
           was already fixed, because the phone was quietly running an older
           app.html behind a stale service worker and there was no way to tell by
           looking. Now there is: this line and the first line of /sw.js must
           match, and if they do not, the upload is the problem, not the code. -->
      <br>Build <b>${esc(BUILD_ID)}</b>
    </div>
  </div>
  <div style="height:20px"></div>`;
}

/* ══ 16 the tech's side ══════════════════════════════ */
function vRequests() {
  const b = DB.biz;
  if (!b || !b.name) return vSetup(false);
  const week = DB.jobs.filter(j => j.status === "accepted" &&
    j.at > Date.now() - 7 * 864e5 && j.at < Date.now() + 7 * 864e5);
  const earned = week.reduce((a, j) => a + (+j.total || 0), 0);
  const nu = DB.jobs.filter(j => j.status === "new");
  return `
  <div class="topbar">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="avatar sq" style="width:44px;height:44px;border-radius:15px">${esc(initials(b.name))}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:16.5px;font-weight:800;letter-spacing:-.025em">${esc(b.name)}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:2px">
          <span style="width:7px;height:7px;border-radius:50%;background:var(--good)"></span>
          <span class="small sub" style="font-weight:600">Listing ready · ${esc(b.area || "no area set")}</span>
        </div>
      </div>
      <button class="iconbtn" data-a="shareMine" aria-label="Share my listing">${I.share()}</button>
    </div>
    <div class="hero mt16" style="padding:18px">
      <div class="eyebrow" style="color:rgba(255,255,255,.85)">Accepted this week</div>
      <div style="font-size:32px;font-weight:800;letter-spacing:-.035em;margin-top:4px">${esc(b.cur || DB.cur)}${earned.toLocaleString("en")}</div>
      <div style="display:flex;gap:18px;margin-top:12px">
        <div><div style="font-size:16px;font-weight:800">${week.length}</div>
          <div class="tiny" style="font-weight:600;opacity:.85">Appointments</div></div>
        <div><div style="font-size:16px;font-weight:800">${nu.length}</div>
          <div class="tiny" style="font-weight:600;opacity:.85">New requests</div></div>
        <div><div style="font-size:16px;font-weight:800">${(b.services || []).length}</div>
          <div class="tiny" style="font-weight:600;opacity:.85">Services</div></div>
      </div>
    </div>
  </div>

  <div class="seehead"><h3>Booking requests</h3>
    <button class="tag" data-a="pasteReq">+ Paste a request</button></div>
  <div class="pad stack gap12">
    ${nu.length ? nu.map(j => jobCard(j, b)).join("") : `<div class="empty">
      <div class="ic">${I.inbox()}</div><b>No new requests</b>
      A customer's booking message carries a short <b>oma:</b> code. Paste the whole WhatsApp
      message here and it becomes a request card — her services, her time and her nail scan.
      <div style="margin-top:14px"><button class="btn sm ghost" data-a="pasteReq">Paste a message</button></div>
    </div>`}
  </div>
  <div style="height:16px"></div>`;
}
function jobCard(j, b) {
  return `<div class="card">
    <div style="display:flex;align-items:center;gap:12px">
      <span class="thumb" style="width:42px;height:42px;border-radius:50%">${esc(initials(j.who))}</span>
      <span style="flex:1;min-width:0">
        <span style="display:block;font-size:14.5px;font-weight:700">${esc(j.who)}</span>
        <span class="small sub" style="display:block;margin-top:1px">${j.svc.map(s => esc(s.n)).join(" + ")} · ${esc(b.cur || DB.cur)}${Number(j.total).toLocaleString("en")}</span>
      </span>
      <span style="text-align:right">
        <span style="display:block;font-size:12.5px;font-weight:800">${dayLabel(j.at).slice(0, 6)}</span>
        <span class="small sub" style="font-weight:600">${hhmm(j.at)}</span></span>
    </div>
    ${j.shape ? `<div style="margin-top:11px;display:flex;align-items:center;gap:8px;background:var(--tint);
        border-radius:13px;padding:9px 11px">
      ${shapeSVG(j.shape, 13, 20, "var(--pink)", "none")}
      <span class="small" style="font-weight:600">Scan: ${esc(j.shape)}${j.bed ? " · bed " + Number(j.bed).toFixed(2) : ""}</span>
    </div>` : ""}
    ${j.note ? `<div class="small sub" style="margin-top:9px;line-height:1.5">“${esc(j.note)}”</div>` : ""}
    ${j.status === "new" ? `<div class="btnrow mt12">
      <button class="btn xs" data-a="job" data-id="${esc(j.id)}" data-s="accepted">${I.tick()} Accept</button>
      <button class="btn xs ghost" data-a="job" data-id="${esc(j.id)}" data-s="declined">Decline</button>
    </div>` : `<div class="mt12"><span class="tag ${j.status === "accepted" ? "good" : "grey"}"
      style="text-transform:capitalize">${esc(j.status)}</span></div>`}
  </div>`;
}
function vDiary() {
  const b = DB.biz || {};
  const up = DB.jobs.filter(j => j.status === "accepted" && j.at > Date.now() - 36e5)
    .sort((a, b2) => a.at - b2.at);
  const days = {};
  up.forEach(j => { const k = dayLabel(j.at); (days[k] = days[k] || []).push(j); });
  return `
  <div class="topbar"><h2>Diary</h2>
    <div class="small sub mt8">Everything you have accepted, in order.</div></div>
  <div class="pad stack gap16 mt16">
    ${Object.keys(days).length ? Object.keys(days).map(k => `
      <div><div class="eyebrow" style="margin-bottom:9px">${esc(k)}</div>
        <div class="stack gap10">${days[k].map(j => `
          <div class="card" style="display:flex;align-items:center;gap:12px">
            <span class="thumb pink" style="width:44px;height:44px;border-radius:14px;font-size:13px">${hhmm(j.at)}</span>
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:14.5px;font-weight:700">${esc(j.who)}</span>
              <span class="small sub" style="display:block">${j.svc.map(s => esc(s.n)).join(" + ")}${j.mins ? " · " + mins(j.mins) : ""}</span>
            </span>
            <span style="font-weight:800">${esc(b.cur || DB.cur)}${Number(j.total).toLocaleString("en")}</span>
          </div>`).join("")}</div></div>`).join("")
      : `<div class="empty"><div class="ic">${I.cal()}</div><b>Nothing in the diary</b>
         Accepted requests land here with the time, the services and the shape.</div>`}
  </div>
  <div style="height:16px"></div>`;
}
function vEarnings() {
  const b = DB.biz || {};
  const acc = DB.jobs.filter(j => j.status === "accepted");
  const now = new Date();
  const buckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nxt = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    buckets.push({
      m: MONTHS[d.getMonth()],
      v: acc.filter(j => j.at >= +d && j.at < +nxt).reduce((a, j) => a + (+j.total || 0), 0)
    });
  }
  const hi = Math.max(...buckets.map(x => x.v), 1);
  const total = acc.reduce((a, j) => a + (+j.total || 0), 0);
  return `
  <div class="topbar"><h2>Earnings</h2>
    <div class="small sub mt8">Totalled from the requests you accepted here. It is your own
      record, not a payment system — no money moves through Oma.</div></div>
  <div class="pad mt16">
    <div class="hero">
      <div class="eyebrow" style="color:rgba(255,255,255,.85)">Accepted, all time</div>
      <div style="font-size:32px;font-weight:800;letter-spacing:-.035em;margin-top:4px">${esc(b.cur || DB.cur)}${total.toLocaleString("en")}</div>
      <div class="small" style="opacity:.9;margin-top:6px;font-weight:600">${acc.length} appointment${acc.length === 1 ? "" : "s"}</div>
    </div>
    <div class="tile mt16" style="border-radius:20px;padding:16px">
      <div style="font-size:13px;font-weight:700">Last six months</div>
      <div class="bars">
        ${buckets.map((x, i) => `<div class="b ${i === buckets.length - 1 ? "now" : ""}">
          <i style="height:${Math.max(6, x.v / hi * 100)}%"></i><span>${x.m}</span></div>`).join("")}
      </div>
    </div>
    ${acc.length ? `<div class="menu mt16">${acc.slice().sort((a, b2) => b2.at - a.at).slice(0, 12).map(j =>
      `<div class="r"><span style="flex:1">${esc(j.who)}<br><span class="tiny sub">${dayLabel(j.at)}</span></span>
        <b>${esc(b.cur || DB.cur)}${Number(j.total).toLocaleString("en")}</b></div>`).join("")}</div>` : ""}
  </div>
  <div style="height:16px"></div>`;
}
function vListing() {
  const b = DB.biz;
  if (!b || !b.name) return vSetup(false);
  const link = shareLink(b);
  return `
  <div class="topbar">
    <div class="rowbetween"><h2>My listing</h2>
      <button class="iconbtn" data-a="go" data-v="editbiz" aria-label="Edit">${I.cog()}</button></div>
  </div>
  <div class="pad mt16">
    <div class="card" style="display:flex;align-items:center;gap:14px">
      <span class="avatar sq" style="width:56px;height:56px;border-radius:18px">${esc(initials(b.name))}</span>
      <span style="flex:1">
        <span style="display:block;font-size:16px;font-weight:800;letter-spacing:-.02em">${esc(b.name)}</span>
        <span class="small sub" style="display:block;margin-top:2px">${esc([b.address, b.area].filter(Boolean).join(", ") || "No address")}</span>
      </span>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <div class="tile" style="flex:1"><div class="k">From</div>
        <div class="v">${(() => {
          const lo = fromPrice(b.services);
          return lo === null ? "—" : esc(b.cur || DB.cur) + lo.toLocaleString("en");
        })()}</div></div>
      <div class="tile" style="flex:1"><div class="k">Services</div><div class="v">${(b.services || []).length}</div></div>
      <div class="tile" style="flex:1"><div class="k">Hours</div><div class="v">${esc(b.opens || "—")}–${esc(b.closes || "—")}</div></div>
    </div>

    <div class="seehead" style="padding-left:0;padding-right:0"><h3>Your link</h3></div>
    <div class="card" style="word-break:break-all;font-size:11.5px;color:var(--sub);font-weight:500;line-height:1.5">${esc(link)}</div>
    <div class="btnrow mt12">
      <button class="btn sm" data-a="shareMine">${I.share()} Share</button>
      <button class="btn sm ghost" data-a="copyLink">Copy</button>
    </div>
    <div class="note mt16">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8.2v.1"/></svg>
      <div>This link <b>is</b> your listing — the whole menu is packed inside it. Anyone who opens
        it sees you in their app. There is no directory, so a customer who has never met you
        cannot find you: send it the way you already send your number.</div>
    </div>

    <div class="seehead" style="padding-left:0;padding-right:0"><h3>Services</h3></div>
    <div class="stack gap10">
      ${(b.services || []).map(s => `<div class="card" style="display:flex;align-items:center;gap:12px;padding:13px">
        <div style="flex:1"><div style="font-size:14.5px;font-weight:700">${esc(s.n)}</div>
          <div class="small sub" style="margin-top:2px">${s.m ? mins(+s.m) : ""}${(s.sh || []).length ? " · " + esc((s.sh || []).join(", ")) : ""}</div></div>
        <div style="font-size:15px;font-weight:800">${esc(b.cur || DB.cur)}${Number(s.p || 0).toLocaleString("en")}</div>
      </div>`).join("") || `<div class="empty">No services yet — add them from the cog.</div>`}
    </div>
    <button class="btn ghost mt16" data-a="go" data-v="settings">Settings ${I.arrow()}</button>
  </div>
  <div style="height:16px"></div>`;
}
