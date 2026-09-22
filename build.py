"""Stitch the source files into app.html and techapp.html, and the service
worker that belongs with each.

Run by GitHub Actions on every push, so nobody builds or uploads anything by
hand. All four outputs are committed back and GitHub Pages serves them.

    python3 build.py

Two MATCHED PAIRS come out:

    app.html       sw.js           the customer/full app
    techapp.html   techapp-sw.js   the same app, locked to tech mode at boot

Both files in a pair carry the same build id. That is not decoration — an
afternoon was lost to a stale worker quietly serving an old app.html while a
fixed bug looked unfixed. Now Settings prints the id, the worker's first line
prints the same id, and they agree only when the pair that was built together
is the pair that is live. Each pair has its own worker and its own cache name
so app.html and techapp.html never fight over one another's cached copy.

techapp.html is NOT a second codebase. It is assembled from the exact same
p*.js files as app.html — same auth, same chat, same bookings, same API —
because those functions call into each other too much for splitting "just
the tech screens" out to be safe. The only difference between the two is one
substituted constant, APP_MODE (see p3_core.js), which p8_wire.js's boot()
reads to skip straight into tech mode and never offer the customer home
screen. A bug fixed in one is fixed in both, because they are the same file
wearing two different first screens.

The sources sit beside this file, in the root of the repository. They were
meant to live in src/, and a folder drag-and-drop into GitHub flattened them.
Rather than move twenty-five files by hand through a web page, this looks in
both places — src/ first if it exists, then here — so tidying up later is a
move, not a rewrite.
"""
import hashlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
SRC = HERE / "src" if (HERE / "src" / "p3_core.js").exists() else HERE


def read(name):
    return (SRC / name).read_text(encoding="utf-8")


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
# secrets and must never appear in this repository. Without it the app says
# notifications are not switched on for this build, rather than half-working.
push = read("p17_push.js")
vapid = SRC / "vapid_public.txt"
if vapid.exists():
    push = push.replace("__VAPID_PUBLIC__", vapid.read_text().strip())

# Order matters: a reader following the file top to bottom should meet a thing
# before its use, and p8_wire references everything, so it goes last.
#
# 22 Sep 2026 fix: this list stopped at p16/p17 and silently dropped six
# files that exist right beside it on disk — p18_review.js, p19_fee.js,
# p20_live.js, p21_home.js, p22_photos.js, p24_points.js. Nothing in
# build.py enforces that every p*.js file gets used, so this went
# unnoticed until app.html threw "reviewNudge is not defined" live —
# reviewNudge is defined in p18_review.js, called from p14_live.js, and
# p18_review.js was simply never in this list, so it never made it into
# the built page. Reviews, the fee breakdown, home service, photo
# uploads, and O points were ALL missing from every build since these
# files were added, for the same reason. Added in numeric order, same
# place push/p17 already sat: after everything else, still before
# p8_wire, which has to stay last because it's the one file that reaches
# into all the others.
#
# p23_reveal.js is NOT added here — that one's absence is not a bug. The
# try-on reveal was deliberately parked and unwired on 10 Sep 2026 (see
# oma-tryon-parked.md): its source moved to money-upload/parked-tryon/,
# so p23_reveal.js does not exist at the repo root any more, and adding
# it to this list would break every build with a missing-file error.
js = "\n".join([
    core,
    read("p9_sheet.js"), read("p10_sheetpage.js"), read("p11_qr.js"),
    read("p12_api.js"), read("p4_result.js"), read("p5_views.js"),
    read("p6_views2.js"), read("p7_views3.js"), read("p13_money.js"),
    read("p14_live.js"), read("p15_chat.js"), read("p16_find.js"),
    read("p18_review.js"), read("p19_fee.js"), read("p20_live.js"),
    read("p21_home.js"), read("p22_photos.js"), read("p24_points.js"),
    push, read("p8_wire.js"),
])

# The decoder rides in a text/plain script and is eval'd only when a HEIC photo
# actually arrives, so a closing tag inside it would end the block early.
heif = read("libheif-bundle.js").replace("</script", "<\\/script")

# __BUILD__ and __APP_MODE__ are both still literal placeholders in this
# template — one page assembled once, then stamped twice below into the two
# separate builds. Neither placeholder is substituted here on purpose.
html_template = (read("p1_head.html")
        + read("p2_body.html")
        + '<script type="text/plain" id="heifsrc">' + heif + '</script>\n'
        + "<script>\n" + js + "\n</script>\n</body>\n</html>\n")

if "__BUILD__" not in html_template:
    sys.exit("p3_core.js has lost its __BUILD__ placeholder — Settings would show "
             "the literal text instead of the build id. Refusing to build.")
if "__APP_MODE__" not in html_template:
    sys.exit("p3_core.js has lost its __APP_MODE__ placeholder — techapp.html "
             "would boot as a customer app with no way to tell. Refusing to build.")

sw_template = read("sw.js.template")


def build_pair(app_mode, html_name, sw_name, shell, cache_prefix):
    """Writes one matched html/sw pair, both stamped with the same build id."""
    html = html_template.replace("__APP_MODE__", app_mode)

    # Hashed while __BUILD__ is still a placeholder, then substituted into
    # both files. Hashing the finished page instead would change the hash by
    # writing it in, and the id could never describe the file it lives in.
    stamp = hashlib.sha256(html.encode("utf-8")).hexdigest()[:10]
    html = html.replace("__BUILD__", stamp)

    sw = sw_template.replace('const SHELL = "/app.html";',
                              f'const SHELL = "{shell}";')
    sw = sw.replace('const CACHE = "oma-__BUILD__";',
                     f'const CACHE = "{cache_prefix}-__BUILD__";')
    sw = sw.replace("__BUILD__", stamp)

    (HERE / html_name).write_text(html, encoding="utf-8")
    (HERE / sw_name).write_text(sw, encoding="utf-8")

    print(f"build {stamp}  ({app_mode})")
    print(f"  {html_name:<14} {(HERE / html_name).stat().st_size / 1e6:.2f} MB")
    print(f"  {sw_name:<14} {(HERE / sw_name).stat().st_size} bytes")


build_pair("customer", "app.html", "sw.js", "/app.html", "oma")
build_pair("tech", "techapp.html", "techapp-sw.js", "/techapp.html", "omatech")
