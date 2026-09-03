/* Oma service worker — build 889f828a30
   Lives at the root of omaa.com.ng, next to app.html.

   This is NOT the pwa/ one. That worker was written for a folder whose shell
   is index.html; here index.html is the landing page and the app is app.html,
   and its install list would have 404'd. cache.addAll is atomic — one missing
   file and the whole install fails — so this one puts each file separately and
   survives a missing icon.

   The shell is served STALE-WHILE-REVALIDATE rather than cache-first. Oma is
   hand-uploaded: a cache-first worker would pin whatever version somebody
   opened first and no upload would ever reach them again. This way the app
   opens instantly from cache, the new copy is fetched in the background, and
   the next launch is current — nobody is ever more than one launch behind, and
   nobody is ever stuck. */

const CACHE = "oma-889f828a30";
const SHELL = "/app.html";
const CORE = [SHELL, "/manifest.webmanifest",
              "/icons/icon-192.png", "/icons/icon-512.png",
              "/icons/maskable-512.png", "/icons/icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // One at a time, ignoring failures: a missing icon must not stop the app
    // from working offline.
    await Promise.all(CORE.map((u) => c.add(u).catch(() => {})));
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

function freshen(req, cache) {
  return fetch(req).then((res) => {
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // CDNs look after themselves

  // A navigation, or the app itself: answer now, update behind.
  const isShell = req.mode === "navigate" || url.pathname === SHELL;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = isShell ? SHELL : req;
    const hit = await cache.match(key);
    const net = freshen(isShell ? new Request(SHELL) : req, cache).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || new Response("Oma is offline and this page was never saved.",
                               { status: 503, headers: { "content-type": "text/plain" } });
  })());
});

/* ══ notifications ═══════════════════════════════════
   Only reached on the Web Push road. Inside the iOS wrapper nothing here runs
   — Apple does not deliver push to a WKWebView — and the native side shows the
   notification instead, from the same payload, so the words on the lock screen
   are the same either way. */
self.addEventListener("push", (e) => {
  let n = { title: "Oma", body: "", data: {} };
  try { n = Object.assign(n, e.data ? e.data.json() : {}); }
  catch (err) { if (e.data) n.body = e.data.text(); }

  e.waitUntil(self.registration.showNotification(n.title, {
    body: n.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-180.png",
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
  const to = d.view && d.booking_id ? `#go=${d.view}:${d.booking_id}`
           : d.view ? `#go=${d.view}` : "";

  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      // Already open: bring it forward and tell it where to go, rather than
      // opening a second copy of the app.
      if ("focus" in c) { c.postMessage({ oma: "open", to }); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(SHELL + to);
  })());
});
