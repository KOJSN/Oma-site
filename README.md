# Oma

The app at [omaa.com.ng/app.html](https://omaa.com.ng/app.html), and the landing
page at [omaa.com.ng](https://omaa.com.ng).

## How to change something

**Edit a file in `src/` and commit. That is the whole process.**

GitHub rebuilds `app.html` and `sw.js`, commits them back, and Pages serves the
new version about a minute later.

Watch it under the **Actions** tab. A green tick means the new version is live.
A red cross means the build refused and **nothing was published** — the old app
keeps running, which is the point.

Never edit `app.html` or `sw.js` by hand. They are generated, and the next build
overwrites whatever you put there.

## The two generated files are a pair

`app.html` and `sw.js` are built together and both carry the same build id.

This matters more than it sounds. `sw.js` is the service worker: it caches the
app so it opens instantly and works offline. If the worker is older than the
app, it keeps handing out the version it cached, and the site serves an old app
while the new one sits on the server untouched. Nothing on screen says so.

An afternoon was lost to exactly that — a bug was chased that had already been
fixed, twice, because the phone was running an old `app.html` behind a stale
worker. Three defences came out of it:

- **The build id is on screen.** Settings, at the bottom: `Build 81515c67a8`.
  The worker's first line carries the same id. If they disagree, the deploy is
  the problem, not the code.
- **The build refuses to publish a mismatched pair.** The workflow compares the
  two ids and fails the job rather than shipping them.
- **This automation.** Both files are now built and committed by the same job,
  so they cannot come from different builds or be uploaded one without the
  other.

To see what the SERVER has, ignoring every cache, open the app in an incognito
window — no service worker is registered there.

If an iPhone home-screen install is stuck on an old version: delete the icon,
Safari → Clear History and Website Data, reopen and add it again. Reloading
does not clear a worker.

## What is in `src/`

| File | What it holds |
|---|---|
| `p1_head.html`, `p2_body.html` | The page: styles and every screen's markup |
| `p3_core.js` | State, helpers, and the build id placeholder |
| `core_detector.js` | Finds the nail's outline from a seed point |
| `core_auto.js` | The automatic read — MediaPipe landmarks, then the detector |
| `core_mark.js` | Tapping and dragging the outlines by hand |
| `core_engine.js` | Turns measurements into a shape |
| `rules.min.json` | The shape thresholds |
| `p4`–`p7` | Result screen and the customer's views |
| `p8_wire.js` | Every click in the app arrives here |
| `p9`–`p11` | Guide sheet, printable page, QR codes |
| `p12_api.js` | Everything that talks to Supabase |
| `p13_money.js` | Sign-in, cart, payment |
| `p14_live.js` | Map and home |
| `p15_chat.js` | Messages between customer and tech |
| `p16_find.js` | Searching for a nail tech |
| `p17_push.js` | Notifications, on all three transports |
| `sw.js.template` | The service worker, before its build id is stamped in |
| `vapid_public.txt` | The **public** half of the notification key pair |
| `libheif-bundle.js` | Decodes iPhone HEIC photos |

`vapid_public.txt` is public by design — it identifies the sender and ships
inside the app. **The private half must never be in this repository.** It lives
only in Supabase's Edge Function secrets.

## What is not built

`manifest.webmanifest`, `icons/` and the landing page are static. Edit them
directly; they are served as they are.
