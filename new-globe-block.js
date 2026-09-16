/* Kamsy, 16 Sep 2026: "let tech accounts be purple and customers pink."
   The violet is not from Oma's palette, because Oma's palette is entirely
   pinks — a second pink would be a shade nobody can name at eight pixels.
   This one is far enough round the wheel to be told apart at a glance and
   still cool against the pink rather than fighting it. */
const TECH_PINK   = "#f0518d";
// Reported beats everything. A person who is both a nail tech and the subject
// of an open report is drawn red, because the question "who has been reported"
// is the one somebody scans this globe for, and a purple dot hiding a report
// is the failure mode worth designing against.
const TECH_RED    = "#e0352f";
const TECH_PURPLE = "#8b5cf6";
const colourOf = (d) => d.reported ? TECH_RED : d.tech ? TECH_PURPLE : TECH_PINK;

/* ══ two globes, and why ══════════════════════════════════════════════
   Kamsy, 16 Sep 2026: "let me also be able to see streets too in countries
   yh like so detailed."

   One picture painted on the sphere cannot do that, and no bigger picture
   can either. earth-oma.png is 8192 pixels round the equator — about five
   kilometres a pixel — so zooming into it finds no streets, only larger
   squares. Streets have to be fetched for the patch you are looking at.
   That is what a slippy map does, and three-globe can put slippy tiles on
   a sphere, so below MAP_FROM this stops being a drawn earth and becomes a
   real map.

   FAR — above MAP_FROM: the black-and-white earth she chose. No network,
   no third party, and it reads as Oma's world rather than as a map widget.
   People are 3D dots that scale with the sphere.

   NEAR — below MAP_FROM: live tiles, down to about zoom 14: the road
   network, named streets, the lot. People become fixed-size pins. Both
   halves of that are forced. A 3D dot is a cylinder that globe.gl will not
   draw shorter than six kilometres, so at street range the camera ends up
   INSIDE it and the dot vanishes; and a dot that keeps growing as you zoom
   would bury the very streets she zoomed in to see.

   WHAT DOES NOT CHANGE IS WHAT IS KNOWN. signup_lat is rounded to 0.1° by
   the column type itself — about eleven kilometres — so a pin sitting on a
   particular road is not evidence that anybody is on that road. The panel
   says so when you tap, and the streets under it are context, not
   precision. Zooming cannot reveal what was never collected.

   The tiles are OpenStreetMap via the free tile server. The licence
   requires attribution and the caption carries it; it is not decoration and
   it does not come out. */
const MAP_FROM = 0.6;    // altitude, in globe radii, where the map takes over
const HOME_ALT = 1.85;   // the opening view
const DOT      = 0.5;    // dot radius in degrees, at the opening view
const CELL     = 0.05;   // and the floor: half of the 0.1° the data actually has
const TILE_URL = (x, y, l) =>
  "https://tile.openstreetmap.org/" + l + "/" + x + "/" + y + ".png";

let GLOBE = null, globeLib = null, GLOBE_MAP = false, GLOBE_ROWS = [];
let dotR = DOT, dotAlt = 0.02, spreadAt = 0;

function loadGlobeLib() {
  if (window.Globe) return Promise.resolve();
  if (globeLib) return globeLib;
  globeLib = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/globe.gl@2/dist/globe.gl.min.js";
    s.onload = res;
    s.onerror = () => { globeLib = null; rej(new Error("no globe")); };
    document.head.appendChild(s);
  });
  return globeLib;
}

/* Several people share one rounded coordinate and would be one dot. Each is
   pushed onto a small ring around the shared point so every one of them is
   separately tappable — the ring is sized against whatever is being drawn,
   never against the world, and the coordinate shown when you tap is the real
   one. The first person stays put so the true point is always occupied. */
function spread(rows, ring) {
  const at = {};
  rows.forEach((p) => {
    const k = p.lat + "," + p.lng;
    const i = (at[k] = (at[k] || 0) + 1) - 1;
    // Six to a ring, then a wider one. A radius of a whole dot DIAMETER, not
    // half of one, or six neighbours sit on each other.
    const r = i === 0 ? 0 : ring * (1 + Math.floor((i - 1) / 6) * 0.85);
    const a = i === 0 ? 0 : ((i - 1) % 6) * (Math.PI / 3);
    p.dLat = p.lat + r * Math.sin(a);
    p.dLng = p.lng + r * Math.cos(a);
  });
  return rows;
}

function pinFor(d) {
  const e = document.createElement("div");
  e.className = "pin";
  e.style.background = colourOf(d);
  e.title = d.name + (d.reported ? " · reported" : "");
  e.addEventListener("click", () => showPerson(d));
  return e;
}

/* One dot per person. The earlier version drew grouped cells with counts and
   no names; see globe.sql for why that changed. */
async function drawGlobe(g) {
  const slot = document.getElementById("globe");
  const cap = document.getElementById("globeCap");
  const who = document.getElementById("globeWho");
  if (!slot || !cap) return;
  if (who) { who.style.display = "none"; who.innerHTML = ""; }

  if (!g) {
    slot.innerHTML = '<div style="color:#8a8296;font-size:13px;padding:24px;text-align:center">'
      + 'Run <b>globe.sql</b> in the SQL editor to switch this on.</div>';
    cap.textContent = "";
    return;
  }

  // An older globe.sql is still installed: it returns `cells`, not `people`.
  // Say which file rather than drawing nothing and looking broken.
  if (!g.people && g.cells) {
    slot.innerHTML = '<div style="color:#8a8296;font-size:13px;padding:24px;text-align:center">'
      + 'Re-run <b>globe.sql</b> — this is the older version, which grouped people '
      + 'instead of naming them.</div>';
    cap.textContent = "";
    return;
  }

  const people = (g.people || []).filter(p => p && p.lat != null && p.lng != null);
  const total = Number(g.total || 0);
  const reported = Number(g.reported || 0);

  const key = (colour, word, n) =>
    '<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px">'
    + '<i style="width:9px;height:9px;border-radius:50%;background:' + colour
    + ';display:inline-block"></i>' + n + " " + word + (n === 1 ? "" : "s") + "</span>";

  const techs = people.filter(p => p.tech && !p.reported).length;
  const custs = people.filter(p => !p.tech && !p.reported).length;
  const missing = Math.max(0, total - people.length);

  // OpenStreetMap's licence requires attribution, and the sentence
  // about eleven kilometres is here for the same reason: a page that draws a
  // pin on a named street has to say what the pin does not know.
  const credit =
    '<div class="sub" style="font-size:11.5px;margin-top:6px">'
    + 'Zoom in past a country for streets · every dot is accurate to about 11 km, '
    + 'however far you zoom · map '
    + '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">'
    + '&copy; OpenStreetMap</a> contributors'
    + "</div>";

  cap.innerHTML = people.length
    ? key(TECH_PINK, "customer", custs)
      + key(TECH_PURPLE, "nail tech", techs)
      + (reported ? key(TECH_RED, "reported", reported) : "")
      + '<span class="sub">tap a dot for who it is'
      // The people who are NOT drawn matter as much as the ones who are, or a
      // sparse globe reads as a sparse marketplace.
      + (missing ? " · " + missing + " not shown (no location yet)" : "")
      + "</span>" + credit
    : "Nobody has a location yet. It is recorded the first time somebody opens "
      + "Oma signed in, and only if they have already allowed location.";

  if (!people.length) {
    slot.innerHTML = '<div style="color:#8a8296;font-size:13px;padding:24px;text-align:center">'
      + 'No dots yet.</div>';
    return;
  }

  try { await loadGlobeLib(); }
  catch (e) {
    slot.innerHTML = '<div style="color:#8a8296;font-size:13px;padding:24px;text-align:center">'
      + 'The globe could not be downloaded. Everything else on this page is fine.</div>';
    return;
  }

  GLOBE_ROWS = people.map(p => ({
    id: p.id, name: p.name, email: p.email,
    tech: !!p.tech, reported: !!p.reported, joined: p.joined,
    lat: Number(p.lat), lng: Number(p.lng),
    dLat: Number(p.lat), dLng: Number(p.lng),
  }));

  if (!GLOBE) {
    slot.innerHTML = "";
    GLOBE = Globe()(slot)
      .backgroundColor("rgba(0,0,0,0)")
      .globeImageUrl("/earth-oma.png")
      .globeTileEngineMaxLevel(17)
      .atmosphereColor("#b9b6c2")
      .atmosphereAltitude(0.18)
      // far: dots drawn on the sphere
      .pointLat("dLat").pointLng("dLng")
      .pointColor(colourOf)
      .pointRadius(() => dotR)
      .pointAltitude(() => dotAlt)
      .pointLabel(d => '<div style="background:#17131e;color:#f7f4f9;border-radius:10px;'
        + 'padding:7px 11px;font:600 12px system-ui">' + esc(d.name)
        + (d.reported ? " · reported" : "") + "</div>")
      .onPointClick(showPerson)
      // near: pins floating over the map
      .htmlLat("dLat").htmlLng("dLng").htmlAltitude(0)
      .htmlTransitionDuration(0)
      .htmlElement(pinFor)
      .onZoom(onGlobeZoom);

    GLOBE.onGlobeReady(relightGlobe);

    GLOBE.controls().autoRotate = true;
    GLOBE.controls().autoRotateSpeed = 0.35;
    GLOBE.pointOfView({ lat: 9, lng: 8, altitude: HOME_ALT }, 0);

    const fit = () => { if (GLOBE) GLOBE.width(slot.clientWidth).height(slot.clientHeight); };
    fit();
    window.addEventListener("resize", fit);
  }

  spreadAt = 0;                       // force a re-lay for the new rows
  onGlobeZoom(GLOBE.pointOfView());
}

/* Everything that depends on how close the camera is: which earth, how big a
   dot, how far apart people standing in the same town are drawn. */
function onGlobeZoom(pov) {
  if (!GLOBE || !pov) return;
  const alt = pov.altitude;
  const map = alt < MAP_FROM;

  if (map !== GLOBE_MAP) {
    GLOBE_MAP = map;
    GLOBE.globeTileEngineUrl(map ? TILE_URL : null);
    relightGlobe();
    // A map spinning under your nose at street level is unusable. It picks up
    // again on the way back out, unless a panel is open.
    GLOBE.controls().autoRotate = !map && !panelOpen();
  }

  if (map) {
    // Pins are a fixed size on screen, so their ring has to be a fixed size on
    // screen too: degrees per pixel scale with altitude, so the ring does.
    const ring = Math.min(1.5, 2.2 * alt);
    if (!spreadAt || ring / spreadAt > 1.2 || spreadAt / ring > 1.2) {
      spreadAt = ring;
      GLOBE.pointsData([]).htmlElementsData(spread(GLOBE_ROWS, ring));
    }
    return;
  }

  // A dot holds its size on screen as you zoom — until it reaches CELL, which
  // is half of the 0.1° the coordinate actually resolves. Past that it grows,
  // and it should: it is showing you the area the answer covers.
  const r = Math.max(CELL, Math.min(DOT, DOT * (alt / HOME_ALT)));
  const a = Math.min(0.02, alt * 0.011);
  if (!spreadAt || r / dotR > 1.2 || dotR / r > 1.2 || a / dotAlt > 1.2 || dotAlt / a > 1.2) {
    dotR = r; dotAlt = a; spreadAt = r;
    GLOBE.htmlElementsData([]).pointsData(spread(GLOBE_ROWS, r * 2.3));
  }
}

/* The texture is moved to the material's EMISSIVE channel and the directional
   light killed, which is what makes the earth read as drawn rather than as a
   lit ball. The ambient light has to stay up regardless: globe.gl's dots and
   its map tiles are both lit materials, and at 5.4 they come out the colour
   they were given. There is no material map while tiles are drawing, which is
   what the guard is for. */
function relightGlobe() {
  if (!GLOBE) return;
  const m = GLOBE.globeMaterial();
  if (m && m.map) {
    if (m.emissive) m.emissive.setRGB(1, 1, 1);
    if (m.color) m.color.setRGB(0, 0, 0);
    m.emissiveMap = m.map;
    m.emissiveIntensity = 1;
    m.needsUpdate = true;
  }
  (GLOBE.lights() || []).forEach((l) => {
    if (l.isDirectionalLight) l.intensity = 0;
    else if (l.isAmbientLight) l.intensity = 5.4;
  });
}

function panelOpen() {
  const who = document.getElementById("globeWho");
  return !!(who && who.style.display === "block");
}
