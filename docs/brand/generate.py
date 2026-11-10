#!/usr/bin/env python3
"""Generates every Loomux brand file from one set of path data (LOOM-176).

    python3 docs/brand/generate.py      # from the repo root

Writes the SVG masters and the GitHub images (org avatar, one social
preview per repo) to docs/brand/, the favicon, PWA and touch icons to
public/, and the wordmark path data to src/ui/brandPaths.ts. Needs
rsvg-convert (librsvg) and ImageMagick's `magick` for the PNGs and .ico; the
PNG bytes depend on their versions (docs/brand.md lists the ones used). The
social previews set one line of type in Atkinson Hyperlegible Next, read from
node_modules (run `npm ci` first) and unpacked with fontTools, so they don't
depend on installed fonts.
Edit the geometry here, never the outputs. docs/brand.md explains the rules.

    python3 docs/brand/generate.py --paths   # print brandPaths.ts only

`--paths` needs neither tool; src/ui/brandPaths.test.ts uses it to check
the committed file matches the generator.
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/brand"
PUBLIC = ROOT / "public"
FONT = ROOT / "node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff"

# Colours. Thread = the accent token; weft (the golden crossing of the x) =
# the --mari-deep token. Light values pass 3:1 on porcelain and the icon
# tile; dark values pass 3:1 on night and the surface.
LIGHT = dict(thread="#0a737e", weft="#b06f00", ground="#e9eef3")
DARK = dict(thread="#43bac5", weft="#f5b23a", ground="#0c1426")
TILE = "#dceff0"  # kingfisher mist: the app icon's ground


def shift(d, dx):
    """Moves a path's x coordinates by dx (arc radii and flags untouched)."""
    out, i, cmd = [], 0, ""
    for t in re.findall(r"[A-Za-z]|-?[\d.]+", d):
        if t.isalpha():
            out.append(t)
            i, cmd = 0, t
            continue
        v = float(t)
        if (cmd == "A" and i % 7 == 5) or (cmd != "A" and i % 2 == 0):
            v += dx
        i += 1
        out.append(f"{v:g}")
    return " ".join(out)


# ---- the wordmark: "loomux" as one thread, the x crossed by the weft -------
# Drawn on a 68-unit-tall grid: baseline y 59, x-height ~y 36, stroke 5.
# Every change of direction is tangent-continuous (each curve's last control
# point lies on the next segment), so no turn is a corner.
L = "M2 58 C10 50 22 30 22 15 C22 7 15 6 13 13 C10 24 11 44 13 54 C14 60 19 61 24 57"
INTO_O1 = " C27 54.6 28 36 37 36"
# The o's: radius 11.5 on the baseline, smaller than the other letters' bowls
# so the tie between them stays quiet.
O1 = " A11.5 11.5 0 1 1 37 59 A11.5 11.5 0 1 1 37 36"
TIE = (" A11.5 11.5 0 0 1 45.13 39.37 C47.96 42.2 57.04 42.2 59.87 39.37"
       " A11.5 11.5 0 1 1 76.13 55.63 A11.5 11.5 0 1 1 59.87 39.37 A11.5 11.5 0 0 1 68 36")
O2_ALONE = " M68 36 A11.5 11.5 0 1 1 68 59 A11.5 11.5 0 1 1 68 36"
TO_M = " C77 36 87 36 87 44 L87 59 L87 44"
MUX = ("C87 36 101 36 101 44 L101 59 L101 44 C101 36 115 36 115 44 L115 54 C115 59 119.4 60.3 123 57.6"
       " C125.4 55.8 128 46 128 34 L128 50 C128 56 132 59 137 59 C142 59 146 56 146 50 L146 34 L146 54"
       " C146 58.5 150.1 61.7 154.6 56.3 L174 33")
WEFT = "M154 33 L175 59"

WORD = dict(thread=L + INTO_O1 + O1 + TIE + TO_M + " " + MUX, weft=WEFT,
            viewbox="-4 0 189 68", w=189, stroke=5)
# The small cut, for wordmarks under 24 px tall: no tie (it fuses the o's
# at 16 px), the second o and everything after it 2 units further right,
# and a heavier stroke.
WORD_SMALL = dict(thread=L + INTO_O1 + O1 + shift(O2_ALONE, 2) + shift(TO_M, 2) + " " + shift("M0 0 " + MUX, 2)[len("M 2 0 "):],
                  weft=shift(WEFT, 2), viewbox="-4 0 191 68", w=191, stroke=5.6)

# ---- the mark: an lx monogram on a 64-unit grid ------------------------------
MARK_THREAD = "M9 50 C17 42 27 25 27 14 C27 7 21 6 19 12 C16 22 17 41 19 49 C20.5 55 26.8 58 31 53 L51 29"
MARK_WEFT = "M33 29 L54 55"
MARK_STROKE, MARK_STROKE_SMALL = 5, 6.5  # small: icons rendered at 32 px or less

SVG = 'xmlns="http://www.w3.org/2000/svg"'


def strokes(thread_d, weft_d, thread, weft, width):
    return (f'<path d="{thread_d}" fill="none" stroke="{thread}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{weft_d}" fill="none" stroke="{weft}" stroke-width="{width}" stroke-linecap="round"/>')


def wordmark(spec, c, title="Loomux"):
    h = 68
    return (f'<svg {SVG} viewBox="{spec["viewbox"]}" width="{spec["w"]}" height="{h}" role="img"><title>{title}</title>'
            + strokes(spec["thread"], spec["weft"], c["thread"], c["weft"], spec["stroke"]) + "</svg>\n")


def mark(c, small=False):
    return (f'<svg {SVG} viewBox="0 0 64 64" width="64" height="64" role="img"><title>Loomux</title>'
            + strokes(MARK_THREAD, MARK_WEFT, c["thread"], c["weft"], MARK_STROKE_SMALL if small else MARK_STROKE) + "</svg>\n")


def icon(kind="any", small=False, size=512):
    """kind: any (rounded tile), maskable (full bleed, mark in the safe zone),
    touch (full bleed, opaque, mark at the "any" size: iOS rounds the corners
    itself and fills transparent ones with black), monochrome (white mark on
    transparent, for Android themed icons)."""
    scale = 4.3 if kind in ("maskable", "monochrome") else 5.6
    off = 256 - 32 * scale
    width = MARK_STROKE_SMALL if small else MARK_STROKE
    if kind == "monochrome":
        ground, thread, weft = "", "#ffffff", "#ffffff"
    else:
        rx = ' rx="114"' if kind == "any" else ""  # maskable and touch: full bleed
        ground, thread, weft = f'<rect width="512" height="512"{rx} fill="{TILE}"/>', LIGHT["thread"], LIGHT["weft"]
    return (f'<svg {SVG} viewBox="0 0 512 512" width="{size}" height="{size}" role="img"><title>Loomux</title>{ground}'
            f'<g transform="translate({off:g} {off:g}) scale({scale})">{strokes(MARK_THREAD, MARK_WEFT, thread, weft, width)}</g></svg>\n')


def led_in(tx, s, c):
    """The wordmark at page x `tx` and scale `s`, its thread running in from
    the page's left edge. The lead-in is the start of the thread's own path,
    in the wordmark's coordinates, so there is no joint: it leaves the edge
    level at y 64.9, never goes below that, and arrives at the l's first
    point (2, 58) along the l's own tangent (its last control point is on
    the line through 2,58 and the l's first control point, 10,50)."""
    start = "M2 58"
    assert WORD["thread"].startswith(start + " C10 50 ")
    x0, y0 = -tx / s, 64.9
    k = y0 - 58  # the longest handle that stays on the tangent without going below y0
    lead = f"M{x0:g} {y0:g} C{x0 + (2 - x0) * 0.35:g} {y0:g} {2 - k:g} {58 + k:g} 2 58"
    return strokes(lead + WORD["thread"][len(start):], WORD["weft"], c["thread"], c["weft"], WORD["stroke"])


def banner(c, ink2):
    """The README banner, 1280 x 320: wordmark, then a one-line tagline."""
    s, tx = 3.4, 196
    return (f'<svg {SVG} viewBox="0 0 1280 320" width="1280" height="320" role="img"><title>Loomux</title>'
            f'<rect width="1280" height="320" fill="{c["ground"]}"/>'
            f'<g transform="translate({tx} 40) scale({s})">{led_in(tx, s, c)}</g>'
            f'<text x="210" y="300" font-family="Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif" font-size="28" fill="{ink2}">'
            "Chat-driven coding agents, in tmux, on your own machines.</text></svg>\n")


# Each public repo's role, as its social preview says it (LOOM-300).
ROLES = dict(server="The server and API", web="The web client", tui="The terminal client")


def social(role, c=LIGHT, ink="#465668"):
    """A repo's social preview (GitHub's link-preview card), 1280 x 640: the
    banner's composition, larger, with the repo's role as the one line. The
    type is 64 px so it is still about 15 px in a 300 px wide thumbnail."""
    s, tx, ty = 5, 180, 80
    return (f'<svg {SVG} viewBox="0 0 1280 640" width="1280" height="640" role="img"><title>Loomux: {role}</title>'
            f'<rect width="1280" height="640" fill="{c["ground"]}"/>'
            f'<g transform="translate({tx} {ty}) scale({s})">{led_in(tx, s, c)}</g>'
            f'<text x="{tx + 20}" y="520" font-family="Atkinson Hyperlegible Next" font-size="64" fill="{ink}">{role}</text></svg>\n')


def write(path, text):
    path.write_text(text)
    print("wrote", path.relative_to(ROOT))


def png(svg_text, out, size, opaque=False, height=None, env=None):
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(height or size), "-o", str(out)],
                   input=svg_text.encode(), check=True, env=env)
    if opaque:  # drop the alpha channel outright, so nothing can show through
        subprocess.run(["magick", str(out), "-background", TILE, "-alpha", "remove", "-alpha", "off",
                        "-strip", "-define", "png:exclude-chunks=date,time", str(out)], check=True)
    print("wrote", out.relative_to(ROOT))


def main():
    DOCS.mkdir(exist_ok=True)
    # Masters.
    write(DOCS / "wordmark-light.svg", wordmark(WORD, LIGHT))
    write(DOCS / "wordmark-dark.svg", wordmark(WORD, DARK))
    write(DOCS / "wordmark-small-light.svg", wordmark(WORD_SMALL, LIGHT))
    write(DOCS / "wordmark-small-dark.svg", wordmark(WORD_SMALL, DARK))
    write(DOCS / "mark-light.svg", mark(LIGHT))
    write(DOCS / "mark-dark.svg", mark(DARK))
    write(DOCS / "icon.svg", icon("any"))
    write(DOCS / "icon-maskable.svg", icon("maskable"))
    write(DOCS / "icon-monochrome.svg", icon("monochrome"))
    write(DOCS / "banner-light.svg", banner(LIGHT, "#465668"))
    write(DOCS / "banner-dark.svg", banner(DARK, "#a2b1c5"))

    # The web client's icons. The SVG favicon is drawn for small sizes.
    write(PUBLIC / "icon.svg", icon("any", small=True))
    png(icon("touch"), PUBLIC / "apple-touch-icon.png", 180, opaque=True)
    png(icon("any"), PUBLIC / "icon-192.png", 192)
    png(icon("any"), PUBLIC / "icon-512.png", 512)
    png(icon("maskable"), PUBLIC / "icon-maskable-512.png", 512)
    png(icon("monochrome"), PUBLIC / "icon-monochrome-512.png", 512)
    tmp = []
    for s in (16, 32):
        p = DOCS / f".favicon-{s}.png"
        png(icon("any", small=True), p, s)
        tmp.append(str(p))
    subprocess.run(["magick", *tmp, str(PUBLIC / "favicon.ico")], check=True)
    print("wrote public/favicon.ico")
    for p in tmp:
        Path(p).unlink()

    github_images()

    write(ROOT / "src/ui/brandPaths.ts", brand_paths_ts())


def github_images():
    """The org avatar and each repo's social preview (LOOM-300). GitHub takes
    these as uploads in its settings pages; nothing links to them."""
    # The avatar is the touch icon's drawing: opaque and full bleed, with the
    # mark well inside the inscribed circle, because GitHub crops it round.
    png(icon("touch"), DOCS / "avatar-500.png", 500, opaque=True)
    if not FONT.exists():
        sys.exit(f"no {FONT.relative_to(ROOT)}: run `npm ci` first")
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        sys.exit("the social previews need fontTools (pip install fonttools)")
    # librsvg sets type through Pango, which can't read a .woff, so unpack
    # it to a .ttf, and give fontconfig only that one file: the line is set
    # in the repo's own copy of the typeface or not at all, never in a
    # system fallback.
    with tempfile.TemporaryDirectory() as tmp:
        font = TTFont(FONT)
        font.flavor = None
        (Path(tmp) / "fonts").mkdir()
        font.save(Path(tmp) / "fonts/atkinson.ttf")
        conf = Path(tmp) / "fonts.conf"
        conf.write_text(f"<fontconfig><dir>{tmp}/fonts</dir><cachedir>{tmp}/cache</cachedir></fontconfig>\n")
        env = dict(os.environ, FONTCONFIG_FILE=str(conf))
        for repo, role in ROLES.items():
            png(social(role), DOCS / f"social-{repo}.png", 1280, opaque=True, height=640, env=env)


def brand_paths_ts():
    """Path data for the in-app wordmark (src/ui/Wordmark.tsx)."""
    ts = ("// Generated by docs/brand/generate.py. Do not edit by hand.\n"
          "// The Loomux wordmark and mark (LOOM-176, docs/brand.md).\n\n")
    for name, spec in (("WORDMARK", WORD), ("WORDMARK_SMALL", WORD_SMALL)):
        ts += (f"export const {name} = {{\n  viewBox: \"{spec['viewbox']}\",\n  width: {spec['w']},\n  height: 68,\n"
               f"  stroke: {spec['stroke']},\n  thread: \"{spec['thread']}\",\n  weft: \"{spec['weft']}\",\n}} as const;\n\n")
    ts += (f"export const MARK = {{\n  thread: \"{MARK_THREAD}\",\n  weft: \"{MARK_WEFT}\",\n"
           f"  stroke: {MARK_STROKE},\n  strokeSmall: {MARK_STROKE_SMALL},\n}} as const;\n")
    return ts


if __name__ == "__main__":
    if sys.argv[1:] == ["--paths"]:
        sys.stdout.write(brand_paths_ts())
    else:
        main()
