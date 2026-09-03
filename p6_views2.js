/* ══ 05 home ═════════════════════════════════════════ */
function greet() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function vHome() {
  const me = DB.me || {};
  const last = DB.scans[0];
  const techs = sortedTechs().slice(0, 3);
  const next = DB.bookings.filter(b => b.at > Date.now() && b.status !== "cancelled")
    .sort((a, b) => a.at - b.at)[0];
  return `
  <div class="topbar">
    <div class="rowbetween">
      <div>
        <div class="small sub" style="font-weight:600">${greet()}</div>
        <div style="font-size:22px;font-weight:800;letter-spacing:-.03em;margin-top:1px">${esc((me.name || "there").split(" ")[0])}</div>
      </div>
      <button class="avatar" data-a="tab" data-v="profile">${esc(initials(me.name))}</button>
    </div>
    <label class="search mt16">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>
      <input id="qHome" placeholder="Search nail techs, services…" value="${esc(Q)}">
    </label>
  </div>

  <div class="pad mt16">
    <button class="hero" data-a="startscan">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="flex:1">
          <div class="eyebrow" style="color:rgba(255,255,255,.85)">Hand scan</div>
          <div style="font-size:19px;font-weight:800;letter-spacing:-.025em;line-height:1.25;margin-top:6px">
            Find the shape that suits your hands</div>
          <div style="margin-top:14px;display:inline-flex;align-items:center;gap:7px;background:#fff;
              color:#c22a66;font-size:13.5px;font-weight:700;padding:9px 15px;border-radius:99px">
            ${last ? "Scan again" : "Start scan"}
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>
          </div>
        </div>
        <div style="width:74px;height:74px;flex:none;border-radius:24px;background:rgba(255,255,255,.18);
            border:1px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M12 8.5c-1 1.4-1.5 2.7-1.5 4 0 1.5.7 2.4 1.5 2.4s1.5-.9 1.5-2.4c0-1.3-.5-2.6-1.5-4Z"/></svg>
        </div>
      </div>
    </button>
  </div>

  ${last ? `<div class="pad mt12">${scanCard(last)}</div>` : ""}
  ${next ? `<div class="pad mt12">${bookingRow(next, true)}</div>` : ""}

  <div class="seehead">
    <h3>Nail techs near you</h3>
    ${DB.techs.length > 3 ? `<span class="seeall" data-a="tab" data-v="salons">See all</span>` : ""}
  </div>
  <div class="pad stack gap10">
    ${techs.length ? techs.map(t => techRow(t)).join("") : emptyTechs()}
  </div>
  <div style="height:16px"></div>`;
}
function emptyTechs() {
  return `<div class="empty">
    <div class="ic">${I.pin()}</div>
    <b>No nail techs yet</b>
    A tech reaches you by sending their Oma link on WhatsApp. Open one and she lands here,
    services and prices included. There is no directory to browse — that is the honest limit
    of an app with no server.
    <div style="margin-top:14px"><button class="btn sm ghost" data-a="paste">Paste a tech's link</button></div>
  </div>`;
}

/* ══ 09 nail techs near you ══════════════════════════ */
let SORT = "near";
function vSalons() {
  let list = sortedTechs();
  if (Q) {
    const q = Q.toLowerCase();
    list = list.filter(t => (t.n + " " + t.a + " " + (t.s || []).map(s => s.n).join(" "))
      .toLowerCase().includes(q));
  }
  if (SORT === "cheap") {
    list = list.slice().sort((a, b) => lowest(a) - lowest(b));
  } else if (SORT === "shape" && DB.scans[0]) {
    const sh = DB.scans[0].shape;
    list = list.slice().sort((a, b) => doesShape(b, sh) - doesShape(a, sh));
  }
  return `
  <div class="topbar">
    <div class="rowbetween">
      <h2>Nail techs</h2>
      <button class="iconbtn" data-a="paste" aria-label="Paste a tech link">${I.plus()}</button>
    </div>
    <label class="search mt16">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>
      <input id="qSalons" placeholder="Name, area or service" value="${esc(Q)}">
    </label>
    <button class="btn ghost sm mt12" data-a="go" data-v="nearby" style="width:100%">
      ${I.pin ? I.pin(15) : ""} Nail techs near me — book and pay in the app</button>
    <div class="pills scroll mt12">
      <button class="pill ${SORT === "near" ? "on" : ""}" data-a="sort" data-v="near">Nearest</button>
      <button class="pill ${SORT === "cheap" ? "on" : ""}" data-a="sort" data-v="cheap">Lowest price</button>
      ${DB.scans[0] ? `<button class="pill ${SORT === "shape" ? "on" : ""}" data-a="sort" data-v="shape"
        style="text-transform:capitalize">${esc(DB.scans[0].shape)}</button>` : ""}
    </div>
  </div>
  ${DB.techs.length ? `<div class="pad mt16">${mapBox(list)}</div>` : ""}
  <div class="seehead"><h3>${list.length} nail tech${list.length === 1 ? "" : "s"}${myPos() ? " nearby" : ""}</h3></div>
  <div class="pad stack gap12">
    ${list.length ? list.map(t => techRow(t, true)).join("")
      : (DB.techs.length ? `<div class="empty"><b>Nothing matched</b>Try a shorter search.</div>` : emptyTechs())}
  </div>
  <div style="height:16px"></div>`;
}
function lowest(t) {
  const p = (t.s || []).map(s => +s.p).filter(n => n > 0);
  return p.length ? Math.min(...p) : Infinity;
}
function doesShape(t, sh) {
  return (t.s || []).some(s => (s.sh || []).includes(sh)) ? 1 : 0;
}
/* A map drawn from what is actually known: your point, their points, true
   bearings, true distances, a labelled scale. No tiles, no invented streets. */
function mapBox(list) {
  const me = myPos();
  const pinned = list.filter(t => t.ll);
  if (!me || !pinned.length) {
    return `<div class="mapbox" style="display:flex;align-items:center;justify-content:center;text-align:center;padding:24px">
      <div class="small sub" style="max-width:250px;line-height:1.5">
        ${me ? "None of your techs has pinned a location yet, so there is nothing to place on a map."
             : "Add your area with GPS in your profile and pinned techs appear here by distance and direction."}
      </div></div>`;
  }
  const ds = pinned.map(t => km(me, t.ll));
  const max = Math.max(...ds, 0.5);
  // Offsets in pixels, not percentages: the box is wider than it is tall, so
  // a percentage radius would draw an ellipse and quietly lie about direction.
  const R = 74;
  const pins = pinned.map((t, i) => {
    const d = ds[i] / max, th = bearing(me, t.ll);
    const x = Math.round(Math.sin(th) * d * R);
    const y = Math.round(-Math.cos(th) * d * R);
    const price = lowest(t);
    return `<div class="pin ${i === 0 ? "hot" : ""}"
        style="left:calc(50% + ${x}px);top:calc(50% + ${y}px)"
        data-a="tech" data-id="${esc(t.id)}">
      <span>${isFinite(price) ? esc(t.c || "₦") + Number(price).toLocaleString("en") : esc(t.n)}</span><i></i></div>`;
  }).join("");
  return `<div class="mapbox">
    <div class="ring" style="width:${R}px;height:${R}px"></div>
    <div class="ring" style="width:${R * 2}px;height:${R * 2}px"></div>
    ${pins}
    <div class="me" title="You"></div>
    <div class="scale">outer ring ≈ ${max < 1 ? Math.round(max * 1000) + " m" : max.toFixed(1) + " km"}</div>
  </div>`;
}

/* ══ 10 a tech's page ════════════════════════════════ */
function vTech(id) {
  const t = DB.techs.find(x => x.id === id);
  if (!t) return `<div class="pad mt20">${head("Not found")}<div class="empty">That tech is no longer saved.</div></div>`;
  const d = distText(t);
  const sh = DB.scans[0] && DB.scans[0].shape;
  const good = sh ? (t.s || []).filter(s => (s.sh || []).includes(sh)).length : 0;
  const lo = lowest(t);
  return `
  <div style="position:relative">
    <div style="height:190px;background:linear-gradient(150deg,var(--ph2),var(--ph1))"></div>
    <div style="position:absolute;left:0;right:0;top:0;padding:calc(14px + env(safe-area-inset-top)) 20px 0;
        display:flex;align-items:center;justify-content:space-between">
      <button class="iconbtn ghost" data-a="back">${I.back()}</button>
      <button class="iconbtn ghost" data-a="shareTech" data-id="${esc(t.id)}">${I.share()}</button>
    </div>
  </div>
  <div style="position:relative;margin-top:-28px;background:var(--card);border-radius:28px 28px 0 0;padding:0 20px 20px">
    <div style="display:flex;align-items:flex-end;gap:14px;padding-top:0;margin-top:-38px">
      <div class="avatar sq" style="width:76px;height:76px;border-radius:24px;font-size:22px;
          border:4px solid var(--card);box-shadow:var(--card-shadow)">${esc(initials(t.n))}</div>
      <div style="padding-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${t.y ? `<span class="tag grey">${esc(t.y)} yrs</span>` : ""}
        ${good ? `<span class="tag good">${I.tick(12)} does ${esc(sh)}</span>` : ""}
      </div>
    </div>
    <h2 style="font-size:22px;margin-top:12px">${esc(t.n)}</h2>
    <div style="display:flex;align-items:center;gap:6px;margin-top:5px;color:var(--sub)">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>
      <span class="small">${esc([t.ad, t.a].filter(Boolean).join(", ") || "Area not given")}${d ? " · " + d : ""}</span>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <div class="tile" style="flex:1;border-radius:16px;padding:11px 12px">
        <div class="v" style="font-size:15px">${isFinite(lo) ? esc(t.c || "₦") + Number(lo).toLocaleString("en") + "+" : "—"}</div>
        <div class="tiny sub" style="font-weight:600;margin-top:1px">Per service</div></div>
      <div class="tile" style="flex:1;border-radius:16px;padding:11px 12px">
        <div class="v" style="font-size:15px">${(t.s || []).length}</div>
        <div class="tiny sub" style="font-weight:600;margin-top:1px">Services</div></div>
      <div class="tile" style="flex:1;border-radius:16px;padding:11px 12px">
        <div class="v" style="font-size:15px">${t.o && t.cl ? esc(t.o) + "–" + esc(t.cl) : "—"}</div>
        <div class="tiny sub" style="font-weight:600;margin-top:1px">Hours</div></div>
    </div>

    ${sh && good ? `<div class="note pink mt16">
      <span style="flex:none">${shapeSVG(sh, 16, 24)}</span>
      <div>Your scan says <b style="text-transform:capitalize">${esc(sh)}</b>.
        ${esc(t.n.split(" ")[0])} does ${esc(sh)} in ${good} of ${(t.s || []).length} services.</div>
    </div>` : ""}

    <div class="seehead" style="padding-left:0;padding-right:0"><h3>Services</h3></div>
    <div class="stack gap10">
      ${(t.s || []).length ? (t.s || []).map((s, i) => `
        <div class="card" style="display:flex;align-items:center;gap:12px;padding:13px">
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${esc(s.n)}</div>
            <div class="small sub" style="margin-top:2px">${s.m ? mins(+s.m) : ""}${s.m && (s.sh || []).length ? " · " : ""}${(s.sh || []).length ? "good for " + esc((s.sh || []).join(", ")) : ""}</div>
          </div>
          <div style="font-size:15px;font-weight:800">${esc(t.c || "₦")}${Number(s.p || 0).toLocaleString("en")}</div>
        </div>`).join("")
        : `<div class="empty">This tech shared no service menu. Message her to ask.</div>`}
    </div>

    <div class="note mt16">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>
      <div>Prices and hours are what this tech typed into her own link. Oma does not verify them
        and there are no reviews — nothing here has been checked by anyone but her.</div>
    </div>
  </div>
  <div class="dock">
    <div class="btnrow">
      <button class="btn" data-a="pick" data-id="${esc(t.id)}" ${(t.s || []).length ? "" : "disabled"}>Select services</button>
    </div>
  </div>`;
}

/* ══ 11 pick services ════════════════════════════════ */
let CART = { tech: null, svc: [], note: "", at: null };
function vPick(id) {
  const t = DB.techs.find(x => x.id === id);
  if (!t) return vSalons();
  if (CART.tech !== id) CART = { tech: id, svc: [], note: "", at: null };
  const sh = DB.scans[0] && DB.scans[0].shape;
  const good = sh ? (t.s || []).filter(s => (s.sh || []).includes(sh)).length : 0;
  const tot = CART.svc.reduce((a, i) => a + (+t.s[i].p || 0), 0);
  const dur = CART.svc.reduce((a, i) => a + (+t.s[i].m || 0), 0);
  return `
  ${head(t.n, "Pick your services")}
  <div class="pad">
    ${sh ? `<div class="note pink">
      <span style="flex:none">${shapeSVG(sh, 18, 27)}</span>
      <div>Your scan says <b style="text-transform:capitalize">${esc(sh)}</b>.
        ${good ? `${esc(t.n.split(" ")[0])} does ${esc(sh)} in ${good} of ${t.s.length} services.`
               : `None of her services is tagged for ${esc(sh)} — worth asking before you book.`}</div>
    </div>` : ""}
    <div class="stack gap10 mt16">
      ${t.s.map((s, i) => `
        <button class="card tap ${CART.svc.includes(i) ? "sel" : ""}" data-a="svcPick" data-i="${i}"
            style="display:flex;align-items:center;gap:12px;padding:13px">
          <span class="check">${I.tick(15)}</span>
          <span style="flex:1">
            <span style="display:block;font-size:14.5px;font-weight:700">${esc(s.n)}</span>
            <span class="small sub" style="display:block;margin-top:2px">${s.m ? mins(+s.m) : "duration not given"}${sh && (s.sh || []).includes(sh) ? " · suits your shape" : ""}</span>
          </span>
          <span style="font-size:15px;font-weight:800">${esc(t.c || "₦")}${Number(s.p || 0).toLocaleString("en")}</span>
        </button>`).join("")}
    </div>
    <div style="font-size:14.5px;font-weight:800;letter-spacing:-.02em;margin-top:18px">
      Add a note for ${esc(t.n.split(" ")[0])}</div>
    <label class="inp area mt12"><textarea id="cartNote" placeholder="Anything she should know — inspo, allergies, how long you need them to last…">${esc(CART.note)}</textarea></label>
  </div>
  <div class="dock">
    <div class="rowbetween" style="margin-bottom:12px">
      <div>
        <div class="small sub" style="font-weight:600">${CART.svc.length} service${CART.svc.length === 1 ? "" : "s"}${dur ? " · " + mins(dur) : ""}</div>
        <div style="font-size:22px;font-weight:800;letter-spacing:-.03em">${esc(t.c || "₦")}${tot.toLocaleString("en")}</div>
      </div>
    </div>
    <button class="btn" data-a="time" data-id="${esc(id)}" ${CART.svc.length ? "" : "disabled"}>
      Choose a time ${I.arrow()}</button>
  </div>`;
}

/* ══ 12 pick a time ══════════════════════════════════ */
function slotList(t) {
  const o = (t.o || "09:00").split(":"), c = (t.cl || "18:00").split(":");
  const start = +o[0], end = +c[0];
  const out = [];
  for (let h = start; h < end; h++) out.push(h);
  return out;
}
function vTime(id) {
  const t = DB.techs.find(x => x.id === id);
  if (!t) return vSalons();
  const tot = CART.svc.reduce((a, i) => a + (+t.s[i].p || 0), 0);
  const dur = CART.svc.reduce((a, i) => a + (+t.s[i].m || 0), 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(+today + i * 864e5);
  if (!CART.day) CART.day = days[1];
  const hrs = slotList(t);
  const am = hrs.filter(h => h < 12), pm = hrs.filter(h => h >= 12);
  const slot = h => {
    const at = CART.day + h * 36e5;
    const past = at < Date.now();
    const taken = DB.bookings.some(b => b.techId === id && b.at === at && b.status !== "cancelled");
    const on = CART.at === at;
    return `<button class="slot ${on ? "on" : ""} ${past || taken ? "off" : ""}" data-a="slot" data-at="${at}">
      ${String(h).padStart(2, "0")}:00</button>`;
  };
  const d = new Date(CART.day);
  return `
  ${head("Pick a time", t.n)}
  <div class="pad">
    <div class="rowbetween">
      <h3>${MONTHS[d.getMonth()]} ${d.getFullYear()}</h3>
      <span class="small sub">${esc(t.o || "09:00")}–${esc(t.cl || "18:00")}</span>
    </div>
    <div class="days mt12">
      ${days.slice(0, 5).map(ts => {
        const dd = new Date(ts);
        return `<button class="day ${CART.day === ts ? "on" : ""}" data-a="day" data-at="${ts}">
          <div class="d">${DAYS[dd.getDay()]}</div><div class="n">${String(dd.getDate()).padStart(2, "0")}</div></button>`;
      }).join("")}
    </div>
    <div class="rowbetween mt24"><h3 style="font-size:15px">Times</h3>
      <span class="small sub">${dayLabel(CART.day)}</span></div>
    ${am.length ? `<div class="small sub" style="font-weight:700;margin-top:12px">Morning</div>
      <div class="grid3" style="margin-top:9px">${am.map(slot).join("")}</div>` : ""}
    ${pm.length ? `<div class="small sub" style="font-weight:700;margin-top:16px">Afternoon</div>
      <div class="grid3" style="margin-top:9px">${pm.map(slot).join("")}</div>` : ""}
    <div class="note mt20">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>
      <div>Oma has no view of ${esc(t.n.split(" ")[0])}'s real diary — these are just her opening
        hours, minus slots you have already asked for. She confirms on WhatsApp.</div>
    </div>
  </div>
  <div class="dock">
    <div class="rowbetween" style="margin-bottom:12px">
      <div>
        <div class="small sub" style="font-weight:600">${CART.at ? dayLabel(CART.at) + " · " + hhmm(CART.at) : "No time picked"}${dur ? " · " + mins(dur) : ""}</div>
        <div style="font-size:22px;font-weight:800;letter-spacing:-.03em">${esc(t.c || "₦")}${tot.toLocaleString("en")}</div>
      </div>
      <span class="tag">${CART.svc.length} service${CART.svc.length === 1 ? "" : "s"}</span>
    </div>
    <button class="btn" data-a="request" data-id="${esc(id)}" ${CART.at ? "" : "disabled"}>
      Send the request ${I.arrow()}</button>
  </div>`;
}

/* ══ 13 booked ═══════════════════════════════════════ */
function vBooked(bid) {
  const b = DB.bookings.find(x => x.id === bid);
  if (!b) return vHome();
  const sc = DB.scans.find(s => s.id === b.scanId);
  return `
  <div class="resulthead" style="padding-bottom:44px;text-align:center">
    <div style="display:flex;flex-direction:column;align-items:center">
      <div style="width:82px;height:82px;border-radius:50%;background:rgba(255,255,255,.22);
          border:1px solid rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center">
        <div style="width:58px;height:58px;border-radius:50%;background:#fff;display:flex;
            align-items:center;justify-content:center;color:#e0447f">${I.tick(30)}</div>
      </div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-.035em;line-height:1.2;margin-top:18px">
        Request sent to<br>${esc(b.techName)}</div>
      <div class="small" style="opacity:.92;margin-top:8px;font-weight:500">
        She confirms on WhatsApp — it is not booked until she replies.</div>
    </div>
  </div>
  <div class="pad" style="margin-top:-26px;position:relative">
    <div class="ticket">
      <div style="padding:18px 18px 14px;display:flex;align-items:center;gap:13px">
        <div class="avatar sq" style="width:48px;height:48px;font-size:15px">${esc(initials(b.techName))}</div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:800;letter-spacing:-.02em">${esc(b.techName)}</div>
          <div class="small sub">${esc(b.where || "")}</div>
        </div>
      </div>
      <div class="perf"><span class="l"></span><span class="r"></span></div>
      <div style="padding:16px 18px 18px" class="stack gap12">
        <div class="kv"><span class="k">When</span><span class="v">${dayLabel(b.at)} · ${hhmm(b.at)}</span></div>
        <div class="kv"><span class="k">Services</span><span class="v">${b.svc.map(s => esc(s.n)).join("<br>")}</span></div>
        ${b.mins ? `<div class="kv"><span class="k">Duration</span><span class="v">${mins(b.mins)}</span></div>` : ""}
        <div class="kv" style="padding-top:12px;border-top:1px solid var(--line)">
          <span class="k">Total</span>
          <span class="v" style="font-size:19px;font-weight:800">${esc(b.cur || DB.cur)}${Number(b.total).toLocaleString("en")}</span></div>
      </div>
    </div>
    ${sc ? `<div class="note pink mt16">
      <span style="flex:none">${shapeSVG(sc.shape, 20, 30)}</span>
      <div>Your ${esc(sc.label.toLowerCase())} scan went with the request, so she can prep the right shape.</div>
    </div>` : ""}
    <div class="btnrow mt16">
      <button class="btn ghost sm" data-a="ics" data-id="${esc(b.id)}">${I.cal()} Add to calendar</button>
      <button class="btn ghost sm" data-a="map" data-id="${esc(b.id)}">${I.pin()} Directions</button>
    </div>
  </div>
  <div class="dock clear">
    <button class="btn" data-a="tab" data-v="bookings">See my bookings ${I.arrow()}</button>
  </div>`;
}

/* ══ bookings ════════════════════════════════════════ */
function bookingRow(b, hero) {
  const d = new Date(b.at);
  const st = b.status === "confirmed" ? `<span class="tag good">Confirmed</span>`
    : b.status === "cancelled" ? `<span class="tag grey">Cancelled</span>`
    : `<span class="tag warn">Awaiting reply</span>`;
  return `<button class="card tap" data-a="booking" data-id="${esc(b.id)}"
      style="display:flex;align-items:center;gap:13px">
    <span class="thumb pink" style="width:46px;height:46px;border-radius:15px;flex-direction:column;line-height:1">
      <span style="font-size:9px;font-weight:800;letter-spacing:.06em">${MONTHS[d.getMonth()].toUpperCase()}</span>
      <span style="font-size:15px;font-weight:800">${String(d.getDate()).padStart(2, "0")}</span>
    </span>
    <span style="flex:1;min-width:0">
      <span class="tiny" style="display:block;font-weight:700;color:var(--sub)">${hero ? "Next appointment" : dayLabel(b.at)}</span>
      <span style="display:block;font-size:15px;font-weight:800;letter-spacing:-.02em;margin-top:1px">${esc(b.techName)} · ${hhmm(b.at)}</span>
    </span>
    ${st}
  </button>`;
}
function vBookings() {
  const up = DB.bookings.filter(b => b.at >= Date.now() - 36e5).sort((a, b) => a.at - b.at);
  const past = DB.bookings.filter(b => b.at < Date.now() - 36e5).sort((a, b) => b.at - a.at);
  return `
  <div class="topbar"><h2>Bookings</h2>
    <div class="small sub mt8">Requests you have sent. A tech confirms on WhatsApp — mark it
      confirmed here once she does.</div></div>
  <div class="seehead"><h3>Coming up</h3></div>
  <div class="pad stack gap10">
    ${up.length ? up.map(b => bookingRow(b)).join("") : `<div class="empty">
      <div class="ic">${I.cal()}</div><b>Nothing booked</b>
      Pick a tech under Salons, choose services and send her a time.</div>`}
  </div>
  ${past.length ? `<div class="seehead"><h3>Past</h3></div>
  <div class="pad stack gap10">${past.slice(0, 10).map(b => bookingRow(b)).join("")}</div>` : ""}
  <div style="height:16px"></div>`;
}
function vBooking(id) {
  const b = DB.bookings.find(x => x.id === id);
  if (!b) return vBookings();
  const sc = DB.scans.find(s => s.id === b.scanId);
  return `
  ${head(b.techName, dayLabel(b.at) + " · " + hhmm(b.at))}
  <div class="pad">
    <div class="ticket">
      <div style="padding:18px" class="stack gap12">
        <div class="kv"><span class="k">Status</span><span class="v" style="text-transform:capitalize">${esc(b.status)}</span></div>
        <div class="kv"><span class="k">Services</span><span class="v">${b.svc.map(s => esc(s.n) + " · " + esc(b.cur || DB.cur) + Number(s.p || 0).toLocaleString("en")).join("<br>")}</span></div>
        ${b.mins ? `<div class="kv"><span class="k">Duration</span><span class="v">${mins(b.mins)}</span></div>` : ""}
        ${b.note ? `<div class="kv"><span class="k">Your note</span><span class="v" style="font-weight:500">${esc(b.note)}</span></div>` : ""}
        <div class="kv" style="padding-top:12px;border-top:1px solid var(--line)">
          <span class="k">Total</span><span class="v" style="font-size:19px">${esc(b.cur || DB.cur)}${Number(b.total).toLocaleString("en")}</span></div>
      </div>
    </div>
    ${sc ? `<div class="note pink mt16"><span style="flex:none">${shapeSVG(sc.shape, 18, 27)}</span>
      <div>Sent with your ${esc(sc.label.toLowerCase())} scan.</div></div>` : ""}
    <div class="btnrow mt16">
      <button class="btn ghost sm" data-a="ics" data-id="${esc(b.id)}">${I.cal()} Calendar</button>
    </div>
    <div class="menu mt16">
      <button data-a="mark" data-id="${esc(b.id)}" data-s="confirmed">
        <span class="ic" style="color:var(--good)">${I.tick(16)}</span><span style="flex:1">She confirmed it</span>${I.chev()}</button>
      <button data-a="mark" data-id="${esc(b.id)}" data-s="cancelled">
        <span class="ic">${I.back()}</span><span style="flex:1">Cancel this request</span>${I.chev()}</button>
    </div>
  </div>
  <div style="height:20px"></div>`;
}
