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
    read("p14_live.js"), read("p15_chat.js"), read("p16_find.js"), read("p18_review.js"), read("p19_fee.js"),
    push, read("p8_wire.js"),
])

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
