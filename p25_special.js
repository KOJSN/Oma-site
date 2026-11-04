/* ══ 25 special designs ═══════════════════════════════════════════════════
   A customer asks a nail tech who takes them for a design that is not on her
   menu, they talk, and then the TECH sends one formal offer (price, date and
   time). The customer accepts it and pays through Oma exactly like any
   appointment: accepting makes an ordinary booking at that price, so escrow,
   the booking fee, the tech fee and the refund rules are the normal ones.

   The rules live in the database ("Special designs (ask and offer)"); this file
   is only the screens. Test builds only: the whole feature can be switched off
   with the alert_switch 'special_designs', and new alerts stay off until she
   says go.

   A conversation exists BEFORE any booking, so it is not a chat.js thread. It
   polls the same way, every few seconds, only while it is open.            */

const SP = { id: null, poll: null, n: -1, sig: "", data: null, askName: "", confirm: false };

const spRow = (x) => (Array.isArray(x) ? x[0] : x) || {};
const spCall = (fn, args) => API.special(fn, args || {});
const spWhen = (iso) => { const t = new Date(iso).getTime(); return dayLabel(t) + " · " + hhmm(t); };

/* paint() throws the screen away; the timer must not outlive it. Called from
   paint() next to stopChat. */
function stopSpecial() {
  if (SP.poll) { clearInterval(SP.poll); SP.poll = null; }
  SP.id = null; SP.n = -1; SP.sig = ""; SP.confirm = false;
}

function spExpires(iso) {
  const secs = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (secs <= 0) return "Expired";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h >= 1 ? `Expires in ${h} h ${m} min` : `Expires in ${Math.max(m, 1)} min`;
}

/* ── on a nail tech's page ───────────────────────────────────────────────── */
async function fillSpecialCard(techId) {
  if (DB.role === "tech" || !API.signedIn()) return;
  let st;
  try { st = spRow(await spCall("api_special_status", { p_tech: techId })); } catch (e) { return; }
  if (!st.on) return;
  if (ROUTE.v !== "techlive" || ROUTE.a !== techId) return;
  const box = document.querySelector("#ahost .pad.stack");
  if (!box || document.getElementById("spCard")) return;
  const name = PICKED.name || "this nail tech";
  const has = !!st.request_id;
  box.insertAdjacentHTML("afterbegin", `
    <div class="card" id="spCard" style="padding:15px">
      <div style="font-size:16px;font-weight:800">Want something special?</div>
      <div class="small sub" style="margin-top:4px">${has
        ? `You already have a conversation with ${esc(name)} about a special design.`
        : `${esc(name)} takes special designs. Tell her what you have in mind and agree a price in chat.`}</div>
      <button class="btn ghost mt12" data-a="${has ? "sp-open" : "sp-ask"}"
              data-id="${esc(has ? st.request_id : techId)}" data-name="${esc(name)}">
        ${has ? "Open your conversation" : "Ask for a special design"}</button>
    </div>`);
}

/* ── ask ─────────────────────────────────────────────────────────────────── */
function vSpecialAsk(techId) {
  const name = SP.askName || PICKED.name || "this nail tech";
  return `${head("Special design", name)}
  <div class="pad">
    <div class="note pink">
      <div>Tell ${esc(name)} about the design you want: colours, shape, anything you have seen.
        She replies here, and when you agree she sends one price and time. You pay through Oma
        like any appointment, and the money is held until it is done.</div>
    </div>
    <label class="field mt16"><span class="lab">Your design</span>
      <span class="inp area"><textarea id="spAskIn" maxlength="1000"
        placeholder="For example: long almond, deep blue with gold flakes and a small butterfly on each ring finger"></textarea></span>
    </label>
    <div class="tiny sub">Keep talking inside Oma. Her price only counts when she sends it as an offer here.</div>
  </div>
  <div class="dock"><div class="btnrow">
    <button class="btn" data-a="sp-start" data-id="${esc(techId)}">Send to ${esc(name)}</button>
  </div></div>`;
}

async function spStart(techId, btn) {
  const box = document.getElementById("spAskIn");
  const body = box ? box.value.trim() : "";
  if (!body) return toast("Describe the design first.");
  btn.disabled = true;
  try {
    const r = spRow(await spCall("api_special_start", { p_tech: techId, p_body: body }));
    if (!r.request_id) throw new Error("Oma did not start your conversation. Please try again.");
    // Replace the ask screen, so Back from the conversation lands on her page.
    ROUTE = { v: "special", a: r.request_id };
    paint();
  } catch (e) {
    btn.disabled = false;
    toast(e && e.message ? e.message : "That did not send.");
  }
}

/* ── the conversation ────────────────────────────────────────────────────── */
function spBubbles(list) {
  let day = "";
  return list.map((m) => {
    const at = new Date(m.at).getTime();
    const d = dayLabel(at);
    const sep = d === day ? "" : `<div class="daysep">${esc(d)}</div>`;
    day = d;
    if (m.kind && m.kind !== "text") {
      // Offers, withdrawals and acceptances: a quiet line in the middle, not a speech bubble.
      return `${sep}<div class="tiny sub" style="align-self:center;text-align:center;max-width:88%;
        font-weight:700;background:var(--tint);border-radius:14px;padding:8px 12px">${esc(m.body)}</div>`;
    }
    return `${sep}
      <div class="bub ${m.mine ? "me" : "them"}">${esc(m.body)}
        <span class="when">${chatTime(m.at)}</span></div>`;
  }).join("");
}

function spOfferHtml(d) {
  const o = d.offer, r = d.request || {};
  if (!o) return "";
  const asTech = r.role === "tech";
  const open = o.status === "open" && new Date(o.expires_at).getTime() > Date.now();
  const awaiting = o.status === "accepted" && o.booking_status === "awaiting_payment" &&
                   o.pay_deadline && new Date(o.pay_deadline).getTime() > Date.now();
  const booked = o.status === "accepted" && ["paid", "released"].includes(o.booking_status);
  const price = kobo(o.price_kobo);
  const when = spWhen(o.starts_at);
  const who = esc(r.who || "");
  const box = (inner, edge) => `<div class="card" style="padding:14px;margin-bottom:8px${edge
    ? ";border:1.5px solid var(--pink)" : ""}">${inner}</div>`;

  if (open) {
    const head1 = `<div class="rowbetween"><div class="tiny sub" style="font-weight:700">${asTech
      ? "Your offer" : "Offer from " + who}</div><div class="tiny" style="color:var(--warn);font-weight:700">${esc(spExpires(o.expires_at))}</div></div>
      <div style="font-size:24px;font-weight:800;margin-top:4px">${price}</div>
      <div style="font-size:14px;margin-top:2px">${esc(o.what)}</div>
      <div class="small sub" style="margin-top:2px">${esc(when)} · about ${esc(mins(+o.minutes))}</div>`;
    if (asTech) {
      return box(`${head1}<button class="btn ghost mt12" data-a="sp-withdraw" data-id="${esc(o.id)}">Withdraw this offer</button>`, true);
    }
    if (SP.confirm) {
      return box(`${head1}
        <div class="note mt12"><div>Accept ${price} for this design on ${esc(when)}? You will see the final amount before you pay.</div></div>
        <div class="btnrow mt12" style="display:flex;gap:8px">
          <button class="btn ghost" data-a="sp-accept-no" style="flex:1">Not yet</button>
          <button class="btn" data-a="sp-accept" data-id="${esc(o.id)}" style="flex:1">Accept and pay</button>
        </div>`, true);
    }
    return box(`${head1}<button class="btn mt12" data-a="sp-accept-ask">Accept and pay</button>`, true);
  }
  if (awaiting) {
    return asTech
      ? box(`<div style="font-weight:800">Accepted: ${price}, ${esc(when)}.</div>
             <div class="small sub" style="margin-top:3px">Waiting for ${who} to pay. The slot is held for a short while.</div>`)
      : box(`<div style="font-weight:800">You accepted ${price} for ${esc(when)}.</div>
             <div class="small sub" style="margin-top:3px">Pay to confirm your appointment.</div>
             <button class="btn mt12" data-a="go-pay" data-id="${esc(o.booking_id)}">Pay now</button>`);
  }
  if (booked) {
    return asTech
      ? box(`<div style="font-weight:800">Booked and paid: ${esc(when)}.</div><div class="small sub">Find it in Requests.</div>`)
      : box(`<div style="font-weight:800">Booked: ${esc(when)}.</div>
             <button class="btn ghost mt12" data-a="sp-ticket" data-id="${esc(o.booking_id)}">Open your appointment</button>`);
  }
  const note = o.status === "withdrawn"
    ? (asTech ? "Your last offer was withdrawn." : `The last offer was withdrawn. Ask ${who} for a new one if you still want it.`)
    : (asTech ? "Your last offer ran out." : `The last offer ran out. Ask ${who} for a new one if you still want it.`);
  return `<div class="tiny sub" style="padding:0 2px 8px">${esc(note)}</div>`;
}

function spPaint(d) {
  const log = document.getElementById("chatlog");
  if (!log) return;
  const list = d.messages || [];
  const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const first = SP.n < 0;
  log.innerHTML = list.length ? spBubbles(list) : `
    <div class="empty" style="margin:auto"><div class="ic">${I.chat()}</div>
      <b>No messages yet</b>Say hello.</div>`;
  if (first || atEnd) log.scrollTop = log.scrollHeight;
  SP.n = list.length;
  spPaintOffer(d);
}

function spPaintOffer(d) {
  const slot = document.getElementById("spOffer");
  if (!slot) return;
  const r = d.request || {};
  const o = d.offer;
  const awaiting = o && o.status === "accepted" && o.booking_status === "awaiting_payment" &&
                   o.pay_deadline && new Date(o.pay_deadline).getTime() > Date.now();
  const canOffer = r.role === "tech" && r.status === "open" && !awaiting;
  const open = o && o.status === "open" && new Date(o.expires_at).getTime() > Date.now();
  slot.innerHTML = spOfferHtml(d) + (canOffer
    ? `<button class="btn ghost" style="margin-bottom:8px" data-a="sp-offer-new" data-id="${esc(r.id)}">${
        open ? "Send a new offer" : "Send an offer"}</button>` : "");
}

async function spRefresh(requestId) {
  const d = spRow(await spCall("api_special_thread", { p_request: requestId, p_after: 0 }));
  if (SP.id !== requestId) return null;
  SP.data = d;
  spPaint(d);
  return d;
}

function vSpecialThread(requestId) {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("this conversation");
    const d = spRow(await spCall("api_special_thread", { p_request: requestId, p_after: 0 }));
    const r = d.request || {};
    if (!r.id) {
      return fillHost(`<div class="pad"><div class="note"><div>That conversation is not available.</div></div></div>`);
    }
    SP.data = d; SP.id = requestId; SP.n = -1; SP.confirm = false;
    SP.sig = "";
    const who = r.who || "Special design";
    const open = r.status === "open";
    fillHost(`
      <div class="chathead">
        <button class="iconbtn" data-a="back" aria-label="Back">${I.back()}</button>
        <div class="avatar sq">${esc(initials(who))}</div>
        <div style="flex:1;min-width:0">
          <div class="ttl">${esc(who)}</div>
          <div class="tiny sub">Special design</div>
        </div>
        ${open ? `<button class="btn ghost" style="width:auto;padding:8px 12px;font-size:13px"
          data-a="sp-close" data-id="${esc(requestId)}">Close</button>` : ""}
      </div>
      <div class="chatlog" id="chatlog"></div>
      <div id="spOffer" style="padding:0 14px"></div>
      ${open ? `
      <div class="composer">
        <textarea id="spIn" rows="1" placeholder="Message ${esc(who)}"
                  maxlength="2000" aria-label="Your message"></textarea>
        <button class="send" data-a="sp-send" data-id="${esc(requestId)}"
                aria-label="Send">${I.send()}</button>
      </div>`
      : `<div class="composer" style="justify-content:center">
           <div class="tiny sub" style="text-align:center;padding:6px 0">This conversation is closed.</div>
         </div>`}`);

    spPaint(d);
    SP.sig = spSig(d);
    spCall("api_special_read", { p_request: requestId }).catch(() => {});

    const grow = document.getElementById("spIn");
    if (grow) {
      grow.addEventListener("input", () => {
        grow.style.height = "auto";
        grow.style.height = Math.min(grow.scrollHeight, 120) + "px";
      });
    }

    if (SP.poll) clearInterval(SP.poll);
    SP.poll = setInterval(async () => {
      if (SP.id !== requestId || document.hidden) return;
      try {
        const fresh = spRow(await spCall("api_special_thread", { p_request: requestId, p_after: 0 }));
        if (SP.id !== requestId) return;
        const sig = spSig(fresh);
        SP.data = fresh;
        if (sig !== SP.sig) {
          SP.sig = sig;
          spPaint(fresh);
          spCall("api_special_read", { p_request: requestId }).catch(() => {});
          // A conversation that was closed from the other side needs its box taken away.
          if ((fresh.request || {}).status !== "open" && open) paint();
        } else {
          spPaintOffer(fresh);   // keeps "expires in ..." honest
        }
      } catch (e) { /* one bad poll on a Lagos connection is not an error */ }
    }, 5000);
  });
  return host();
}

const spSig = (d) => JSON.stringify([
  (d.messages || []).length,
  d.offer ? [d.offer.id, d.offer.status, d.offer.booking_status] : null,
  (d.request || {}).status,
]);

async function spSend(requestId) {
  const box = document.getElementById("spIn");
  if (!box) return;
  const body = box.value.trim();
  if (!body) return;
  const btn = document.querySelector(".composer .send");
  if (btn) btn.disabled = true;
  box.value = "";
  box.style.height = "auto";
  try {
    await spCall("api_special_send", { p_request: requestId, p_body: body });
    const d = await spRefresh(requestId);
    if (d) SP.sig = spSig(d);
  } catch (e) {
    box.value = body;
    toast(e && e.message ? e.message : "That did not send.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function spAccept(offerId, btn) {
  btn.disabled = true;
  try {
    const b = spRow(await spCall("api_special_accept", { p_offer: offerId }));
    if (!b.id) throw new Error("Oma did not return your appointment. Check Bookings before trying again.");
    nav("pay", b.id);
  } catch (e) {
    btn.disabled = false;
    SP.confirm = false;
    toast(e && e.message ? e.message : "That did not work.");
    if (SP.id) spRefresh(SP.id).catch(() => {});
  }
}

/* ── the list, and the tech's switch ─────────────────────────────────────── */
function vSpecials() {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("your special designs");
    const tech = DB.role === "tech";
    const [rows, mine] = await Promise.all([
      spCall("api_special_threads").then((x) => (Array.isArray(x) ? x : [])),
      tech ? spCall("api_special_mine").then(spRow).catch(() => null) : Promise.resolve(null),
    ]);
    const row = (t) => `
      <div class="card" data-a="sp-open" data-id="${esc(t.request_id)}"
           style="display:flex;align-items:center;gap:12px;padding:13px;cursor:pointer">
        <div class="avatar sq">${esc(initials(t.who || "?"))}</div>
        <div style="flex:1;min-width:0">
          <div class="rowbetween"><b style="font-size:15px">${esc(t.who || "Special design")}</b>
            <span class="tiny sub">${esc(dayLabel(new Date(t.last_at).getTime()))}</span></div>
          <div class="small sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${t.offer_status === "open"
              ? `<span class="tag good">${tech ? "Offer sent" : "Offer waiting"}</span> ` : ""}${t.last_mine ? "You: " : ""}${esc(t.last || "")}</div>
        </div>
        ${t.unread > 0 ? `<span class="tag good">${+t.unread}</span>` : ""}
      </div>`;
    fillHost(`
      <div class="pad stack gap12">
        ${mine && mine.feature ? `
        <div class="card" data-a="sp-toggle" style="display:flex;align-items:center;gap:12px;padding:14px;cursor:pointer">
          <div style="flex:1">
            <div style="font-size:15px;font-weight:800">Take special design requests</div>
            <div class="small sub" style="margin-top:3px">Clients can message you about a design that is not on your menu.
              You agree it in chat, then send one price and time. They pay through Oma like any appointment.</div>
          </div>
          <span class="switch${mine.on ? " on" : ""}" id="spSwitch" role="switch"
                aria-checked="${mine.on ? "true" : "false"}"><i></i></span>
        </div>` : ""}
        ${rows.length ? rows.map(row).join("") : `
        <div class="empty"><div class="ic">${I.chat()}</div>
          <b>No special designs yet</b>
          ${tech ? "When a client asks you for a design, the conversation appears here."
                 : "Open a nail tech who takes special designs and tap Ask for a special design."}</div>`}
      </div>`);
  });
  return head("Special designs", "Designs that are not on a menu") + host();
}

async function spToggle(el) {
  const sw = document.getElementById("spSwitch");
  if (!sw || sw.dataset.busy) return;
  const want = !sw.classList.contains("on");
  sw.dataset.busy = "1";
  try {
    const r = spRow(await spCall("api_special_set", { p_on: want }));
    const on = r.on === undefined ? want : !!r.on;
    sw.classList.toggle("on", on);
    sw.setAttribute("aria-checked", on ? "true" : "false");
  } catch (e) {
    toast(e && e.message ? e.message : "That did not save.");
  } finally {
    delete sw.dataset.busy;
  }
}

/* ── the tech's offer ────────────────────────────────────────────────────── */
function vSpecialOffer(requestId) {
  const r = (SP.data && SP.data.request) || {};
  const who = r.who || "the client";
  const local = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const dflt = new Date(Date.now() + 24 * 3600e3); dflt.setMinutes(0, 0, 0);
  const opts = [];
  for (let m = 15; m <= 480; m += 15) opts.push(`<option value="${m}"${m === 120 ? " selected" : ""}>${esc(mins(m))}</option>`);
  return `${head("Send an offer", who)}
  <div class="pad">
    <div class="note pink"><div>One offer for ${esc(who)}. When she accepts, it becomes a normal Oma appointment and she
      pays Oma. The price and time cannot be changed once sent. To change anything, send a new offer.</div></div>
    <label class="field mt16"><span class="lab">The design</span>
      <span class="inp area"><textarea id="spWhat" maxlength="300"
        placeholder="For example: long almond, deep blue with gold flakes and a small butterfly on each ring finger"></textarea></span></label>
    <label class="field"><span class="lab">Price</span>
      <span class="inp"><span class="pre">₦</span><input id="spPrice" inputmode="decimal" placeholder="0" autocomplete="off"></span></label>
    <div class="tiny sub" style="margin:-8px 0 16px">Between ₦500 and ₦500,000. Oma's ₦75 booking fee is added for the client on top
      of this, and your usual fee comes off what you earn.</div>
    <label class="field"><span class="lab">How long it takes</span>
      <span class="inp"><select id="spMins">${opts.join("")}</select></span></label>
    <label class="field"><span class="lab">When</span>
      <span class="inp"><input id="spWhen" type="datetime-local" value="${local(dflt.getTime())}"
        min="${local(Date.now() + 2 * 3600e3)}"></span></label>
    <div class="tiny sub">At your shop, inside your working hours. The offer lasts 24 hours, or until shortly before it starts.</div>
  </div>
  <div class="dock"><div class="btnrow">
    <button class="btn" data-a="sp-offer-send" data-id="${esc(requestId)}">Send offer</button>
  </div></div>`;
}

async function spOfferSend(requestId, btn) {
  const what = (document.getElementById("spWhat") || {}).value || "";
  const priceTxt = (document.getElementById("spPrice") || {}).value || "";
  const minutes = +((document.getElementById("spMins") || {}).value || 0);
  const whenTxt = (document.getElementById("spWhen") || {}).value || "";
  const naira = parseFloat(priceTxt.replace(/[^0-9.]/g, ""));
  const kobo100 = Math.round(naira * 100);
  const at = whenTxt ? new Date(whenTxt) : null;
  if (what.trim().length < 3) return toast("Describe the design in a few words.");
  if (!isFinite(kobo100) || kobo100 < 50000 || kobo100 > 50000000) return toast("The price must be between ₦500 and ₦500,000.");
  if (!at || isNaN(at.getTime()) || at.getTime() < Date.now() + 2 * 3600e3) return toast("Pick a time at least two hours from now.");
  btn.disabled = true;
  try {
    await spCall("api_special_offer", {
      p_request: requestId, p_what: what.trim(), p_price_kobo: kobo100,
      p_minutes: minutes, p_starts: at.toISOString(),
    });
    back();     // the conversation repaints with the offer on it
  } catch (e) {
    btn.disabled = false;
    toast(e && e.message ? e.message : "That did not send.");
  }
}

/* ── one place for every tap ─────────────────────────────────────────────── */
function specialAction(a, el) {
  const id = el.dataset.id;
  switch (a) {
    case "sp-ask": SP.askName = el.dataset.name || ""; return nav("specialask", id);
    case "sp-start": return spStart(id, el);
    case "sp-open": return nav("special", id);
    case "sp-send": return spSend(id);
    case "sp-close": {
      if (!confirm("Close this conversation? Any open offer is withdrawn.")) return;
      return spCall("api_special_close", { p_request: id })
        .then(() => paint())
        .catch((e) => toast(e && e.message ? e.message : "That did not work."));
    }
    case "sp-accept-ask": SP.confirm = true; return SP.data && spPaintOffer(SP.data);
    case "sp-accept-no": SP.confirm = false; return SP.data && spPaintOffer(SP.data);
    case "sp-accept": return spAccept(id, el);
    case "sp-withdraw":
      el.disabled = true;
      return spCall("api_special_withdraw", { p_offer: id })
        .then(() => SP.id && spRefresh(SP.id))
        .catch((e) => { el.disabled = false; toast(e && e.message ? e.message : "That did not work."); });
    case "sp-offer-new": return nav("specialoffer", id);
    case "sp-offer-send": return spOfferSend(id, el);
    case "sp-ticket": return nav("ticket", id);
    case "sp-toggle": return spToggle(el);
  }
}
