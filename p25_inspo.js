/* ══ 25 inspo price requests ═══════════════════════════════════════════════
   Kamsy, 7 Nov 2026. A customer who has an inspo sends the pictures to ONE
   nail tech. It is not a chat: nobody types anything. The tech replies with a
   price and how long it takes (or says she cannot do it). If the customer
   agrees she picks a day and time, and the normal 30-minute payment window
   starts. Escrow, the booking fee and the refund rules are the usual ones.

   An unpaid request or appointment is never a booking: the tech sees "waiting"
   until the money is in. Nobody can message or call before paying.

   The rules live in the database ("Inspo price requests (send an inspo, get a
   price)"); this file is only the screens. The whole feature can be switched
   off with the alert_switch 'inspo_requests'; alerts stay off until she says
   go.                                                                        */

const IN = { pics: [], home: false, lat: null, lng: null, area: "", askName: "", askHome: false, busy: false,
             pickAt: "", pickAddr: "", pickArea: "" };

const inRow = (x) => (Array.isArray(x) ? x[0] : x) || {};
const inCall = (fn, args) => API.inspo(fn, args || {});
const inWhen = (iso) => { const t = new Date(iso).getTime(); return dayLabel(t) + " · " + hhmm(t); };

function inLeft(iso, word) {
  const secs = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (!(secs > 0)) return "";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return (word || "Left") + ": " + (h >= 1 ? h + " h " + m + " min" : Math.max(m, 1) + " min");
}

/* Where a picture comes from once it has been sent (the bucket is public by an
   unguessable name, as for the booking pictures before it). */
const inPhotoUrl = (p) => API.inspoUrl(p);

function stopInspo() {
  // the pictures picked but not sent are only previews: let them go
  IN.pics.forEach((p) => { try { URL.revokeObjectURL(p.url); } catch (e) { /* gone already */ } });
  IN.pics = []; IN.busy = false;
}

/* ── on a nail tech's page ───────────────────────────────────────────────── */
async function fillInspoCard(techId) {
  if (DB.role === "tech" || !API.signedIn()) return;
  let st;
  try { st = inRow(await inCall("api_inspo_status", { p_tech: techId })); } catch (e) { return; }
  if (!st.feature) return;
  if (ROUTE.v !== "techlive" || ROUTE.a !== techId) return;
  if (!st.can_ask && !st.live_request) return;
  const box = document.querySelector("#ahost .pad.stack");
  if (!box || document.getElementById("inCard")) return;
  const name = PICKED.name || "this nail tech";
  IN.askName = name; IN.askHome = !!st.home;
  box.insertAdjacentHTML("afterbegin", `
    <div class="card" id="inCard" style="padding:15px">
      <div style="font-size:16px;font-weight:800">Got an inspo?</div>
      <div class="small sub" style="margin-top:4px">${st.live_request
        ? `You already sent ${esc(name)} an inspo. Open it to see where it is.`
        : `Send ${esc(name)} your picture and she replies with a price. You only pay if you agree.`}</div>
      <button class="btn ghost mt12" data-a="${st.live_request ? "in-open" : "in-ask"}"
              data-id="${esc(st.live_request || techId)}" data-name="${esc(name)}" data-home="${st.home ? "1" : ""}">
        ${st.live_request ? "Open your inspo" : "Send your inspo for a price"}</button>
    </div>`);
}

/* ── sending: pictures, salon or home, send ──────────────────────────────── */
function inPicsHtml() {
  const tiles = IN.pics.map((p, i) => `
    <div style="position:relative;width:92px;height:92px;border-radius:14px;overflow:hidden;background:var(--fill2)">
      <img src="${esc(p.url)}" alt="" style="width:100%;height:100%;object-fit:cover">
      <button class="iconbtn" data-a="in-drop" data-id="${i}" aria-label="Remove this picture"
        style="position:absolute;top:4px;right:4px;width:26px;height:26px;background:rgba(0,0,0,.55);color:#fff;border-radius:50%">&times;</button>
    </div>`).join("");
  const add = IN.pics.length < 3 ? `
    <button class="card" data-a="in-pick" style="width:92px;height:92px;border-radius:14px;display:flex;align-items:center;
      justify-content:center;flex-direction:column;gap:4px;border:1.5px dashed var(--line);cursor:pointer">
      <span style="font-size:26px;line-height:1">+</span><span class="tiny sub">Add</span></button>` : "";
  return `<div style="display:flex;gap:10px;flex-wrap:wrap">${tiles}${add}</div>`;
}

function vInspoAsk(techId) {
  const name = IN.askName || PICKED.name || "this nail tech";
  load(async () => {
    if (!API.signedIn()) return askToSignIn("sending an inspo");
    let st = {};
    try { st = inRow(await inCall("api_inspo_status", { p_tech: techId })); } catch (e) { st = {}; }
    if (!st.feature || (!st.can_ask && !st.live_request)) {
      return fillHost(`<div class="pad"><div class="note"><div>${esc(st.why || "You cannot send an inspo to this nail tech right now.")}</div></div></div>`);
    }
    if (st.live_request) {
      return fillHost(`<div class="pad"><div class="note"><div>${esc(st.why)}</div></div>
        <button class="btn mt16" data-a="in-open" data-id="${esc(st.live_request)}">Open your inspo</button></div>`);
    }
    IN.askHome = !!st.home;
    fillHost(`
      <div class="pad">
        <div class="note pink"><div>Send up to 3 pictures. ${esc(name)} replies with a price and how long it takes. You only pay if you agree,
          and you choose the day and time after you see her price. You cannot message each other before you pay.</div></div>
        <div class="lab" style="margin:16px 0 8px;font-weight:700">Your pictures</div>
        <div id="inPics">${inPicsHtml()}</div>
        <input id="inFile" type="file" accept="image/*" multiple hidden>
        ${IN.askHome ? `
        <div class="lab" style="margin:18px 0 8px;font-weight:700">Where</div>
        <div style="display:flex;gap:8px">
          <button class="chip${IN.home ? "" : " on"}" data-a="in-where" data-v="salon" style="flex:1">At her place</button>
          <button class="chip${IN.home ? " on" : ""}" data-a="in-where" data-v="home" style="flex:1">She comes to me</button>
        </div>
        <div id="inHome" class="tiny sub" style="margin-top:8px">${inHomeNote()}</div>` : ""}
        <div class="tiny sub" style="margin-top:14px">Oma's ₦75 booking fee is added when you pay. It is not refundable.</div>
      </div>
      <div class="dock"><div class="btnrow">
        <button class="btn" id="inGo" data-a="in-send" data-id="${esc(techId)}">Send to ${esc(name)}</button>
      </div></div>`);
    const f = document.getElementById("inFile");
    if (f) f.addEventListener("change", () => inPicked(f));
  });
  return head("Send your inspo", name) + host();
}

function inHomeNote() {
  if (!IN.home) return "";
  if (IN.lat == null) return "Oma will ask where you are, only to check she can travel to you. She sees your area and the distance, not your street, until you pay.";
  return "Got your position" + (IN.area ? " (" + esc(IN.area) + ")" : "") + ". She sees your area and the distance, not your street, until you pay.";
}

async function inPicked(input) {
  const files = [...(input.files || [])];
  input.value = "";
  for (const file of files) {
    if (IN.pics.length >= 3) { toast("You can send up to 3 pictures."); break; }
    try {
      const canvas = await photoToCanvas(file);
      const { blob } = await shrinkToBlob(canvas);
      if (!blob) throw new Error("That picture could not be prepared.");
      IN.pics.push({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      toast(e && e.message ? e.message : "That picture would not open.");
    }
  }
  const box = document.getElementById("inPics");
  if (box) box.innerHTML = inPicsHtml();
}

function inWhere(v) {
  IN.home = v === "home";
  document.querySelectorAll('[data-a="in-where"]').forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  const note = document.getElementById("inHome");
  if (note) note.innerHTML = inHomeNote();
  if (IN.home && IN.lat == null && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((p) => {
      IN.lat = p.coords.latitude; IN.lng = p.coords.longitude;
      const n = document.getElementById("inHome");
      if (n) n.innerHTML = inHomeNote();
    }, () => toast("Allow location so Oma can check she can come to you."), { enableHighAccuracy: false, timeout: 12000 });
  }
}

async function inSend(techId, btn) {
  if (IN.busy) return;
  if (!IN.pics.length) return toast("Add at least one picture.");
  if (IN.home && IN.lat == null) return toast("Allow location so Oma can check she can come to you.");
  IN.busy = true; btn.disabled = true;
  const label = btn.textContent; btn.textContent = "Sending…";
  let rid = null;
  try {
    const r = inRow(await inCall("api_inspo_start", {
      p_tech: techId, p_at_home: IN.home,
      p_lat: IN.home ? IN.lat : null, p_lng: IN.home ? IN.lng : null, p_area: IN.home ? (IN.area || null) : null }));
    rid = r.id;
    if (!rid) throw new Error("Oma did not start your request. Please try again.");
    const uid = API.userId();
    for (const p of IN.pics) {
      const rnd = [...crypto.getRandomValues(new Uint8Array(8))].map((n) => n.toString(16).padStart(2, "0")).join("");
      const path = `${uid}/${rid}/${rnd}.jpg`;
      await API.storagePut(path, p.blob, "image/jpeg", "inspo");
      try { await inCall("api_inspo_add_pic", { p_request: rid, p_path: path }); }
      catch (e) { API.storageDelete(path, "inspo"); throw e; }
    }
    await inCall("api_inspo_send", { p_request: rid });
    stopInspo();
    // Replace the send screen, so Back from the request lands on her page.
    ROUTE = { v: "inspoview", a: rid };
    paint();
  } catch (e) {
    IN.busy = false; btn.disabled = false; btn.textContent = label;
    // nothing half-sent: a draft the tech never saw is thrown away
    if (rid) inCall("api_inspo_cancel", { p_request: rid }).catch(() => {});
    toast(e && e.message ? e.message : "That did not send. Nothing was sent.");
  }
}

/* ── one request ─────────────────────────────────────────────────────────── */
const inStatusText = (r) => {
  const tech = r.role === "tech";
  switch (r.status) {
    case "open": return tech ? "Waiting for your price" : "Waiting for her price";
    case "quoted": return tech ? "You sent a price" : "Price ready";
    case "paying": return "Waiting for your payment";
    case "booked": return "Booked";
    case "declined": return tech ? "You turned it down" : "She could not do it";
    case "expired": return "Ran out of time";
    case "cancelled": return "Cancelled";
    default: return r.status;
  }
};

function inCardRow(r) {
  const tech = r.role === "tech";
  const who = tech ? (r.customer_name || "A client") : ((r.tech && r.tech.business_name) || "Nail tech");
  const good = ["quoted", "paying", "booked"].includes(r.status) || (tech && r.status === "open");
  return `
    <div class="card" data-a="in-open" data-id="${esc(r.id)}"
         style="display:flex;align-items:center;gap:12px;padding:13px;cursor:pointer">
      <div class="avatar sq">${esc(initials(who))}</div>
      <div style="flex:1;min-width:0">
        <div class="rowbetween"><b style="font-size:15px">${esc(who)}</b>
          <span class="tiny sub">${esc(dayLabel(new Date(r.created_at).getTime()))}</span></div>
        <div class="small sub">${+r.pics || 0} picture${+r.pics === 1 ? "" : "s"}${r.at_home ? " · home visit" : ""}${r.quote_kobo ? " · " + kobo(r.quote_kobo) : ""}</div>
      </div>
      <span class="tag${good ? " good" : ""}">${esc(inStatusText(r))}</span>
    </div>`;
}

function vInspos() {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("your inspos");
    let rows;
    try { rows = await inCall("api_inspo_mine").then((x) => (Array.isArray(x) ? x : [])); }
    catch (e) {
      // not switched on yet (the database file has not been run): say so, no scary error
      if (e && e.name === "TypeError") throw e;
      return fillHost(`<div class="pad"><div class="note"><div>Inspo is not available yet. It will appear here once Oma switches it on.</div></div></div>`);
    }
    const tech = DB.role === "tech";
    fillHost(`
      <div class="pad stack gap12">
        ${rows.length ? rows.map(inCardRow).join("") : `
        <div class="empty"><div class="ic">${I.chat()}</div>
          <b>No inspos yet</b>
          ${tech ? "When a client sends you a picture, it appears here and you reply with a price."
                 : "Open a nail tech and tap Send your inspo for a price."}</div>`}
      </div>`);
  });
  return head("Inspo", "Send a picture, get a price") + host();
}

function inPicsGrid(list, canReport) {
  if (!list.length) return "";
  return `<div style="display:grid;grid-template-columns:repeat(${Math.min(3, list.length)},1fr);gap:8px">
    ${list.map((p) => `
      <div>
        <a href="${esc(inPhotoUrl(p.path))}" target="_blank" rel="noopener">
          <img src="${esc(inPhotoUrl(p.path))}" alt="Inspo picture" loading="lazy"
               style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px;background:var(--fill2)"></a>
        ${canReport ? `<button class="tiny sub" data-a="in-report" data-id="${+p.id}"
          style="margin-top:4px;background:none;border:0;padding:0;text-decoration:underline;cursor:pointer">Report</button>` : ""}
      </div>`).join("")}
  </div>`;
}

function vInspoView(id) {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("this inspo");
    const [rows, pics] = await Promise.all([
      inCall("api_inspo_mine").then((x) => (Array.isArray(x) ? x : [])),
      inCall("api_inspo_pics", { p_request: id }).then((x) => (Array.isArray(x) ? x : [])).catch(() => []),
    ]);
    const r = rows.find((x) => x.id === id);
    if (!r) return fillHost(`<div class="pad"><div class="note"><div>That inspo is not available.</div></div></div>`);
    const tech = r.role === "tech";
    const who = tech ? (r.customer_name || "A client") : ((r.tech && r.tech.business_name) || "the nail tech");
    const box = (inner, edge) => `<div class="card" style="padding:14px;margin-top:12px${edge ? ";border:1.5px solid var(--pink)" : ""}">${inner}</div>`;
    let action = "";

    if (r.status === "open") {
      action = tech ? box(`
        <div style="font-weight:800;font-size:16px">Send your price</div>
        <div class="small sub" style="margin:3px 0 12px">One price. ${esc(r.at_home ? "She wants you to come to her" + (r.cust_area ? " (" + r.cust_area + ", about " + r.km + " km away)" : "") + "." : "At your place.")}
          ${esc(inLeft(r.expires_at, "You have"))}</div>
        <label class="field"><span class="lab">Price</span>
          <span class="inp"><span class="pre">₦</span><input id="inPrice" inputmode="decimal" placeholder="0" autocomplete="off"></span></label>
        <div class="tiny sub" style="margin:-8px 0 12px">Between ₦500 and ₦500,000. Oma's ₦75 booking fee is added for the client on top
          of this, and your usual fee comes off what you earn.</div>
        <label class="field"><span class="lab">How long it takes</span>
          <span class="inp"><select id="inMins">${[...Array(32)].map((_, i) => (i + 1) * 15)
            .map((m) => `<option value="${m}"${m === 120 ? " selected" : ""}>${esc(mins(m))}</option>`).join("")}</select></span></label>
        <button class="btn mt12" data-a="in-quote" data-id="${esc(r.id)}">Send my price</button>
        <button class="btn ghost mt12" data-a="in-decline" data-id="${esc(r.id)}">I can't do this design</button>`, true)
        : box(`
        <div style="font-weight:800">Waiting for ${esc(who)} to send a price</div>
        <div class="small sub" style="margin-top:3px">${esc(inLeft(r.expires_at, "She has"))}. You are not charged unless you agree.</div>
        <button class="btn ghost mt12" data-a="in-cancel" data-id="${esc(r.id)}">Cancel this request</button>`, true);
    } else if (r.status === "quoted") {
      action = tech ? box(`
        <div class="tiny sub" style="font-weight:700">Your price</div>
        <div style="font-size:26px;font-weight:800;margin-top:4px">${kobo(r.quote_kobo)}</div>
        <div class="small sub">about ${esc(mins(+r.quote_minutes))} · waiting for ${esc(who)} to agree</div>
        <button class="btn ghost mt12" data-a="in-decline" data-id="${esc(r.id)}">Take my price back</button>`, true)
        : box(`
        <div class="rowbetween"><div class="tiny sub" style="font-weight:700">Price from ${esc(who)}</div>
          <div class="tiny" style="color:var(--warn);font-weight:700">${esc(inLeft(r.quote_expires_at, "Agree within"))}</div></div>
        <div style="font-size:26px;font-weight:800;margin-top:4px">${kobo(r.quote_kobo)}</div>
        <div class="small sub">about ${esc(mins(+r.quote_minutes))}${r.at_home ? " · she comes to you" : " · at her place"}</div>
        <div class="tiny sub" style="margin-top:8px">${kobo(r.quote_kobo)} plus Oma's ₦75 booking fee. You pick the day and time next, then you have 30 minutes to pay.</div>
        <button class="btn mt12" data-a="in-agree" data-id="${esc(r.id)}">Agree and pick a time</button>
        <button class="btn ghost mt12" data-a="in-cancel" data-id="${esc(r.id)}">Not for me</button>`, true);
    } else if (r.status === "paying") {
      action = box(`
        <div style="font-weight:800">You agreed ${kobo(r.quote_kobo)}</div>
        <div class="small sub" style="margin-top:3px">Pay to confirm your appointment. ${esc(inLeft(r.pay_deadline, "Time left"))}</div>
        <button class="btn mt12" data-a="go-pay" data-id="${esc(r.booking_id)}">Pay now</button>`, true);
    } else if (r.status === "booked") {
      action = tech ? box(`<div style="font-weight:800">Booked and paid: ${kobo(r.quote_kobo)}</div>
          <div class="small sub" style="margin-top:3px">Find it in Requests, with the time and place.</div>`)
        : box(`<div style="font-weight:800">Booked and paid: ${kobo(r.quote_kobo)}</div>
          <button class="btn ghost mt12" data-a="in-ticket" data-id="${esc(r.booking_id)}">Open your appointment</button>`);
    } else {
      action = `<div class="note mt12"><div>${esc(
        r.status === "declined" ? (tech ? "You turned this one down." : "The nail tech could not do this design. You were not charged. Try another nail tech.")
        : r.status === "expired" ? "This ran out of time. Nobody was charged."
        : "This request was cancelled.")}</div></div>`;
    }

    fillHost(`
      <div class="pad">
        <div class="rowbetween"><b style="font-size:16px">${esc(who)}</b><span class="tag${["quoted", "paying", "booked"].includes(r.status) ? " good" : ""}">${esc(inStatusText(r))}</span></div>
        <div class="small sub" style="margin:2px 0 12px">Sent ${esc(inWhen(r.created_at))}${r.at_home ? " · home visit" : ""}</div>
        ${pics.length ? inPicsGrid(pics, tech && r.status !== "booked") : `<div class="small sub">The pictures are no longer kept.</div>`}
        ${action}
      </div>`);
  });
  return head("Inspo", "Your picture and her price") + host();
}

/* ── agreeing: pick the day and time ─────────────────────────────────────── */
function vInspoPick(id) {
  load(async () => {
    const rows = await inCall("api_inspo_mine").then((x) => (Array.isArray(x) ? x : []));
    const r = rows.find((x) => x.id === id);
    if (!r || r.status !== "quoted") {
      return fillHost(`<div class="pad"><div class="note"><div>That price is no longer open.</div></div></div>`);
    }
    const local = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const dflt = new Date(Date.now() + 24 * 3600e3); dflt.setMinutes(0, 0, 0);
    fillHost(`
      <div class="pad">
        <div class="card" style="padding:14px">
          <div class="tiny sub" style="font-weight:700">${esc((r.tech && r.tech.business_name) || "Nail tech")}</div>
          <div style="font-size:24px;font-weight:800;margin-top:2px">${kobo(r.quote_kobo)}</div>
          <div class="small sub">about ${esc(mins(+r.quote_minutes))}${r.at_home ? " · she comes to you" : " · at her place"}</div>
        </div>
        <label class="field mt16"><span class="lab">Day and time</span>
          <span class="inp"><input id="inWhen" type="datetime-local" value="${esc(IN.pickAt || local(dflt.getTime()))}"
            min="${local(Date.now() + 3600e3)}"></span></label>
        <div class="tiny sub" style="margin:-8px 0 8px">It has to be inside her working hours and at least an hour from now.</div>
        ${r.at_home ? `
        <label class="field"><span class="lab">Your address</span>
          <span class="inp area"><textarea id="inAddr" maxlength="300" placeholder="House number, street, area">${esc(IN.pickAddr)}</textarea></span></label>
        <div class="tiny sub">She only sees it once you have paid.</div>` : ""}
      </div>
      <div class="dock"><div class="btnrow">
        <button class="btn" data-a="in-accept" data-id="${esc(r.id)}" data-home="${r.at_home ? "1" : ""}">Agree and pay</button>
      </div></div>`);
  });
  return head("Pick a time", "Then you have 30 minutes to pay") + host();
}

async function inAccept(id, el) {
  const when = (document.getElementById("inWhen") || {}).value || "";
  const addrEl = document.getElementById("inAddr");
  const at = when ? new Date(when) : null;
  if (!at || isNaN(at.getTime())) return toast("Pick a day and time.");
  if (at.getTime() < Date.now() + 3600e3) return toast("Pick a time at least an hour from now.");
  const addr = addrEl ? addrEl.value.trim() : "";
  if (el.dataset.home && !addr) return toast("Add the address she should come to.");
  IN.pickAt = when; IN.pickAddr = addr;
  el.disabled = true;
  try {
    const b = inRow(await inCall("api_inspo_accept", { p_request: id, p_starts: at.toISOString(), p_address: addr || null, p_area: null }));
    if (!b.id) throw new Error("Oma did not return your appointment. Check Bookings before trying again.");
    IN.pickAt = ""; IN.pickAddr = "";
    nav("pay", b.id);
  } catch (e) {
    el.disabled = false;
    toast(e && e.message ? e.message : "That did not work.");
  }
}

/* ── the tech's answer ───────────────────────────────────────────────────── */
async function inQuote(id, el) {
  const priceTxt = (document.getElementById("inPrice") || {}).value || "";
  const minutes = +((document.getElementById("inMins") || {}).value || 0);
  const naira = parseFloat(priceTxt.replace(/[^0-9.]/g, ""));
  const k = Math.round(naira * 100);
  if (!isFinite(k) || k < 50000 || k > 50000000) return toast("The price must be between ₦500 and ₦500,000.");
  if (!(minutes >= 15)) return toast("Say how long it takes.");
  if (!confirm("Send " + kobo(k) + " for about " + mins(minutes) + "? You cannot change it after you send it.")) return;
  el.disabled = true;
  try {
    await inCall("api_inspo_quote", { p_request: id, p_price_kobo: k, p_minutes: minutes });
    paint();
  } catch (e) {
    el.disabled = false;
    toast(e && e.message ? e.message : "That did not send.");
  }
}

function inSimple(fn, id, el, ask) {
  if (ask && !confirm(ask)) return;
  el.disabled = true;
  inCall(fn, { p_request: id })
    .then(() => paint())
    .catch((e) => { el.disabled = false; toast(e && e.message ? e.message : "That did not work."); });
}

async function inReport(picId, el) {
  const why = prompt("What is wrong with this picture? (Oma will look at it. You will not see it again.)", "");
  if (why === null) return;
  el.disabled = true;
  try {
    await API.inspo("api_report_inspo", { p_inspo: +picId, p_reason: why || "" });
    toast("Thank you. Oma will look at it.");
    paint();
  } catch (e) {
    el.disabled = false;
    toast(e && e.message ? e.message : "That did not send.");
  }
}

/* ── one place for every tap ─────────────────────────────────────────────── */
function inspoAction(a, el) {
  const id = el.dataset.id;
  switch (a) {
    case "in-ask": IN.askName = el.dataset.name || ""; IN.askHome = !!el.dataset.home; stopInspo(); IN.home = false; IN.lat = null; IN.lng = null; return nav("inspoask", id);
    case "in-pick": { const f = document.getElementById("inFile"); if (f) f.click(); return; }
    case "in-drop": { const p = IN.pics.splice(+id, 1)[0]; if (p) { try { URL.revokeObjectURL(p.url); } catch (e) { /* ok */ } }
      const box = document.getElementById("inPics"); if (box) box.innerHTML = inPicsHtml(); return; }
    case "in-where": return inWhere(el.dataset.v);
    case "in-send": return inSend(id, el);
    case "in-open": return nav("inspoview", id);
    case "in-agree": return nav("inspopick", id);
    case "in-accept": return inAccept(id, el);
    case "in-quote": return inQuote(id, el);
    case "in-decline": return inSimple("api_inspo_decline", id, el, "Turn this down? The client is told you cannot do it.");
    case "in-cancel": return inSimple("api_inspo_cancel", id, el, "Cancel this request? Nothing is charged.");
    case "in-report": return inReport(id, el);
    case "in-ticket": return nav("ticket", id);
  }
}
