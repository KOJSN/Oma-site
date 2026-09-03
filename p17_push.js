/* ══ being told something happened ═══════════════════
   Kamsy: "oma is not gonna be a web app forever i am just using it as a
   physical model and when we are done i publish it on playstore and app store
   so do things like its an actual app".

   That is the whole reason this file is shaped the way it is.

   Notifications arrive by three different roads and Oma will eventually use
   all three:

       Chrome on Android, or installed to an iPhone home screen  ->  Web Push
       the iOS app, a WKWebView wrapper                          ->  APNs
       an Android wrapper later                                  ->  FCM

   Web Push does NOT work inside a WKWebView. That is Apple's own answer on
   their developer forums, not a gap waiting to be closed — service workers
   run in there, push does not. So the day Oma is wrapped for the App Store,
   any code that said "subscribe to web push" has to be torn out.

   Nothing below says that. registerForPush() asks whatever it is running
   inside — a native wrapper first, the browser second — and hands the
   database an opaque token with a platform beside it. What kind of token it
   is, only the sender needs to know.

   The single rule: NEVER ask for permission on startup. A permission prompt
   before somebody knows what the app is gets denied, and a denial is close to
   permanent — the browser will not ask again, and neither will iOS. It is
   asked for at the moment it makes sense: after a booking, where the reason
   is obvious.                                                              */

/* Public by design and ships in the app — it is the half of the VAPID pair
   that identifies the sender, and it is worthless without the private half,
   which lives only in Supabase's secrets. build2.py substitutes it. */
let PUSH_PUBLIC_KEY = "__VAPID_PUBLIC__";
const havePushKey = () =>
  typeof PUSH_PUBLIC_KEY === "string" && PUSH_PUBLIC_KEY.length > 20 &&
  PUSH_PUBLIC_KEY.indexOf("VAPID") === -1;

/* ── which road are we on ──────────────────────────── */
function pushTransport() {
  // A wrapper announces itself. Both of these are message handlers the native
  // side installs, so their presence IS the answer to "am I inside an app".
  if (window.webkit && window.webkit.messageHandlers &&
      window.webkit.messageHandlers.omaPush) return "ios";
  if (window.OmaAndroid && typeof window.OmaAndroid.registerForPush === "function") {
    return "android";
  }
  if ("Notification" in window && "serviceWorker" in navigator && "PushManager" in window) {
    return "web";
  }
  return null;
}

/* Whether asking is even worth offering. On an iPhone in Safari the answer is
   no until Oma is on the home screen — Apple requires the install first — and
   telling somebody that is far better than a button that silently does
   nothing. */
function pushAvailability() {
  const t = pushTransport();
  if (t === "ios" || t === "android") return { ok: true, transport: t };
  if (t === "web") {
    // Without a key pair there is nothing to subscribe to. Say so plainly
    // rather than throwing inside the browser's own push machinery.
    if (!havePushKey()) {
      return { ok: false, transport: "web", why: "unconfigured",
               says: "Notifications are not switched on for this build yet." };
    }
    const iOSSafari = /iP(hone|ad|od)/.test(navigator.userAgent) &&
                      !window.matchMedia("(display-mode: standalone)").matches &&
                      !navigator.standalone;
    if (iOSSafari) {
      return { ok: false, transport: "web", why: "install",
               says: "On iPhone, add Oma to your home screen first — Apple only "
                   + "allows notifications once it is installed. Tap Share, then "
                   + "Add to Home Screen." };
    }
    if (Notification.permission === "denied") {
      return { ok: false, transport: "web", why: "denied",
               says: "Notifications are blocked for Oma. Turn them back on in "
                   + "your browser's settings for this site." };
    }
    return { ok: true, transport: "web" };
  }
  return { ok: false, transport: null, why: "unsupported",
           says: "This browser cannot show notifications." };
}

/* Something a person would recognise in a settings list. Not fingerprinting:
   it is the coarsest possible label, stored against her own row, so "turn this
   one off" means something when she has two phones. */
function deviceLabel() {
  const ua = navigator.userAgent || "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad"
           : /Android/.test(ua) ? "Android phone" : /Mac OS X/.test(ua) ? "Mac"
           : /Windows/.test(ua) ? "Windows PC" : "This device";
  const inApp = pushTransport() === "ios" || pushTransport() === "android";
  return inApp ? os + " app" : os;
}

/* base64url, the form a VAPID key travels in and the form PushManager
   refuses to accept. */
function urlB64ToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* The native side answers asynchronously — it has to go and ask iOS, which
   shows a system prompt. It calls back into window.__omaPushToken. */
let PUSH_WAITING = null;
window.__omaPushToken = function (token, err) {
  if (!PUSH_WAITING) return;
  const w = PUSH_WAITING; PUSH_WAITING = null;
  if (err || !token) w.reject(new Error(err || "no token"));
  else w.resolve(String(token));
};

function askNativeForToken(transport) {
  return new Promise((resolve, reject) => {
    PUSH_WAITING = { resolve, reject };
    // If the wrapper is older than this code and ignores the message, we must
    // not hang forever waiting for a callback that is never coming.
    setTimeout(() => {
      if (PUSH_WAITING) { PUSH_WAITING = null; reject(new Error("the app did not answer")); }
    }, 30000);
    try {
      if (transport === "ios") window.webkit.messageHandlers.omaPush.postMessage({ ask: "token" });
      else window.OmaAndroid.registerForPush();
    } catch (e) { PUSH_WAITING = null; reject(e); }
  });
}

async function askBrowserForToken() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("not allowed");
  // navigator.serviceWorker.ready NEVER resolves when no worker has been
  // registered — it does not reject, it simply waits for the rest of the
  // session. omaa.com.ng serves app.html on its own with no sw.js beside it,
  // so this is the live case today, not a hypothetical one.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(
      () => rej(new Error("no service worker")), 8000)),
  ]);
  // An existing subscription is reused. Unsubscribing and resubscribing on
  // every visit would hand the database a new token each time and quietly
  // fill it with dead rows.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToBytes(PUSH_PUBLIC_KEY),
    });
  }
  return JSON.stringify(sub);
}

/* The only function the rest of the app calls. It does not know, and must
   not learn, which road answered. */
async function registerForPush() {
  const avail = pushAvailability();
  if (!avail.ok) return { ok: false, why: avail.why, says: avail.says };

  let token;
  try {
    token = avail.transport === "web"
      ? await askBrowserForToken()
      : await askNativeForToken(avail.transport);
  } catch (e) {
    const why = (e && e.message) === "not allowed" ? "denied" : "failed";
    return { ok: false, why,
             says: why === "denied"
               ? "No notifications then — you can turn them on later in Settings."
               : "Notifications could not be set up on this device." };
  }

  try {
    await API.registerDevice(avail.transport, token, deviceLabel());
  } catch (e) {
    return { ok: false, why: "server", says: (e && e.message) || "Could not save this device." };
  }
  try { localStorage.setItem("oma-push-token", token); } catch (e) { /* private mode */ }
  return { ok: true, transport: avail.transport };
}

async function forgetPush() {
  let token = null;
  try { token = localStorage.getItem("oma-push-token"); } catch (e) { token = null; }
  if (token) { try { await API.forgetDevice(token); } catch (e) { /* say so below */ } }
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
  } catch (e) { /* the row is gone either way, which is what stops the sending */ }
  try { localStorage.removeItem("oma-push-token"); } catch (e) {}
}

/* ── the one place it is offered ────────────────────── */
/* Asked once, after a booking is paid for — the moment where "tell me when
   she replies" is an obviously good offer rather than an interruption. */
async function offerPushAfterBooking() {
  let asked = null;
  try { asked = localStorage.getItem("oma-push-asked"); } catch (e) {}
  if (asked) return;
  const avail = pushAvailability();
  if (!avail.ok && avail.why !== "install") return;   // nothing worth offering
  try { localStorage.setItem("oma-push-asked", "1"); } catch (e) {}

  if (avail.why === "install") return toast(avail.says);
  const res = await registerForPush();
  toast(res.ok ? "You will be told when she replies."
               : (res.says || "Notifications are off."));
  paint();
}

/* ══ the worker that receives a push ═════════════════
   app.html had no service worker registration at all, which meant Web Push had
   nothing to arrive at — navigator.serviceWorker.ready simply never resolved.
   Registered here rather than on the pwa build because omaa.com.ng serves
   app.html directly.

   Guarded on http(s): inside the iOS wrapper the page is served over a custom
   oma:// scheme, where this neither works nor is wanted — push there is APNs,
   handled natively. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      // Not fatal, and not worth a toast: the app works, it simply will not
      // work offline or receive a web push on this device.
      console.warn("service worker did not register:", e && e.message);
    });
  });
}

/* ── the switch in Settings ──────────────────────────
   Until now the only way to turn notifications on was to finish paying for a
   booking, because that is the one moment worth spending the permission
   prompt on. That is right for a first-time offer and useless for everything
   else: somebody who said no, or who got a new phone, or who simply wants
   them, had no way in. */
function pushIsOn() {
  try { return !!localStorage.getItem("oma-push-token"); } catch (e) { return false; }
}

function pushRow() {
  const avail = pushAvailability();
  const on = pushIsOn();

  // A switch that cannot do anything is worse than a sentence saying why.
  if (!avail.ok && !on) {
    return `<button data-a="push-why" data-v="${esc(avail.says || "")}">
      <span class="ic">${I.bell ? I.bell() : ""}</span>
      <span style="flex:1;text-align:left">Notifications</span>
      <span class="tiny faint" style="margin-right:6px">${
        avail.why === "install" ? "Add to home screen"
        : avail.why === "denied" ? "Blocked"
        : avail.why === "unconfigured" ? "Not set up"
        : "Unavailable"}</span>${I.chev()}</button>`;
  }
  if (API.live() && !API.signedIn()) {
    return `<button data-a="go" data-v="signin">
      <span class="ic">${I.bell ? I.bell() : ""}</span>
      <span style="flex:1;text-align:left">Notifications</span>
      <span class="tiny faint" style="margin-right:6px">Sign in first</span>${I.chev()}</button>`;
  }
  return `<button data-a="push-toggle">
    <span class="ic">${I.bell ? I.bell() : ""}</span>
    <span style="flex:1;text-align:left">Notifications</span>
    <span class="switch ${on ? "on" : ""}"><i></i></span></button>`;
}

async function togglePush() {
  if (pushIsOn()) {
    await forgetPush();
    toast("Notifications off on this device.");
    return paint();
  }
  toast("Asking your phone…");
  const res = await registerForPush();
  toast(res.ok ? "On. You will be told when somebody messages you."
               : (res.says || "That did not work."));
  paint();
}
