"""Build a review page of symbol candidates for every move: name, what it does, three Lucide icons in order of
fit, and a description of a custom glyph. Icons are drawn inline from the installed lucide-react package.

    python tools/build_symbol_page.py          writes tests/results/move_symbols.html
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from symbol_picks import GROUP_HUES, PICKS  # noqa: E402

ICONS = os.path.join(ROOT, "web", "node_modules", "lucide-react", "dist", "esm", "icons")
OUT = os.path.join(ROOT, "tests", "results", "move_symbols.html")

GROUP_TIPS = {
    "SCAMPER": "A classic checklist for changing an idea, named for its seven moves.",
    "Collisions": "Two boxes in, one new idea out. Drag from one box onto another.",
    "Perceptual": "Change how the thing is seen.",
    "Scale and abstraction": "Move it up or down: size, or how general it is.",
    "Substitution": "Swap the thing for something that stands in for it.",
    "Structural": "Keep the skeleton, rebuild the rest.",
    "Linguistic": "Work through the words.",
    "Constraints": "Add a limit and see what it forces.",
    "Chance and games": "Let chance push it.",
    "Shifts": "Same idea, a different angle.",
    "Finish": "The last step on a result: a plain picture or a concrete case.",
}


def svg(name: str) -> str:
    src = open(os.path.join(ICONS, name + ".mjs"), encoding="utf-8").read()
    alias = re.search(r"export \{ default \} from './([\w-]+)\.mjs'", src)
    if alias:   # a renamed icon: its file only points at the real one
        return svg(alias.group(1))
    m = re.search(r"node:\s*\[(.*?)\]\s*\n\s*\};", src, re.S)
    if not m:
        raise ValueError(f"could not read the icon {name}")
    node = m.group(1)
    parts = []
    for tag, attrs in re.findall(r'\["(\w+)",\s*\{(.*?)\}\]', node, re.S):
        kv = re.findall(r'(\w+):\s*"([^"]*)"', attrs)
        parts.append(f"<{tag} " + " ".join(f'{k}="{html.escape(v)}"' for k, v in kv if k != "key") + "/>")
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
            'stroke-linejoin="round" aria-hidden="true">' + "".join(parts) + "</svg>")


def main():
    data = json.load(open(os.path.join(ROOT, "moves.json"), encoding="utf-8"))
    groups = data["groups"] + ["Finish"]
    sections = []
    for g in groups:
        moves = [m for m in data["moves"] if m["group"] == g]
        if not moves:
            continue
        cards = []
        for m in moves:
            icons, custom = PICKS[m["id"]]
            label = " / ".join(dict.fromkeys(m["label"].values()))
            chips = "".join(
                f'<figure class="ic{" first" if i == 0 else ""}"><div class="glyph">{svg(n)}</div>'
                f'<figcaption><span class="rank">{i + 1}</span>{html.escape(n)}</figcaption></figure>'
                for i, n in enumerate(icons))
            cards.append(
                f'<article class="move"><header><div class="badge">{svg(icons[0])}</div><h3>{html.escape(label)}</h3></header>'
                f'<p class="what">{html.escape(m["blurb"]["ideas"])}</p>'
                f'<div class="icons">{chips}</div>'
                f'<p class="custom"><span>Custom symbol</span>{html.escape(custom)}</p></article>')
        hue = GROUP_HUES[g]
        sections.append(
            f'<section class="group" style="--h:{hue}"><div class="ghead"><span class="swatch"></span>'
            f'<h2>{html.escape(g)}</h2><p>{html.escape(GROUP_TIPS.get(g, ""))}</p><span class="count">{len(moves)}</span></div>'
            f'<div class="grid">{"".join(cards)}</div></section>')
    total = sum(len(PICKS) for _ in [0])
    page = PAGE.replace("__SECTIONS__", "\n".join(sections)).replace("__TOTAL__", str(total))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8", newline="\n").write(page)
    print("wrote", OUT)


PAGE = """<title>Move Symbols</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: a field guide. One band per group, its hue carried by a swatch, the badges and the first-choice icon. */
:root{
  --bg:oklch(0.985 0.004 265);--surface:oklch(1 0 0);--fg:oklch(0.22 0.02 265);--muted:oklch(0.5 0.02 265);
  --line:oklch(0.9 0.01 265);--glyph-l:0.5;--glyph-c:0.17;--tint-l:0.95;--tint-c:0.035;
  --display:"Nunito",ui-rounded,system-ui,sans-serif;--body:"Nunito",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:oklch(0.17 0.012 265);--surface:oklch(0.21 0.014 265);--fg:oklch(0.94 0.008 265);--muted:oklch(0.7 0.015 265);
  --line:oklch(0.3 0.015 265);--glyph-l:0.78;--glyph-c:0.14;--tint-l:0.27;--tint-c:0.05;color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:oklch(0.17 0.012 265);--surface:oklch(0.21 0.014 265);--fg:oklch(0.94 0.008 265);--muted:oklch(0.7 0.015 265);
  --line:oklch(0.3 0.015 265);--glyph-l:0.78;--glyph-c:0.14;--tint-l:0.27;--tint-c:0.05;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:16px/1.5 var(--body)}
.wrap{max-width:1180px;margin:0 auto;padding-inline:20px;padding-block:28px 64px}
.intro h1{font:800 clamp(28px,4vw,40px)/1.1 var(--display);margin:0 0 8px;text-wrap:balance;letter-spacing:-0.01em}
.intro p{color:var(--muted);max-width:68ch;margin:0}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:16px;font-size:13px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:10px;height:10px;border-radius:2px;background:oklch(var(--glyph-l) var(--glyph-c) var(--h))}
.group{margin-top:40px}
.ghead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:14px}
.swatch{width:12px;height:12px;border-radius:3px;background:oklch(var(--glyph-l) var(--glyph-c) var(--h));align-self:center}
.ghead h2{font:800 20px/1.2 var(--display);margin:0;letter-spacing:0.02em;text-transform:uppercase;color:oklch(var(--glyph-l) var(--glyph-c) var(--h))}
.ghead p{margin:0;color:var(--muted);font-size:14px;flex:1;min-width:12ch}
.count{font:500 12px var(--mono);color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:12px}
.move{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:14px;display:flex;flex-direction:column;gap:10px;min-width:0}
.move header{display:flex;align-items:center;gap:10px}
.badge{width:34px;height:34px;flex:none;border-radius:4px;display:grid;place-items:center;
  background:oklch(var(--tint-l) var(--tint-c) var(--h));color:oklch(var(--glyph-l) var(--glyph-c) var(--h))}
.badge svg{width:20px;height:20px}
.move h3{font:700 17px/1.2 var(--display);margin:0;text-wrap:balance}
.what{margin:0;color:var(--muted);font-size:14px}
.icons{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ic{margin:0;border:1px solid var(--line);border-radius:4px;padding:10px 4px 6px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
.ic.first{border-color:oklch(var(--glyph-l) var(--glyph-c) var(--h));background:oklch(var(--tint-l) var(--tint-c) var(--h))}
.glyph{width:30px;height:30px;color:var(--fg)}
.ic.first .glyph{color:oklch(var(--glyph-l) var(--glyph-c) var(--h))}
.glyph svg{width:100%;height:100%}
figcaption{font:400 11px/1.3 var(--mono);color:var(--muted);text-align:center;overflow-wrap:anywhere;display:flex;gap:4px;align-items:baseline}
.rank{font-weight:500;color:var(--fg)}
.custom{margin:0;font-size:14px;border-top:1px dashed var(--line);padding-top:8px}
.custom span{display:block;font:500 11px var(--mono);text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:2px}
</style>
<div class="wrap">
<div class="intro">
<h1>Move Symbols</h1>
<p>Every move on Concept Transformer, with three icons from the Lucide set the site already uses, best fit first, and a sketch in words of a custom symbol. Colors follow the move's group.</p>
</div>
__SECTIONS__
</div>
"""

if __name__ == "__main__":
    main()
