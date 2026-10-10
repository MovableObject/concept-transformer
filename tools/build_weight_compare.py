"""Compare icon line weights: library icons and drawn move symbols at 2 (the library default), 1.75 and 1.5.

    python tools/build_weight_compare.py      writes tests/results/icon_weights.html
"""
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from build_symbol_page import svg as lucide_svg  # noqa: E402

CUSTOM = os.path.join(ROOT, "tools", "custom_icons")
OUT = os.path.join(ROOT, "tests", "results", "icon_weights.html")
WEIGHTS = ["2", "1.75", "1.5"]

# Substitute redrawn for a lighter line: the extra room goes into bigger shapes and wider gaps, closer to the sketch.
SUBSTITUTE_LIGHT = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round"><circle cx="12" cy="5.25" r="3.25"/><path d="M12 10.75v3.75"/>'
    '<path d="m10.25 12.75 1.75 1.75 1.75-1.75"/><rect x="2" y="16.5" width="5.5" height="5.5" rx="1"/>'
    '<circle cx="12" cy="19.25" r="2.9" stroke-dasharray="0 2.278" transform="rotate(-90 12 19.25)"/>'
    '<rect x="16.5" y="16.5" width="5.5" height="5.5" rx="1"/></svg>')


def custom(name):
    s = open(os.path.join(CUSTOM, name + ".svg"), encoding="utf-8").read().strip()
    return re.sub(r'\s(width|height)="24"', "", s).replace('xmlns="http://www.w3.org/2000/svg" ', "")


ROWS = [
    ("Substitute, redrawn for a lighter line", SUBSTITUTE_LIGHT),
    ("Substitute, from your sketch (drawn for weight 2)", custom("substitute-sketch")),
    ("Bisociation (drawn)", custom("bisociation")),
    ("Compression (drawn)", custom("compression")),
    ("Oblique Strategies (drawn)", custom("oblique")),
    ("replace (library)", lucide_svg("replace")),
    ("merge (library)", lucide_svg("merge")),
    ("scissors (library)", lucide_svg("scissors")),
    ("key-round (library, on the site now)", lucide_svg("key-round")),
    ("undo-2 (library, on the site now)", lucide_svg("undo-2")),
]


def weighted(s, w):
    return re.sub(r'stroke-width="2"', f'stroke-width="{w}"', s, count=1)


def main():
    head = "".join(f"<th>Weight {w}{' (library default)' if w == '2' else ''}</th>" for w in WEIGHTS)
    rows = []
    for name, s in ROWS:
        cells = "".join(
            f'<td><div class="pair"><span class="i24">{weighted(s, w)}</span><span class="i48">{weighted(s, w)}</span></div></td>'
            for w in WEIGHTS)
        rows.append(f"<tr><th scope=\"row\">{html.escape(name)}</th>{cells}</tr>")
    page = PAGE.replace("__HEAD__", head).replace("__ROWS__", "\n".join(rows))
    open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("wrote", OUT)


PAGE = r"""<title>Icon Line Weights</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<style>
:root{--bg:oklch(0.985 0.004 265);--surface:oklch(1 0 0);--fg:oklch(0.22 0.02 265);--muted:oklch(0.5 0.02 265);--line:oklch(0.9 0.01 265);--accent:oklch(0.5 0.17 265)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:oklch(0.17 0.012 265);--surface:oklch(0.21 0.014 265);--fg:oklch(0.94 0.008 265);--muted:oklch(0.7 0.015 265);--line:oklch(0.3 0.015 265);--accent:oklch(0.78 0.14 265);color-scheme:dark}}
:root[data-theme="dark"]{--bg:oklch(0.17 0.012 265);--surface:oklch(0.21 0.014 265);--fg:oklch(0.94 0.008 265);--muted:oklch(0.7 0.015 265);--line:oklch(0.3 0.015 265);--accent:oklch(0.78 0.14 265);color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.5 "Nunito",system-ui,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding-inline:16px;padding-block:24px 48px}
h1{font:800 28px/1.15 "Nunito",system-ui,sans-serif;margin:0 0 6px}
p{color:var(--muted);margin:0 0 18px;max-width:68ch}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:560px}
th,td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:middle}
thead th{font-size:13px;color:var(--muted);font-weight:700}
tbody th{font-weight:700;font-size:14px;width:34%}
.pair{display:flex;align-items:center;gap:14px}
.i24 svg{width:24px;height:24px;display:block}
.i48 svg{width:48px;height:48px;display:block}
td:nth-child(4){background:color-mix(in oklch,var(--accent) 7%,transparent)}
</style>
<div class="wrap">
<h1>Icon Line Weights</h1>
<p>Each symbol at button size and at twice that, drawn at the library's default weight of 2 and at two lighter weights. Only the icons would change; text and everything else on the site stays the same.</p>
<div class="scroll"><table><thead><tr><th></th>__HEAD__</tr></thead><tbody>
__ROWS__
</tbody></table></div>
</div>
"""

if __name__ == "__main__":
    main()
