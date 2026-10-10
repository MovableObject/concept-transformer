"""Turn the owner's symbol picks into the site's move icons.

Reads the picks saved by the symbol page (one JSON file per move, as ArtifactData writes them with out_dir), resolves
each to SVG markup, and writes:
  tools/icon_choices.json         the picks and their resolved markup, kept in the repo so the icons can be rebuilt
  web/src/lib/moveIcons.ts        move id -> inner SVG markup, plus each group's hue, for the page

    python tools/export_move_icons.py <folder of choices/*.json>     (from the artifact's database)
    python tools/export_move_icons.py                                (rebuild from tools/icon_choices.json)

A pick is 'lucide:<name>' (the library icon), 'drawn' / 'drawn-<variant>' (tools/custom_icons), or 'generated' (made
on the page from a sketch; cleaned here with the same allow-list the page uses). A move left at 'none' with a made
icon uses the made icon.
"""
import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from build_symbol_page import svg as lucide_svg  # noqa: E402
from symbol_picks import GROUP_HUES  # noqa: E402

CUSTOM = os.path.join(ROOT, "tools", "custom_icons")
CHOICES = os.path.join(ROOT, "tools", "icon_choices.json")
OUT = os.path.join(ROOT, "web", "src", "lib", "moveIcons.ts")

SHAPES = {"path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g"}
ATTRS = {"d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "points", "transform",
         "stroke-dasharray", "stroke-dashoffset", "fill", "fill-rule", "stroke-linejoin", "stroke-width"}


def clean(markup: str) -> str:
    """Keep plain drawing elements and geometry; squares get sharp corners (the owner's rule for made icons)."""
    root = ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + markup + "</svg>")
    out = []

    def walk(el, depth):
        for c in el:
            name = c.tag.split("}")[-1]
            if name not in SHAPES or depth > 3:
                continue
            attrs = []
            for k, v in c.attrib.items():
                k = k.split("}")[-1].lower()
                if k not in ATTRS or len(v) > 4000 or re.search(r'[<>"]|url\s*\(|javascript:', v, re.I):
                    continue
                if k == "fill" and v not in ("none", "currentColor"):
                    continue
                if k == "stroke-linejoin" and v not in ("miter", "round", "bevel"):
                    continue
                if k == "stroke-width" and not re.fullmatch(r"[0-9.]+", v):
                    continue
                if name == "rect" and k in ("rx", "ry", "stroke-linejoin"):
                    continue
                attrs.append(f'{k}="{v}"')
            if name == "g":
                tf = [a for a in attrs if a.startswith("transform")]
                out.append("<g" + ("".join(" " + a for a in tf)) + ">")
                walk(c, depth + 1)
                out.append("</g>")
            else:
                if name == "rect":
                    attrs.append('stroke-linejoin="miter"')
                out.append("<" + name + ("".join(" " + a for a in attrs)) + "/>")

    walk(root, 0)
    return "".join(out)


def inner(svg_text: str) -> str:
    m = re.search(r"<svg[^>]*>(.*)</svg>", svg_text, re.S)
    return m.group(1).strip() if m else ""


def resolve(move_id: str, pick: dict) -> tuple[str, str]:
    choice = pick.get("choice") or ""
    generated = pick.get("generated") or ""
    if choice in ("", "none") and generated:
        choice = "generated"
    if choice.startswith("lucide:"):
        return choice, clean(inner(lucide_svg(choice[7:])))
    if choice.startswith("drawn"):
        variant = choice[len("drawn"):]
        path = os.path.join(CUSTOM, move_id + variant + ".svg")
        return choice, clean(inner(open(path, encoding="utf-8").read()))
    if choice == "generated" and generated:
        return choice, clean(generated)
    # nothing picked: the drawn symbol
    return "drawn", clean(inner(open(os.path.join(CUSTOM, move_id + ".svg"), encoding="utf-8").read()))


def main():
    moves = json.load(open(os.path.join(ROOT, "moves.json"), encoding="utf-8"))["moves"]
    if len(sys.argv) > 1:
        picks = {}
        for f in glob.glob(os.path.join(sys.argv[1], "*.json")):
            d = json.load(open(f, encoding="utf-8"))
            picks[os.path.basename(f)[:-5]] = d.get("data", d)
        record = {}
        for m in moves:
            choice, markup = resolve(m["id"], picks.get(m["id"], {}))
            record[m["id"]] = {"choice": choice, "note": picks.get(m["id"], {}).get("note", ""), "svg": markup}
        with open(CHOICES, "w", encoding="utf-8", newline="\n") as f:
            json.dump(record, f, indent=1, ensure_ascii=False)
    record = json.load(open(CHOICES, encoding="utf-8"))
    missing = [m["id"] for m in moves if not record.get(m["id"], {}).get("svg")]
    if missing:
        sys.exit("no icon for: " + ", ".join(missing))
    groups = {m["group"] for m in moves}
    lines = [
        "// Generated by tools/export_move_icons.py from the owner's picks on the symbol page. Do not edit by hand.",
        "// Each entry is the inner markup of a 24 by 24 icon, drawn at line weight 1 (see MoveIcon).",
        "export const MOVE_ICONS: Record<string, string> = {",
    ]
    for m in moves:
        lines.append(f"  {json.dumps(m['id'])}: {json.dumps(record[m['id']]['svg'])},")
    lines.append("}")
    lines.append("")
    lines.append("// One hue per move group (oklch hue angle), shared with the symbol page.")
    lines.append("export const GROUP_HUES: Record<string, number> = {")
    for g in sorted(groups):
        lines.append(f"  {json.dumps(g)}: {GROUP_HUES[g]},")
    lines.append("}")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    kinds = {}
    for v in record.values():
        k = v["choice"].split(":")[0]
        kinds[k] = kinds.get(k, 0) + 1
    print(f"wrote {OUT} ({len(moves)} icons: {kinds})")


if __name__ == "__main__":
    main()
