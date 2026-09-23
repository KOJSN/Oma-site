/* Oma service worker — build b282be4546
   Lives at the root of omanails.com, next to app.html.

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

const CACHE = "oma-b282be4546";
const SHELL = "/app.html";
/* "/" is in here so the landing page survives offline too. It could be left
   out and the site would still work online — but a worker that caches the app
   and not the page people actually arrive on is a strange thing to ship.
   /manifest.webmanifest is stamped per build (build.py) so this worker caches the
   SAME manifest its own html links to — customer's own manifest.webmanifest,
   tech's own techapp-manifest.webmanifest — not always the customer one. */
const CORE = [SHELL, "/", "/manifest.webmanifest",
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

  /* Only the APP is the shell.
     This used to read `req.mode === "navigate" || url.pathname === SHELL`,
     and req.mode is "navigate" for EVERY page load on this origin — so once
     the worker was installed, somebody who searched for Oma and tapped the
     result was handed app.html instead of the landing page she asked for.
     There is no redirect anywhere in index.html; the request never reached
     it. This origin serves two documents and only /app.html is the app. */
  const isShell = url.pathname === SHELL;

  /* THE ADMIN PAGE IS NEVER CACHED, and finding out why cost an evening.
     Everything below is stale-while-revalidate: a hit is served from the
     cache and the fresh copy is fetched behind it, for NEXT time. For the
     app that is exactly right — it opens instantly and nobody is ever more
     than one launch behind.

     For a dashboard it is wrong twice over. Kamsy uploads a new admin.html,
     opens it, and is served the copy from before the upload while the new
     one quietly lands in the cache — so the honest answer to "did my change
     deploy" is "yes, and you will see it the time after next", which reads
     exactly like nothing happened. And separately: a dashboard showing
     yesterday's page is a dashboard nobody can trust on the one morning it
     matters.

     So this one document goes straight to the network, every time. It is a
     page she opens on purpose, on a connection, a handful of times a day;
     there is nothing to gain by having it offline and a great deal to lose
     by having it stale. */
  if (url.pathname === "/admin.html" || url.pathname === "/admin") return;

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
