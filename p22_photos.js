/* ══ HER WORK, UNDER EACH SERVICE ══════════════════════════════════════
   Kamsy, 8 Sep 2026: "let the nail tech upload the picture under each service
   that she uploads — that's if she has."

   ── "that's if she has" ─────────────────────────────────────────────

   That clause is the whole brief for the empty state. Most techs will have no
   photographs on the day they list themselves, and a listing that looks
   broken until she finds some is a listing she abandons. So: no grey
   placeholder boxes, no "no photos yet" apology on the customer's side. A
   service with pictures shows them; a service without simply does not.

   ── the shrinking, and why it happens here ──────────────────────────

   A photograph off a Nigerian phone is three to six megabytes. Uploading that
   costs her data, costs the customer data every time it is looked at, and
   fills the free storage tier in a few hundred pictures.

   So it is resized to 1200px on the long edge and re-encoded as JPEG at 0.82
   before a single byte leaves the phone — about 150 kB, which is more than
   enough to judge a set of nails on a screen the size of a hand.

   The decoding reuses the scan's machinery, HEIC and all. iPhones save HEIC
   by default and no desktop browser decodes it; without this a nail tech on
   an iPhone would meet "that file is not an image" and conclude Oma was
   broken. That decoder is already in the page for the hand scan and this
   costs nothing to reuse.

   ── what this file does NOT decide ──────────────────────────────────

   Three per service, whose folder a file may go in, and whether a photo is
   visible: all of that is in photo.sql, enforced in the database. A cap the
   page enforces is a cap anyone with the anon key ignores.                */

const PHOTO_MAX_PX = 1200;
const PHOTO_QUALITY = 0.82;
const PHOTOS_PER_SERVICE = 3;

/* Whatever the phone hands over — JPEG, PNG, HEIC — as a canvas. */
async function photoToCanvas(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (isHeif(head)) return decodeHeif(file);          // p3_core.js
  const im = await decodeStandard(file);              // p3_core.js
  const c = document.createElement("canvas");
  c.width = im.naturalWidth || im.width;
  c.height = im.naturalHeight || im.height;
  c.getContext("2d").drawImage(im, 0, 0);
  return c;
}

/* Down to 1200px on the long edge, as a JPEG. Never UP: a small photograph
   scaled up is a bigger file that looks worse. */
function shrinkToBlob(canvas, maxPx, quality) {
  const w = canvas.width, h = canvas.height;
  const sc = Math.min(1, (maxPx || PHOTO_MAX_PX) / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * sc));
  c.height = Math.max(1, Math.round(h * sc));
  const g = c.getContext("2d");
  // A white ground, because a transparent PNG re-encoded as JPEG turns black
  // otherwise, and a nail photo on black looks like a mistake.
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(canvas, 0, 0, c.width, c.height);
  return new Promise((res) => {
    c.toBlob((b) => res({ blob: b, w: c.width, h: c.height }),
             "image/jpeg", quality || PHOTO_QUALITY);
  });
}

/* A name nobody can guess and nothing can collide with, inside her own
   folder — which is what photo.sql and the storage policy both check. */
function photoPath(techId, serviceId) {
  const r = (crypto.getRandomValues(new Uint8Array(8)));
  const hex = [...r].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${techId}/${serviceId}-${hex}.jpg`;
}

/* ── uploading one ───────────────────────────────────────────────────
   Bytes first, row second. If the row fails the file is orphaned, which
   costs a few kilobytes; if it were the other way round a listing would
   show a broken image, which costs a booking. */
async function uploadServicePhoto(serviceId, file, ownWork) {
  const canvas = await photoToCanvas(file);
  const { blob, w, h } = await shrinkToBlob(canvas);
  if (!blob) throw new Error("That photo could not be prepared.");

  if (API.isMock()) {
    // The practice app has no Storage. A data URL stands in — small, because
    // it has been through exactly the same shrinking.
    const url = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
    return API.addPhoto(serviceId, url, w, h, blob.size, ownWork);
  }

  const who = await API.me();
  const techId = who && who.tech && who.tech.id;
  if (!techId) throw new Error("List yourself first — photos go under your services.");
  const path = photoPath(techId, serviceId);
  await API.storagePut(path, blob, "image/jpeg");
  return API.addPhoto(serviceId, path, w, h, blob.size, ownWork);
}

/* ══ the tech's side ═══════════════════════════════════════════════════ */

/* Her own photographs, while she is editing. Kept on PHOTOS so the editor can
   redraw without re-fetching — the service list is rebuilt every time she adds
   or removes a row. */
let PHOTOS = {};          // { serviceId: [{ id, path, w, h }] }
let PHOTO_BUSY = null;    // the service currently uploading, if any

async function loadMyPhotos() {
  if (!API.signedIn()) { PHOTOS = {}; return; }
  try {
    const me = await API.me();
    const id = me && me.tech && me.tech.id;
    PHOTOS = id ? (await API.techPhotos(id)) || {} : {};
  } catch (e) { PHOTOS = {}; }
  paintSvcPhotos();
}

/* The strip under one service in the editor. A service with no id yet — she
   has typed a name but not saved — cannot have photographs, and says so
   rather than offering a button that would fail. */
function svcPhotoRow(s, i) {
  if (!s.id) {
    return `<div class="tiny faint" style="margin-top:9px">
      Save your listing and you can add photos of this one.</div>`;
  }
  const list = PHOTOS[s.id] || [];
  const busy = PHOTO_BUSY === s.id;
  const room = list.length < PHOTOS_PER_SERVICE;
  return `<div class="shots" data-shots="${esc(s.id)}">
    ${list.map((p) => `<div class="shot">
        <img src="${esc(API.photoUrl(p.path))}" alt="" loading="lazy">
        <button class="x" data-a="photo-del" data-id="${esc(p.id)}"
                aria-label="Remove this photo">×</button>
      </div>`).join("")}
    ${busy ? `<div class="shot add"><span class="tiny faint">Adding…</span></div>` : ""}
    ${room && !busy ? `<label class="shot add">
        <input type="file" accept="image/*" data-photo="${esc(s.id)}">
        <span aria-hidden="true">+</span>
        <span class="tiny faint">Add</span>
      </label>` : ""}
  </div>
  ${list.length || busy ? "" : `<div class="tiny faint" style="margin-top:7px">
    Up to ${PHOTOS_PER_SERVICE} photos of this service. Optional — a listing
    works without them.</div>`}`;
}

/* Redraw only the strips. paint() would rebuild the editor and lose a
   half-typed price, and an upload takes long enough that she will be typing. */
function paintSvcPhotos() {
  document.querySelectorAll("[data-shots]").forEach((el) => {
    const id = el.dataset.shots;
    const list = PHOTOS[id] || [];
    const busy = PHOTO_BUSY === id || PHOTO_BUSY === Number(id);
    const box = document.createElement("div");
    box.innerHTML = svcPhotoRow({ id }, 0);
    const next = box.querySelector("[data-shots]");
    if (next) el.replaceWith(next);
  });
}

/* The tick box. Asked once, above the whole menu rather than on every upload:
   the same answer three times in a row is a form somebody stops reading. */
function ownWorkBox() {
  return `<label class="own">
    <input type="checkbox" id="ownWork" checked>
    <span>These are nails <b>I did myself</b>. Photos of somebody else's work
      can have your listing taken down.</span>
  </label>`;
}
const ownWorkTicked = () => {
  const el = document.getElementById("ownWork");
  return !el || el.checked;
};

/* One delegated change listener, because the service list is re-rendered
   whenever she adds or removes a row and a bound one would be lost. */
document.addEventListener("change", async (e) => {
  const inp = e.target;
  if (!inp || !inp.dataset || !inp.dataset.photo) return;
  const serviceId = inp.dataset.photo;
  const file = inp.files && inp.files[0];
  inp.value = "";                       // so the same file can be chosen twice
  if (!file) return;

  if (!ownWorkTicked()) {
    return toast("Tick the box to say the nails are your own work.");
  }
  if (file.size > 25 * 1024 * 1024) {
    // Before decoding, not after: a 40 MP image can exhaust a phone's memory
    // in the canvas rather than failing politely.
    return toast("That photo is very large. Try one under 25 MB.");
  }

  PHOTO_BUSY = serviceId;
  paintSvcPhotos();
  try {
    const isNum = /^\d+$/.test(serviceId);
    await uploadServicePhoto(isNum ? Number(serviceId) : serviceId, file, true);
    await loadMyPhotos();
    toast("Photo added.");
  } catch (err) {
    toast(err.message || "That photo would not upload.");
  } finally {
    PHOTO_BUSY = null;
    paintSvcPhotos();
  }
});

async function deleteMyPhoto(id) {
  try {
    const r = await API.removePhoto(/^\d+$/.test(id) ? Number(id) : id);
    if (r && r.path && !API.isMock()) API.storageDelete(r.path);
    await loadMyPhotos();
    toast("Photo removed.");
  } catch (err) { toast(err.message || "Could not remove that."); }
}

/* ══ the customer's side ═══════════════════════════════════════════════ */

let TECHPHOTOS = {};      // the tech currently being looked at

/* The photographs inside one service card: a swipeable gallery with the
   scrim and the dots. No lightbox — a full-screen viewer is a second thing to
   get right on a slow connection, and at this size the work is already
   legible.

   A service with none returns nothing at all, and the card stays the Oma
   gradient. That is "that's if she has": no grey box, no broken-image icon,
   no apology on a listing that is otherwise fine. */
function svcShots(serviceId) {
  const list = TECHPHOTOS[serviceId] || [];
  if (!list.length) return "";
  return `<div class="svcpix" data-gal="${esc(serviceId)}">
      ${list.map((p) => `<div class="pane">
        <img src="${esc(API.photoUrl(p.path))}" alt="Nails by this tech" loading="lazy">
        <button class="svcflag" data-a="photo-report" data-id="${esc(p.id)}"
                aria-label="Report this photo" title="Report this photo">⚑</button>
      </div>`).join("")}
    </div>
    ${list.length > 1 ? `<div class="svcdots" data-dots="${esc(serviceId)}">
      ${list.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}
    </div>` : ""}`;
}

/* Which one she is looking at. A scroll listener rather than an
   IntersectionObserver: one number, no observers to tear down when the card
   is repainted, and it is exact rather than threshold-dependent. */
function wireGalleries() {
  document.querySelectorAll("[data-gal]").forEach((gal) => {
    if (gal.dataset.wired) return;
    gal.dataset.wired = "1";
    gal.addEventListener("scroll", () => {
      const dots = document.querySelector(`[data-dots="${gal.dataset.gal}"]`);
      if (!dots) return;
      const i = Math.round(gal.scrollLeft / Math.max(1, gal.clientWidth));
      [...dots.children].forEach((d, n) => d.classList.toggle("on", n === i));
    }, { passive: true });
  });
}

async function fillTechPhotos(techId) {
  try { TECHPHOTOS = (await API.techPhotos(techId)) || {}; }
  catch (e) { TECHPHOTOS = {}; return; }
  document.querySelectorAll("[data-shotslot]").forEach((el) => {
    el.innerHTML = svcShots(el.dataset.shotslot);
    // The card only becomes a photograph when there IS one. Without this the
    // gallery is empty, the caption is absolutely positioned, and the whole
    // card collapses to nothing — the service disappears off her page.
    const card = el.closest(".svccard");
    if (card) card.classList.toggle("haspix", !!el.firstElementChild);
  });
  wireGalleries();
}

async function reportPhoto(id) {
  // A prompt rather than a form: reporting has to be two taps or nobody does
  // it, and the reason is useful but not required.
  const why = prompt("What is wrong with this photo? (optional)");
  if (why === null) return;               // she changed her mind
  try {
    await API.reportPhoto(/^\d+$/.test(id) ? Number(id) : id, why);
    // The same words whatever happened, including for a photo that was already
    // reported or does not exist. What Oma does about it is not this screen's
    // business to narrate.
    toast("Thank you — Oma will look at it.");
  } catch (e) {
    toast("Thank you — Oma will look at it.");
  }
}
