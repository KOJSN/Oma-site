/* Oma service worker — build 1a949b28d8
   Cache first, because everything here is versioned by the cache name and
   nothing in the app is fetched from a server at runtime. The point is not
   speed: it is that a scan started on the bus finishes on the bus. */
const CACHE = "oma-1a949b28d8";
const CORE = ["./", "index.html", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/favicon-32.png"];

self.addEventListener("install", e => {
  // Deliberately NOT skipWaiting: a new build sits ready until the person
  // taps Update. Taking over mid-session would reload the page under them,
  // which in the middle of a scan means losing the scan.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  // A navigation always lands on the app shell, so a deep link or a tech's
  // #t= link opens offline the same as it does online.
  if (req.mode === "navigate") {
    e.respondWith(caches.match("index.html").then(r => r || fetch(req)));
    return;
  }

  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    // heif.js and the web font are cached the first time they are actually
    // needed rather than forced on everyone at install.
    if (res && (res.ok || res.type === "opaque")) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match("index.html"))));
});

/* ══ notifications ═══════════════════════════════════
   Only reached on the Web Push road. Inside the iOS wrapper nothing here
   runs — Apple does not deliver push to a WKWebView — and the native side
   shows the notification instead. Same payload either way, so the two roads
   produce the same words on the lock screen. */
self.addEventListener("push", (e) => {
  let n = { title: "Oma", body: "", data: {} };
  try { n = Object.assign(n, e.data ? e.data.json() : {}); }
  catch (err) { if (e.data) n.body = e.data.text(); }

  e.waitUntil(self.registration.showNotification(n.title, {
    body: n.body,
    icon: "icons/icon-192.png",
    badge: "icons/favicon-32.png",
    // Two messages in one thread replace each other rather than stacking into
    // a wall of the same conversation.
    tag: n.data && n.data.booking_id ? "oma-" + n.data.booking_id : "oma",
    renotify: true,
    data: n.data || {},
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  // Where it should land, as a hash the app reads on boot. The service worker
  // does not know what a route is; it just carries what the database said.
  const to = d.view && d.booking_id ? `#go=${d.view}:${d.booking_id}`
           : d.view ? `#go=${d.view}` : "";

  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      // Already open: bring it forward and tell it where to go, rather than
      // opening a second copy of the app.
      if ("focus" in c) { c.postMessage({ oma: "open", to }); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow("./" + to);
  })());
});
