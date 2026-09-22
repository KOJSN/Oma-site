"""Stitch the files in src/ into app.html, and the worker that belongs with it.

Run by GitHub Actions on every push, so nobody builds or uploads anything by
hand. Both outputs are committed back and GitHub Pages serves them.

    python3 build.py

Two files come out and they are a MATCHED PAIR:

    app.html    the whole app
    sw.js       the service worker for that exact app

Both carry the same build id. That is not decoration — an afternoon was lost to
a stale worker quietly serving an old app.html while a fixed bug looked
unfixed. Now Settings prints the id, the worker's first line prints the id, and
they agree only when the pair that was built together is the pair that is live.
"""
import hashlib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
# Sources live in src/ when there is one, and beside this file when there
# is not. Both layouts are tested and produce byte-identical output.
SRC = HERE / "src" if (HERE / "src" / "p3_core.js").exists() else HERE

read = lambda n: (SRC / n).read_text(encoding="utf-8")

# The scan engine is assembled from its own pieces first, and the ruleset is
# minified into it so the page carries its own thresholds.
core = read("p3_core.js")
core = core.replace("__DETECTOR__", read("core_detector.js"))
core = core.replace("__AUTO__", read("core_auto.js"))
core = core.replace("__MARK__", read("core_mark.js"))
core = core.replace("__ENGINE__", read("core_engine.js"))
core = core.replace("__RULES__",
                    json.dumps(json.loads(read("rules.min.json")),
                               separators=(",", ":")))

# The VAPID public key. It is the half of the pair that identifies the sender
# and is meant to ship inside the app; the private half lives only in Supabase's
# secrets and must never appear here. Without it the app says notifications are
# not switched on for this build, rather than half-working.
push = read("p17_push.js")
vapid = SRC / "vapid_public.txt"
if vapid.exists():
    push = push.replace("__VAPID_PUBLIC__", vapid.read_text().strip())

# Order matters: a reader following the file top to bottom should meet a thing
# before its use, and p8_wire references everything, so it goes last.
js = "\n".join([
    core,
    read("p9_sheet.js"), read("p10_sheetpage.js"), read("p11_qr.js"),
    read("p12_api.js"), read("p4_result.js"), read("p5_views.js"),
    read("p6_views2.js"), read("p7_views3.js"), read("p13_money.js"),
    read("p14_live.js"), read("p15_chat.js"), read("p16_find.js"), read("p18_review.js"), read("p19_fee.js"), read("p20_live.js"), read("p21_home.js"), read("p22_photos.js"), read("p24_points.js"),
    push, read("p8_wire.js"),
])

# ── the app's own backend details ────────────────────────────────────
#
# Baked in so nobody has to paste a project URL and a key into a phone. That
# step is why real accounts signed up, filled in a listing, and had every word
# of it saved to their own device and nowhere else.
#
# The ANON key belongs in here. It is public by design: it names the project,
# not the person, and every function it can reach checks who is calling before
# it answers — it is already printed inside every copy of every Supabase app on
# every phone. The service_role key bypasses all of that, and this refuses to
# build if it sees one.
#
# One place to fill in: the website's oma-config.js, which has to carry the same
# two values anyway. src/supabase_public.txt (url on line 1, anon on line 2)
# overrides it when the app and the site need different projects.
url = anon = ""
pub = SRC / "supabase_public.txt"
if pub.exists():
    lines = [l.strip() for l in pub.read_text(encoding="utf-8").splitlines() if l.strip()]
    if len(lines) >= 2:
        url, anon = lines[0], lines[1]
else:
    # root, beside build.py, and inside src/ — oma-config.js lives at the
    # repo root while build.py may sit in src/, so look both ways.
    for candidate in (HERE / "oma-config.js", HERE.parent / "oma-config.js",
                      SRC / "oma-config.js", SRC.parent / "oma-config.js"):
        if candidate.exists():
            t = candidate.read_text(encoding="utf-8")
            m_url = re.search(r'url\s*:\s*["\']([^"\']*)["\']', t)
            m_anon = re.search(r'anon\s*:\s*["\']([^"\']*)["\']', t)
            if m_url and m_anon:
                url, anon = m_url.group(1).strip(), m_anon.group(1).strip()
            break

if "service_role" in anon or "service_role" in url:
    sys.exit("REFUSING TO BUILD: that is the service_role key. It bypasses every "
             "permission check in the database and must never ship in the app. "
             "Use the anon / publishable key.")

url = url.rstrip("/")
js = js.replace("__SUPABASE_URL__", url).replace("__SUPABASE_ANON__", anon)

# The decoder rides in a text/plain script and is eval'd only when a HEIC photo
# actually arrives, so a closing tag inside it would end the block early.
heif = read("libheif-bundle.js").replace("</script", "<\\/script")

html = (read("p1_head.html")
        + read("p2_body.html")
        + '<script type="text/plain" id="heifsrc">' + heif + '</script>\n'
        + "<script>\n" + js + "\n</script>\n</body>\n</html>\n")

# Hashed while __BUILD__ is still a placeholder, then substituted into both
# files. Hashing the finished page instead would change the hash by writing it
# in, and the id could never describe the file it lives in.
stamp = hashlib.sha256(html.encode("utf-8")).hexdigest()[:10]
if "__BUILD__" not in html:
    sys.exit("src/p3_core.js has lost its __BUILD__ placeholder — Settings would "
             "show the literal text instead of the build id. Refusing to build.")
html = html.replace("__BUILD__", stamp)

(HERE / "app.html").write_text(html, encoding="utf-8")
(HERE / "sw.js").write_text(
    read("sw.js.template").replace("__BUILD__", stamp), encoding="utf-8")

print(f"build {stamp}")
print(f"  app.html  {(HERE / 'app.html').stat().st_size / 1e6:.2f} MB")
print(f"  sw.js     {(HERE / 'sw.js').stat().st_size} bytes")
print(f"  backend   {url or 'NOT SET — the app will ship in practice mode'}")
