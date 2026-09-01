/* ══ painting ════════════════════════════════════════ */
let Q = "";
function paint() {
  const v = document.getElementById("view");
  const R = ROUTE.v;
  let html;
  if (!DB.role && !["welcome", "role", "signup", "setup"].includes(R)) ROUTE.v = "welcome";
  switch (ROUTE.v) {
    case "welcome": html = vWelcome(); break;
    case "role": html = vRole(); break;
    case "signup": html = vSignup(); break;
    case "setup": html = vSetup(false); break;
    case "editbiz": html = vSetup(true); break;
    // The bottom bar used to lead to a second, device-only app. Every one
    // of these now reads the database instead. See oma-two-apps.md.
    case "home": html = vHomeLive(); break;
    case "salons": html = vNearby(); break;
    case "tech": html = vTechLive(ROUTE.a); break;
    case "pick": html = vTechLive(ROUTE.a); break;
    case "time": html = vTimeLive(); break;
    case "booked": html = vPay(ROUTE.a); break;
    case "bookings": html = vBookingsLive(); break;
    case "booking": html = vJob(ROUTE.a); break;
    case "profile": html = vProfile(); break;
    case "history": html = vHistory(); break;
    case "scan": html = vScan(ROUTE.a); break;
    case "editme": html = vEditMe(); break;
    case "settings": html = vSettings(); break;
    case "sheet": html = vSheet(); break;
    case "requests": html = vRequestsLive(); break;
    case "diary": html = vDiaryLive(); break;
    case "earnings": html = vWallet(); break;
    case "listing": html = vListing(); break;
    case "signin": html = vSignIn(); break;
    case "nearby": html = vNearby(); break;
    case "techlive": html = vTechLive(ROUTE.a); break;
    case "timelive": html = vTimeLive(); break;
    case "pay": html = vPay(ROUTE.a); break;
    case "ticket": html = vTicket(ROUTE.a); break;
    case "scanner": html = vScanner(); break;
    case "wallet": html = vWallet(); break;
    case "kyc": html = vKyc(); break;
    case "backend": html = vBackend(); break;
    case "job": html = vJob(ROUTE.a); break;
    default: html = DB.role === "tech" ? vRequestsLive() : vNearby();
  }
  if (typeof stopCamera === "function") stopCamera();
  // The map holds listeners on window and an animation frame of its own, so it
  // has to be dismantled before its container is thrown away.
  if (typeof stopMap === "function") stopMap();
  v.innerHTML = html;
  const bare = ["welcome", "role", "signup", "setup", "signin"].includes(ROUTE.v);
  v.classList.toggle("nonav", bare || !DB.role);
  // Home is the one screen that fills its height instead of scrolling.
  v.classList.toggle("map", ROUTE.v === "home");
  bottomNav();
  if (ROUTE.v === "sheet") paintSheetPreview();
  // Async screens fill themselves in after their frame is on the page.
  if (typeof afterPaint === "function") afterPaint();
}

/* ══ one delegated handler ═══════════════════════════
   Every button carries data-a. Adding a screen never means adding another
   listener, and nothing is bound to markup that has already been replaced.
   It is bound to the shell rather than to the view because the bottom nav is
   a SIBLING of the view, not a child of it. Bound to the view, every tab in
   the nav was silently dead — you could scan, and then not leave the screen
   you landed on. */
document.getElementById("shell").addEventListener("click", e => {
  const el = e.target.closest("[data-a]");
  if (!el) return;
  const a = el.dataset.a;
  const id = el.dataset.id;
  const fields = {};
  ["fName", "fPhone", "fArea", "fDial"].forEach(k => {
    const n = document.getElementById(k); if (n) fields[k] = n.value.trim();
  });

  /* the marketplace ---------------------------------------------------- */
  if (a === "reload") return paint();

  if (a === "signout") {
    // Only the session goes. The backend settings stay, so the next person to
    // sign in on this device does not have to be handed the anon key again —
    // and her own bookings never appear, because they were never on the device.
    API.signOut();
    DB.me = DB.me || {};
    toast("Signed out.");
    return nav(DB.role === "tech" ? "requests" : "home");
  }
  if (a === "cfg-save") {
    const url = (document.getElementById("fUrl") || {}).value || "";
    const key = (document.getElementById("fAnon") || {}).value || "";
    if (!/^https:\/\/.+/.test(url.trim())) return toast("The project URL starts with https://");
    if (key.trim().length < 40) return toast("That does not look like the anon key.");
    // Refuse the dangerous one by shape rather than letting her find out later.
    if (/service_role/.test(key)) {
      return toast("That is the service_role key — it must never go in the app.");
    }
    API.configure(url.trim(), key.trim());
    toast("Testing…");
    // A real call, not a ping: reaching the domain proves nothing about whether
    // the SQL was ever loaded.
    return API.nearby(6.4478, 3.4723, 10)
      .then(() => { toast("Connected."); paint(); })
      .catch(err => {
        API.configure("", "");
        toast(err.message.slice(0, 90) || "Could not reach it — check the URL and key.");
        paint();
      });
  }
  if (a === "cfg-clear") {
    API.configure("", "");
    API.signOut();
    toast("Back on the practice version.");
    return paint();
  }

  if (a === "otp-send") {
    const n = document.getElementById("fSignPhone");
    const phone = (n ? n.value : "").trim();
    if (phone.replace(/\D/g, "").length < 7) return toast("That does not look like a phone number.");
    SIGNIN.phone = phone;
    return API.sendOtp(phone).then(() => { SIGNIN.sent = true; paint(); })
      .catch(err => toast(err.message));
  }
  if (a === "otp-again") { SIGNIN.sent = false; return paint(); }
  if (a === "otp-check") {
    const n = document.getElementById("fOtp");
    return API.verifyOtp(SIGNIN.phone, (n ? n.value : "").trim())
      .then(() => { toast("Signed in."); nav("nearby"); })
      .catch(err => toast(err.message));
  }
  if (a === "google") {
    if (API.isMock()) return toast("Google sign-in needs the real backend configured.");
    location.href = API.googleUrl();
    return;
  }

  if (a === "tech-open") {
    // A list row carries her name in its title; the map's card is a plain
    // button, so it says the name outright.
    PICKED.name = el.dataset.name ||
      (el.querySelector(".ttl") ? el.querySelector(".ttl").textContent : "");
    return nav("techlive", el.dataset.id);
  }
  // The map: tapping Close puts the short list back, and the arrow re-centres.
  if (a === "map-clear") return choosePin(null);
  if (a === "map-me") return recentreMap();
  if (a === "pick-time") return nav("timelive");
  // "day" and "slot" belong to the local booking flow in p6. These two are the
  // marketplace equivalents and must not shadow them.
  if (a === "mday") {
    [...document.querySelectorAll("#dayChips .chip")].forEach(c => c.classList.remove("on"));
    el.classList.add("on");
    return;
  }
  if (a === "mslot") {
    const day = document.querySelector("#dayChips .chip.on");
    if (!day) return toast("Pick a day first.");
    const at = new Date(Number(day.dataset.ts));
    at.setHours(Number(el.dataset.h), 0, 0, 0);
    el.disabled = true;
    return API.book(PICKED.techId, at.getTime(), PICKED.ids, null,
                    (DB.scans && DB.scans[0] && DB.scans[0].shape) || null)
      .then(b => nav("pay", b.id))
      .catch(err => { el.disabled = false; toast(err.message); });
  }

  if (a === "copy-acct") return copy(el.dataset.v, "Account number copied.");
  if (a === "pretend") {
    return API.pretendPaid(id).then(() => { toast("Payment received."); nav("ticket", id); })
      .catch(err => toast(err.message));
  }
  if (a === "check-paid") {
    return API.bookings(true).then(list => {
      const b = list.find(x => x.id === id);
      if (b && b.status === "paid") return nav("ticket", id);
      toast("Not landed yet — bank transfers can take a minute.");
    }).catch(err => toast(err.message));
  }
  if (a === "go-pay") return nav("pay", id);
  if (a === "dispute") {
    return API.dispute(id).then(() => toast("Flagged. Nothing is released while it is open."))
      .catch(err => toast(err.message));
  }

  if (a === "scan-typed") {
    const which = document.getElementById("fWhich");
    const code = document.getElementById("fShort");
    if (!which || !which.value) return toast("Pick the appointment first.");
    return API.scanShort(which.value, (code ? code.value : ""))
      .then(r => {
        if (r && r.ok) return paidToast(r);
        toast((r && r.message) || "That code does not match.");
      })
      .catch(err => toast(err.message));
  }

  if (a === "payout") {
    return API.wallet().then(w => {
      if (w.available <= 0) return toast("Nothing to withdraw yet.");
      return API.requestPayout(w.available)
        .then(() => { toast("Withdrawal requested."); paint(); });
    }).catch(err => toast(err.message));
  }

  if (a === "kyc-send") {
    const n = document.getElementById("fNin");
    const v = (n ? n.value : "").replace(/\D/g, "");
    if (v.length !== 11 && v.length !== 16) {
      return toast("A vNIN is 16 digits, a NIN is 11.");
    }
    toast("Checking…");
    return API.verifyNin(v).then(r => {
      toast(r.status === "verified" ? "Verified." : (r.reason || "That did not pass."));
      paint();
    }).catch(err => toast(err.message));
  }

  if (a === "back") return back();
  if (a === "go") return nav(el.dataset.v);
  if (a === "tab") return nav(el.dataset.v);
  if (a === "startscan") return openScan();
  if (a === "theme") return toggleTheme();

  if (a === "role") { pickRole = el.dataset.v; return paint(); }
  if (a === "roleNext") {
    DB.role = pickRole; dbSave();
    return nav(pickRole === "tech" ? "setup" : "signup");
  }
  if (a === "switchRole") {
    DB.role = DB.role === "tech" ? "customer" : "tech"; dbSave();
    if (DB.role === "tech" && (!DB.biz || !DB.biz.name)) return nav("setup");
    if (DB.role === "customer" && !DB.me) return nav("signup");
    return nav(DB.role === "tech" ? "requests" : "home");
  }

  if (a === "gps") {
    const t = el.dataset.t;
    return locate(ll => {
      if (!ll) return;
      if (t === "biz") { DB.biz = Object.assign({ services: [] }, DB.biz, readBiz(), { ll }); }
      else { DB.me = Object.assign({}, DB.me, { name: fields.fName, phone: fields.fPhone, area: fields.fArea, ll }); }
      dbSave(); toast("Location pinned."); paint();
    });
  }
  if (a === "saveMe") {
    if (!fields.fName) return toast("Your name, at least — techs need something to call you.");
    DB.dial = (fields.fDial || DB.dial).replace(/\D/g, "") || DB.dial;
    DB.me = Object.assign({}, DB.me, {
      name: fields.fName, phone: fields.fPhone, area: fields.fArea,
      ll: (DB.me && DB.me.ll) || null
    });
    dbSave();
    return el.dataset.back ? (toast("Saved."), back()) : nav("home");
  }

  /* the tech's listing ------------------------------------------------- */
  if (a === "addSvc") {
    const b = Object.assign({ services: [] }, DB.biz, readBiz());
    b.services = (b.services || []).concat([{ n: "", p: "", m: "", sh: [] }]);
    DB.biz = b; dbSave(); return paint();
  }
  if (a === "delSvc") {
    const b = Object.assign({ services: [] }, DB.biz, readBiz());
    b.services.splice(+el.dataset.i, 1); DB.biz = b; dbSave(); return paint();
  }
  if (a === "svcShape") {
    const b = Object.assign({ services: [] }, DB.biz, readBiz());
    const s = b.services[+el.dataset.i]; const sh = el.dataset.sh;
    s.sh = s.sh || [];
    s.sh.includes(sh) ? s.sh.splice(s.sh.indexOf(sh), 1) : s.sh.push(sh);
    DB.biz = b; dbSave(); return paint();
  }
  if (a === "saveBiz") {
    const b = Object.assign({ services: [] }, DB.biz, readBiz());
    if (!b.name) return toast("Your business needs a name.");
    if (!b.phone) return toast("Add a WhatsApp number — that is how customers reach you.");
    b.services = (b.services || []).filter(s => (s.n || "").trim());
    DB.biz = b; DB.cur = b.cur || DB.cur; dbSave();
    toast("Listing saved.");
    return nav("listing");
  }
  if (a === "shareMine" || a === "copyLink") {
    const link = shareLink(DB.biz || {});
    const txt = `${DB.biz.name} on Oma — my services, prices and hours:\n${link}`;
    if (a === "shareMine" && navigator.share) {
      navigator.share({ title: DB.biz.name, text: txt }).catch(() => {});
      return;
    }
    return copy(link, "Link copied — paste it into WhatsApp.");
  }
  if (a === "shareTech") {
    const t = DB.techs.find(x => x.id === id); if (!t) return;
    const link = location.origin + location.pathname + "#t=" +
      b64e(JSON.stringify({ n: t.n, a: t.a, ad: t.ad, p: t.p, d: t.d, y: t.y, c: t.c, ll: t.ll, o: t.o, cl: t.cl, s: t.s }));
    return copy(link, "Her link is copied — send it on.");
  }
  if (a === "paste") {
    const s = prompt("Paste the Oma link a nail tech sent you:");
    if (!s) return;
    const m = s.match(/[#&]t=([^&\s]+)/);
    if (!m) return toast("That does not look like an Oma tech link.");
    const saved = location.hash;
    location.hash = "t=" + m[1];
    const t = techFromHash();
    location.hash = saved;
    if (!t) return toast("That link could not be read.");
    addTech(t);
    return nav("tech", t.id);
  }

  /* discovery and booking --------------------------------------------- */
  if (a === "sort") { SORT = el.dataset.v; return paint(); }
  if (a === "tech") return nav("tech", id);
  if (a === "pick") return nav("pick", id);
  if (a === "svcPick") {
    const i = +el.dataset.i;
    CART.svc.includes(i) ? CART.svc.splice(CART.svc.indexOf(i), 1) : CART.svc.push(i);
    CART.svc.sort((x, y) => x - y);
    const n = document.getElementById("cartNote"); if (n) CART.note = n.value;
    return paint();
  }
  if (a === "time") {
    const n = document.getElementById("cartNote"); if (n) CART.note = n.value;
    return nav("time", id);
  }
  if (a === "day") { CART.day = +el.dataset.at; CART.at = null; return paint(); }
  if (a === "slot") { CART.at = +el.dataset.at; return paint(); }
  if (a === "request") return sendRequest(id);
  if (a === "booking") return nav("booking", id);
  if (a === "mark") {
    const b = DB.bookings.find(x => x.id === id); if (!b) return;
    b.status = el.dataset.s; dbSave(); toast("Marked " + b.status + "."); return paint();
  }
  // The WhatsApp handoffs are gone. They were how a tech found out about a
  // booking before there was a server to tell her, and they took the
  // conversation somewhere Oma cannot see — which is exactly why a booking
  // could look sent and arrive nowhere. Replaced by the in-app thread.
  if (a === "ics") return calendar(id);
  if (a === "map") {
    const b = DB.bookings.find(x => x.id === id); if (!b) return;
    const t = DB.techs.find(x => x.id === b.techId);
    const q = t && t.ll ? t.ll.join(",") : (b.where || b.techName);
    return window.open("https://maps.google.com/?q=" + encodeURIComponent(q), "_blank", "noopener");
  }

  /* scans -------------------------------------------------------------- */
  if (a === "scan") return nav("scan", id);
  if (a === "delScan") {
    if (!confirm("Delete this scan?")) return;
    DB.scans = DB.scans.filter(s => s.id !== id); dbSave(); toast("Deleted."); return back();
  }
  if (a === "export") return exportScans();
  if (a === "sheetHand") { SHEET_HAND = el.dataset.v; return paint(); }
  if (a === "sheetPrint") return printSheet();
  if (a === "sheetPng") {
    return sheetBlob(300).then(b => download(b, "oma-guide-sheet-a4.png"));
  }
  if (a === "wipe") {
    if (!confirm("Erase every scan, tech and booking on this device? This cannot be undone.")) return;
    DB = { ...BLANK }; dbSave(); ROUTE = { v: "welcome", a: null }; STACK.length = 0;
    return paint();
  }

  /* the tech's requests ------------------------------------------------ */
  if (a === "pasteReq") {
    const s = prompt("Paste the whole WhatsApp message your customer sent:");
    if (!s) return;
    const j = readReqCode(s);
    if (!j) return toast("No oma: code in that message.");
    if (DB.jobs.some(x => x.who === j.who && x.at === j.at)) return toast("You already have that request.");
    DB.jobs.unshift(j); dbSave(); toast("Request added."); return paint();
  }
  if (a === "job") {
    const j = DB.jobs.find(x => x.id === id); if (!j) return;
    j.status = el.dataset.s; dbSave();
    toast(j.status === "accepted" ? "Accepted." : "Declined.");
    return paint();
  }
});

/* live search, typed rather than clicked */
document.getElementById("shell").addEventListener("input", e => {
  if (e.target.id === "qHome" || e.target.id === "qSalons") {
    Q = e.target.value;
    if (e.target.id === "qHome" && Q) { nav("salons"); const n = document.getElementById("qSalons"); if (n) { n.focus(); n.setSelectionRange(Q.length, Q.length); } }
    else if (e.target.id === "qSalons") {
      // repaint only the list, so the caret stays where it is
      const host = document.querySelector("#view .pad.stack");
      if (host) {
        const list = sortedTechs().filter(t => (t.n + " " + t.a + " " + (t.s || []).map(s => s.n).join(" "))
          .toLowerCase().includes(Q.toLowerCase()));
        host.innerHTML = list.length ? list.map(t => techRow(t, true)).join("")
          : `<div class="empty"><b>Nothing matched</b>Try a shorter search.</div>`;
      }
    }
  }
  if (e.target.id === "cartNote") CART.note = e.target.value;
});

/* ══ actions ═════════════════════════════════════════ */
function readBiz() {
  const g = k => { const n = document.getElementById(k); return n ? n.value.trim() : undefined; };
  const out = {};
  const map = { bName: "name", bAddr: "address", bArea: "area", bPhone: "phone",
                bDial: "dial", bCur: "cur", bYears: "years", bOpen: "opens", bClose: "closes" };
  for (const k in map) { const v = g(k); if (v !== undefined) out[map[k]] = v; }
  const svc = [];
  document.querySelectorAll("#svcList [data-s]").forEach(n => {
    const i = +n.dataset.i;
    svc[i] = svc[i] || Object.assign({ sh: [] }, ((DB.biz && DB.biz.services) || [])[i]);
    svc[i][n.dataset.s] = n.value.trim();
  });
  if (svc.length) out.services = svc;
  return out;
}
function addTech(t) {
  const i = DB.techs.findIndex(x => x.id === t.id);
  if (i >= 0) DB.techs[i] = Object.assign(DB.techs[i], t);
  else DB.techs.unshift(t);
  dbSave();
}
function copy(text, msg) {
  const done = () => toast(msg || "Copied.");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallback());
  } else fallback();
  function fallback() {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this:", text); }
    ta.remove();
  }
}
function sendRequest(id) {
  const t = DB.techs.find(x => x.id === id);
  if (!t || !CART.at) return;
  const me = DB.me || {};
  const svc = CART.svc.map(i => ({ n: t.s[i].n, p: +t.s[i].p || 0, m: +t.s[i].m || 0 }));
  const note = (document.getElementById("cartNote") || {}).value || CART.note || "";
  const sc = DB.scans[0];
  const b = {
    id: uid(), techId: t.id, techName: t.n, techPhone: t.p, techDial: t.d,
    where: [t.ad, t.a].filter(Boolean).join(", "),
    at: CART.at, svc, cur: t.c || DB.cur,
    total: svc.reduce((a, s) => a + s.p, 0),
    mins: svc.reduce((a, s) => a + s.m, 0),
    note, who: me.name || "A customer", whoPhone: me.phone || "",
    scanId: sc ? sc.id : null, shape: sc ? sc.shape : null, bed: sc ? sc.bed : null,
    status: "requested", made: Date.now()
  };
  DB.bookings.unshift(b); dbSave();
  CART = { tech: null, svc: [], note: "", at: null };
  nav("booked", b.id);
}
function calendar(id) {
  const b = DB.bookings.find(x => x.id === id); if (!b) return;
  const z = n => String(n).padStart(2, "0");
  const fmtd = ts => { const d = new Date(ts);
    return d.getUTCFullYear() + z(d.getUTCMonth() + 1) + z(d.getUTCDate()) + "T"
      + z(d.getUTCHours()) + z(d.getUTCMinutes()) + "00Z"; };
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Oma//EN", "BEGIN:VEVENT",
    "UID:" + b.id + "@oma", "DTSTAMP:" + fmtd(Date.now()),
    "DTSTART:" + fmtd(b.at), "DTEND:" + fmtd(b.at + (b.mins || 60) * 60000),
    "SUMMARY:Nails — " + b.techName,
    "DESCRIPTION:" + b.svc.map(s => s.n).join(", "),
    "LOCATION:" + (b.where || ""), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  download(new Blob([ics], { type: "text/calendar" }), "oma-appointment.ics");
}
function exportScans() {
  const blob = new Blob([JSON.stringify({
    exported: new Date().toISOString(), ruleset: RULES.version,
    scans: DB.scans, bookings: DB.bookings
  }, null, 2)], { type: "application/json" });
  download(blob, "oma-scans.json");
}
async function download(blob, name) {
  // Three hosts, three ways to hand someone a file. Inside the native shell an
  // <a download> does nothing at all, which is the kind of silent failure that
  // makes an app feel broken, so it goes through a share sheet instead.
  const wk = window.webkit && window.webkit.messageHandlers
    && window.webkit.messageHandlers.omaSave;
  if (wk) {
    const url = await new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
    wk.postMessage({ filename: name, dataUrl: url });
    return;
  }
  // A published artifact can hand the viewer a file only through the host,
  // and only after they say yes. Fall back to a plain link elsewhere.
  try {
    if (window.claude && window.claude.use) {
      const d = await window.claude.use("downloads");
      if (d) {
        await d.save({ filename: name, data: await blob.text() });
        toast("Saved."); return;
      }
    }
  } catch (e) { /* fall through */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Downloading…");
}

document.getElementById("sheetLink").addEventListener("click", () => {
  closeScan();
  nav("sheet");
});

/* ══ saving a scan ═══════════════════════════════════ */
document.getElementById("saveScan").addEventListener("click", () => {
  if (!S.last) return;
  DB.scans.unshift(S.last);
  if (DB.scans.length > 40) DB.scans.length = 40;
  dbSave();
  const id = S.last.id;
  closeScan();
  toast("Scan saved.");
  nav("scan", id);
});

/* ══ a new build is waiting ══════════════════════════
   Called by the service worker registration in the installed build. Left as a
   global on purpose: the registration script is injected at build time and
   this is the only thing it is allowed to know about the app. */
function omaUpdateReady(apply) {
  const bar = document.getElementById("updbar");
  if (!bar || bar.dataset.shown) return;
  bar.dataset.shown = "1";
  bar.classList.toggle("nonav", document.getElementById("nav").classList.contains("hidden"));
  bar.classList.remove("hidden");
  requestAnimationFrame(() => bar.classList.add("on"));
  const hide = () => {
    bar.classList.remove("on");
    setTimeout(() => bar.classList.add("hidden"), 240);
  };
  document.getElementById("updGo").onclick = () => {
    document.getElementById("updGo").textContent = "Updating…";
    apply();
  };
  document.getElementById("updNo").onclick = hide;
}

/* ══ boot ════════════════════════════════════════════ */
/* Opening a tech's link while Oma is already open changes the hash without
   reloading the page. Without this, tapping a friend's link a second time
   looked like nothing happening at all. */
addEventListener("hashchange", () => {
  const t = techFromHash();
  if (!t) return;
  addTech(t);
  if (!DB.role) { DB.role = "customer"; dbSave(); }
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
  STACK.length = 0;
  ROUTE = { v: "tech", a: t.id };
  paint();
  toast(t.n + " added.");
});

(function boot() {
  // Google sends the session back in the URL fragment. Take it before anything
  // else looks at the hash, and before the address bar can be screenshotted
  // with an access token still in it.
  if (API.captureRedirect()) {
    ROUTE = { v: "nearby", a: null };
    paint();
    toast("Signed in.");
    return;
  }

  const t = techFromHash();
  if (t) {
    // Someone opened a tech's link. If this device has never chosen a side,
    // it is a customer — nobody sends themselves their own listing.
    addTech(t);
    if (!DB.role) { DB.role = "customer"; dbSave(); }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
    ROUTE = { v: "tech", a: t.id };
    paint();
    toast(t.n + " added.");
    return;
  }
  ROUTE = { v: DB.role ? (DB.role === "tech" ? "requests" : "home") : "welcome", a: null };
  paint();
})();
