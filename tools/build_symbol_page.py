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
    for tag, attrs in re.findall(r'\[\s*"(\w+)",\s*\{(.*?)\}\s*\]', node, re.S):
        kv = re.findall(r'(\w+):\s*"([^"]*)"', attrs)
        parts.append(f"<{tag} " + " ".join(f'{k}="{html.escape(v)}"' for k, v in kv if k != "key") + "/>")
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
            'stroke-linejoin="round" aria-hidden="true">' + "".join(parts) + "</svg>")


CUSTOM = os.path.join(ROOT, "tools", "custom_icons")

# The drawing pad's background: the icons' 24-unit grid, with the 2-unit safe margin marked.
PAD_GRID = ('<g class="grid">' + "".join(f'<path class="{"major" if i % 4 == 0 else "minor"}" d="M{i} 0v24M0 {i}h24"/>'
                                        for i in range(1, 24))
            + '</g><rect class="safe" x="2" y="2" width="20" height="20" rx="1"/>')


def custom_svgs(move_id: str) -> list[tuple[str, str]]:
    """Drawn custom symbols for a move: tools/custom_icons/<id>.svg and <id>-<variant>.svg, as (name, inline svg)."""
    if not os.path.isdir(CUSTOM):
        return []
    out = []
    for f in sorted(os.listdir(CUSTOM), key=lambda f: (f[:-4] != move_id, f)):
        stem = f[:-4]
        if f.endswith(".svg") and (stem == move_id or stem.startswith(move_id + "-")):
            src = open(os.path.join(CUSTOM, f), encoding="utf-8").read().strip()
            src = re.sub(r'\s(width|height)="24"', "", src).replace('xmlns="http://www.w3.org/2000/svg" ', "")
            src = src.replace("<svg ", '<svg aria-hidden="true" ', 1)
            label = "drawn" if stem == move_id else "drawn " + stem[len(move_id) + 1:]
            out.append((label, src))
    return out


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
            mid = m["id"]
            icons, custom = PICKS[mid]
            label = " / ".join(dict.fromkeys(m["label"].values()))
            drawn = custom_svgs(mid)

            def option(choice, name, glyph, rank=""):
                r = f'<span class="rank">{rank}</span>' if rank else ""
                return (f'<button type="button" class="ic" data-move="{mid}" data-choice="{html.escape(choice)}" '
                        f'aria-pressed="false"><div class="glyph">{glyph}</div><span class="cap">{r}{html.escape(name)}</span></button>')

            lucide = "".join(option("lucide:" + n, n, svg(n), str(i + 1)) for i, n in enumerate(icons))
            drawn_opts = "".join(option(n.replace(" ", "-"), n, sv) for n, sv in drawn)
            none_opt = option("none", "none, describe it", '<span class="nonebox"></span>')
            cards.append(
                f'<article class="move" id="m-{mid}" data-move="{mid}"><header><div class="badge">'
                f'{drawn[0][1] if drawn else svg(icons[0])}</div><h3>{html.escape(label)}</h3>'
                f'<span class="state" aria-live="polite"></span></header>'
                f'<p class="what">{html.escape(m["blurb"]["ideas"])}</p>'
                f'<div class="optlabel">From the icon set</div><div class="icons">{lucide}</div>'
                f'<div class="optlabel">Drawn from the description</div>'
                f'<p class="desc">{html.escape(custom)}</p>'
                f'<div class="icons">{drawn_opts}{none_opt}</div>'
                f'<div class="note" hidden><label for="note-{mid}">How should the symbol look?</label>'
                f'<textarea id="note-{mid}" rows="3" data-move="{mid}" '
                f'placeholder="Describe the symbol you want for {html.escape(label)}"></textarea>'
                f'<div class="sketchrow"><div class="sketchwrap padwrap"><span class="sk-label">Sketch it (optional)</span>'
                '<span class="sk-hint wide">The icon set’s own 24 by 24 grid. Your pen draws a thin line; the faint band around it is the icons’ real thickness, '
                'and the dashed square is the 2-square margin they keep clear.</span>'
                f'<svg class="pad" data-move="{mid}" viewBox="0 0 24 24" role="img" '
                f'aria-label="Drawing pad for the {html.escape(label)} symbol">{PAD_GRID}<g class="ink"></g></svg>'
                f'<div class="sk-tools"><button type="button" class="sk-btn" data-act="pen" aria-pressed="true">Pen</button>'
                f'<button type="button" class="sk-btn" data-act="eraser" aria-pressed="false">Eraser</button>'
                f'<button type="button" class="sk-btn" data-act="undo" data-move="{mid}">Undo</button>'
                f'<button type="button" class="sk-btn" data-act="clear" data-move="{mid}">Clear</button></div></div>'
                f'<div class="sketchwrap"><span class="sk-label">In the icon style</span>'
                f'<div class="sk-preview" data-move="{mid}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="ink"></g></svg></div>'
                f'<span class="sk-hint">Your lines at button size, with the icons\' line weight.</span></div>'
                f'<div class="sketchwrap"><span class="sk-label">Reference image (optional)</span>'
                f'<label class="drop" data-move="{mid}" for="file-{mid}" tabindex="0">'
                f'<span class="drop-empty">Drop an image here, paste one, or click to choose</span>'
                f'<img class="drop-img" alt="Reference image for the {html.escape(label)} symbol" hidden></label>'
                f'<input type="file" id="file-{mid}" class="drop-file" data-move="{mid}" accept="image/*" hidden>'
                f'<div class="sk-tools"><button type="button" class="sk-btn" data-act="noimg" data-move="{mid}">Remove image</button></div>'
                f'</div></div>'
                f'</div></article>')
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


PAGE = r"""<title>Move Symbols</title>
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
.badge .nonebox{width:18px;height:18px}
.move h3{font:700 17px/1.2 var(--display);margin:0;text-wrap:balance}
.what{margin:0;color:var(--muted);font-size:14px}
.icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px}
.ic{margin:0;border:1px solid var(--line);border-radius:4px;padding:10px 4px 6px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;
  background:transparent;color:inherit;font:inherit;cursor:pointer;position:relative;transition:border-color .12s,background .12s}
.ic:hover{border-color:oklch(var(--glyph-l) var(--glyph-c) var(--h) / .6)}
.ic:focus-visible{outline:2px solid oklch(var(--glyph-l) var(--glyph-c) var(--h));outline-offset:2px}
.ic[aria-pressed="true"]{border-color:oklch(var(--glyph-l) var(--glyph-c) var(--h));background:oklch(var(--tint-l) var(--tint-c) var(--h));box-shadow:inset 0 0 0 1px oklch(var(--glyph-l) var(--glyph-c) var(--h))}
.ic[aria-pressed="true"]::after{content:"";position:absolute;top:5px;right:5px;width:8px;height:8px;border-radius:50%;background:oklch(var(--glyph-l) var(--glyph-c) var(--h))}
.glyph{width:30px;height:30px;color:var(--fg);display:grid;place-items:center}
.ic[aria-pressed="true"] .glyph{color:oklch(var(--glyph-l) var(--glyph-c) var(--h))}
.nonebox{display:block;width:22px;height:22px;border:2px dashed var(--muted);border-radius:4px}
.cap{font:400 11px/1.3 var(--mono);color:var(--muted);text-align:center;overflow-wrap:anywhere;display:flex;gap:4px;align-items:baseline;justify-content:center}
.optlabel{font:500 11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:2px}
.desc{margin:0;font-size:14px}
.note{display:flex;flex-direction:column;gap:6px}
.note[hidden]{display:none}
.note label{font-size:13px;font-weight:700}
.note textarea{font:inherit;font-size:14px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:8px 10px;resize:vertical;min-height:64px}
.note textarea:focus-visible{outline:2px solid oklch(var(--glyph-l) var(--glyph-c) var(--h));outline-offset:1px}
.sketchrow{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
.sketchwrap{display:flex;flex-direction:column;gap:6px;min-width:0}
.sketchwrap.padwrap{flex:1 1 100%}
.move.wide{grid-column:1/-1}
.move.wide .sketchwrap.padwrap{flex:0 1 auto}
.move.wide .pad{width:min(480px,100%)}
.sk-label{font-size:13px;font-weight:700}
.pad{width:min(420px,100%);aspect-ratio:1;max-width:100%;background:var(--bg);border:1px solid var(--line);border-radius:4px;touch-action:none;cursor:crosshair;display:block}
.pad .grid path{fill:none}
.pad .grid .minor{stroke:var(--line);stroke-width:.04}
.pad .grid .major{stroke:var(--line);stroke-width:.1}
.pad .safe{fill:none;stroke:var(--muted);stroke-width:.06;stroke-dasharray:.4 .4}
.pad .ink path.ghost{stroke:oklch(var(--glyph-l) var(--glyph-c) var(--h) / .16);stroke-width:1.5}
.pad .ink path.line{stroke:oklch(var(--glyph-l) var(--glyph-c) var(--h));stroke-width:.45}
.pad .ink path{fill:none;stroke-linecap:round;stroke-linejoin:round}
.sk-tools{display:flex;gap:6px;flex-wrap:wrap}
.sk-btn[aria-pressed="true"]{border-color:oklch(var(--glyph-l) var(--glyph-c) var(--h));background:oklch(var(--tint-l) var(--tint-c) var(--h))}
.pad.erasing{cursor:cell}
.sk-btn{font:inherit;font-size:13px;color:var(--fg);background:transparent;border:1px solid var(--line);border-radius:4px;padding:4px 10px;cursor:pointer}
.sk-btn:hover{border-color:var(--muted)}
.sk-btn:focus-visible{outline:2px solid oklch(var(--glyph-l) var(--glyph-c) var(--h));outline-offset:2px}
.sk-preview{display:flex;gap:12px;align-items:flex-end;color:var(--fg)}
.sk-preview svg{width:48px;height:48px;border:1px solid var(--line);border-radius:4px;padding:6px;box-sizing:content-box;background:var(--surface)}
.sk-hint{font-size:12px;color:var(--muted);max-width:22ch}
.sk-hint.wide{max-width:60ch}
.drop{width:min(216px,100%);aspect-ratio:1;border:2px dashed var(--line);border-radius:4px;display:grid;place-items:center;text-align:center;
  padding:10px;box-sizing:border-box;color:var(--muted);font-size:13px;cursor:pointer;background:var(--bg);overflow:hidden}
.drop:hover,.drop.over{border-color:oklch(var(--glyph-l) var(--glyph-c) var(--h))}
.drop.over{background:oklch(var(--tint-l) var(--tint-c) var(--h))}
.drop:focus-visible{outline:2px solid oklch(var(--glyph-l) var(--glyph-c) var(--h));outline-offset:2px}
.drop.has{padding:0;border-style:solid}
.drop-img{width:100%;height:100%;object-fit:contain;display:block}
.drop-img[hidden],.drop-empty[hidden]{display:none}
.state{margin-left:auto;font:400 11px var(--mono);color:var(--muted);white-space:nowrap}
.move.chosen{border-color:oklch(var(--glyph-l) var(--glyph-c) var(--h) / .55)}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding-block:10px;margin-top:16px;display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap;font-size:14px}
.bar b{font-variant-numeric:tabular-nums}
.bar .where{color:var(--muted);font-size:13px}
.glyph svg{width:100%;height:100%}
.rank{font-weight:500;color:var(--fg)}
.custom{margin:0;font-size:14px;border-top:1px dashed var(--line);padding-top:8px}
.custom > span{display:block;font:500 11px var(--mono);text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:2px}
</style>
<div class="wrap">
<div class="intro">
<h1>Move Symbols</h1>
<p>Pick the symbol for each move: one of three icons from the Lucide set the site already uses, best fit first, or the symbol drawn in the same style from its description. Choose <b>none</b> to describe the symbol you want instead. Click a picked symbol again to clear it. Colors follow the move's group.</p>
</div>
<div class="bar"><span><b id="count">0</b> of <b id="total">0</b> moves have a symbol picked</span><span class="where" id="where">Connecting…</span></div>
__SECTIONS__
</div>
<script>
(() => {
  const cards = [...document.querySelectorAll('.move')];
  const state = {};                       // move id -> {choice, note}
  let db = null;
  const where = document.getElementById('where');
  document.getElementById('total').textContent = cards.length;

  const LS = 'move-symbol-choices';
  const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} } };
  const lsWrite = () => { try { localStorage.setItem(LS, JSON.stringify(state)) } catch {} };

  function render(id) {
    const card = document.getElementById('m-' + id); if (!card) return;
    const st = state[id] || {};
    let picked = null;
    card.querySelectorAll('button.ic').forEach(b => {
      const on = !!st.choice && b.dataset.choice === st.choice;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) picked = b;
    });
    const note = card.querySelector('.note');
    note.hidden = st.choice !== 'none';
    const ta = note.querySelector('textarea');
    if (document.activeElement !== ta) ta.value = st.note || '';
    drawInk(id);
    showRef(id);
    card.classList.toggle('chosen', !!st.choice);
    card.classList.toggle('wide', st.choice === 'none');   // room for a big drawing pad
    const badge = card.querySelector('.badge');
    if (!badge.dataset.orig) badge.dataset.orig = badge.innerHTML;
    if (st.choice === 'none') badge.innerHTML = '<span class="nonebox"></span>';
    else if (picked) badge.innerHTML = picked.querySelector('.glyph').innerHTML;
    else badge.innerHTML = badge.dataset.orig;
    document.getElementById('count').textContent = Object.values(state).filter(v => v && v.choice).length;
  }
  const status = (id, text) => { const el = document.querySelector('#m-' + id + ' .state'); if (el) el.textContent = text };

  const pending = {};
  async function save(id) {
    delete pending[id];
    const st = state[id] || {};
    lsWrite();
    if (!db) { status(id, 'Saved in this browser'); return }
    status(id, 'Saving…');
    try {
      await db.collection('choices').doc(id).set({ choice: st.choice || '', note: st.note || '',
        sketch: Array.isArray(st.sketch) ? st.sketch : [], ref: typeof st.ref === 'string' ? st.ref : '',
        updated: new Date().toISOString() });
      status(id, 'Saved');
    } catch (e) {
      status(id, 'Saved in this browser only');
    }
  }
  function saveSoon(id, ms) {
    clearTimeout(pending[id]);
    pending[id] = setTimeout(() => save(id), ms);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('button.ic'); if (!b) return;
    const id = b.dataset.move, choice = b.dataset.choice;
    const st = state[id] = { ...(state[id] || {}) };
    st.choice = st.choice === choice ? '' : choice;
    render(id); saveSoon(id, 0);
    if (st.choice === 'none') setTimeout(() => document.getElementById('note-' + id)?.focus(), 30);
  });
  // ── Sketch pad: strokes kept as polylines in the icons' 24-unit grid, so Claude can read and redraw them ──
  let drawing = null;                                   // {id, pad, stroke}
  function cleanSketch(v) {
    if (!Array.isArray(v)) return [];
    return v.filter(s => Array.isArray(s) && s.length >= 2 && s.length <= 2000 && s.every(n => typeof n === 'number' && isFinite(n)))
            .slice(0, 60);
  }
  const pathOf = s => {
    let d = 'M' + s[0] + ' ' + s[1];
    for (let i = 2; i < s.length; i += 2) d += 'L' + s[i] + ' ' + s[i + 1];
    if (s.length === 2) d += 'h.01';                    // a tap is a dot
    return d;
  };
  function drawInk(id) {
    const st = state[id] || {};
    const ink = (st.sketch || []).map(s => '<path d="' + pathOf(s) + '"/>').join('');
    // On the pad: a thin pen line over a faint band at the icons' real thickness. The preview shows the real thing.
    const padInk = (st.sketch || []).map(s => '<path class="ghost" d="' + pathOf(s) + '"/>').join('')
                 + (st.sketch || []).map(s => '<path class="line" d="' + pathOf(s) + '"/>').join('');
    document.querySelectorAll('#m-' + id + ' .pad .ink').forEach(g => { g.innerHTML = padInk });
    document.querySelectorAll('#m-' + id + ' .sk-preview .ink').forEach(g => { g.innerHTML = ink });
  }
  function padPoint(pad, e) {
    const r = pad.getBoundingClientRect();
    const x = Math.min(24, Math.max(0, (e.clientX - r.left) / r.width * 24));
    const y = Math.min(24, Math.max(0, (e.clientY - r.top) / r.height * 24));
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }
  // Pen or eraser, one setting for every pad on the page. Undo steps back through whole strokes and erasures.
  let erasing = false;
  const history = {};                                   // move id -> earlier sketches
  const ERASE_R = 1.3;                                  // eraser radius, in grid units
  function setTool(er) {
    erasing = er;
    document.querySelectorAll('button.sk-btn[data-act="pen"]').forEach(b => b.setAttribute('aria-pressed', er ? 'false' : 'true'));
    document.querySelectorAll('button.sk-btn[data-act="eraser"]').forEach(b => b.setAttribute('aria-pressed', er ? 'true' : 'false'));
    document.querySelectorAll('svg.pad').forEach(p => p.classList.toggle('erasing', er));
  }
  // Rub out everything within the eraser's reach. Strokes are resampled finely first, so a long straight line
  // with only two points still breaks where the eraser crosses it; what is left stays as separate strokes.
  function eraseAt(sketch, x, y) {
    const out = [];
    let changed = false;
    for (const s of sketch) {
      const pts = [];
      for (let i = 0; i < s.length; i += 2) {
        if (i === 0) { pts.push([s[0], s[1]]); continue }
        const ax = s[i - 2], ay = s[i - 1], bx = s[i], by = s[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.3));
        for (let k = 1; k <= n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
      }
      if (!pts.some(([px, py]) => Math.hypot(px - x, py - y) <= ERASE_R)) { out.push(s); continue }
      changed = true;
      let run = [];
      const flush = () => { if (run.length >= 2) out.push(simplify(run)); run = [] };
      for (const [px, py] of pts) {
        if (Math.hypot(px - x, py - y) <= ERASE_R) flush();
        else run.push(px, py);
      }
      flush();
    }
    return changed ? out.slice(0, 60) : sketch;
  }
  // Drop resampled points that sit on a straight line, so erased strokes stay small; round to tenths.
  function simplify(flat) {
    const p = [];
    for (let i = 0; i < flat.length; i += 2) p.push([Math.round(flat[i] * 10) / 10, Math.round(flat[i + 1] * 10) / 10]);
    const keep = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const [ax, ay] = keep[keep.length - 1], [bx, by] = p[i], [cx, cy] = p[i + 1];
      const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
      if (cross > 0.05) keep.push(p[i]);
    }
    if (p.length > 1) keep.push(p[p.length - 1]);
    return keep.flat();
  }
  document.addEventListener('pointerdown', e => {
    const pad = e.target.closest && e.target.closest('svg.pad'); if (!pad) return;
    e.preventDefault();
    const id = pad.dataset.move;
    const st = state[id] = { ...(state[id] || {}) };
    (history[id] = history[id] || []).push((st.sketch || []).map(s => s.slice()));
    if (history[id].length > 50) history[id].shift();
    const pt = padPoint(pad, e);
    if (erasing) {
      st.sketch = eraseAt(st.sketch || [], pt[0], pt[1]);
      drawing = { id, pad, erase: true };
    } else {
      st.sketch = [...(st.sketch || []), pt];
      if (st.sketch.length > 60) st.sketch = st.sketch.slice(-60);
      drawing = { id, pad, stroke: st.sketch[st.sketch.length - 1] };
    }
    try { pad.setPointerCapture(e.pointerId) } catch {}
    drawInk(id);
  });
  document.addEventListener('pointermove', e => {
    if (!drawing) return;
    const [x, y] = padPoint(drawing.pad, e);
    if (drawing.erase) {
      const st = state[drawing.id];
      const next = eraseAt(st.sketch || [], x, y);
      if (next !== st.sketch) { st.sketch = next; drawInk(drawing.id) }
      return;
    }
    const s = drawing.stroke, lx = s[s.length - 2], ly = s[s.length - 1];
    if (Math.hypot(x - lx, y - ly) < 0.35 || s.length >= 2000) return;
    s.push(x, y);
    drawInk(drawing.id);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button.sk-btn[data-act="pen"], button.sk-btn[data-act="eraser"]'); if (!b) return;
    setTool(b.dataset.act === 'eraser');
  });
  const endStroke = () => {
    if (!drawing) return;
    const id = drawing.id; drawing = null;
    status(id, 'Sketch changed'); saveSoon(id, 500);
  };
  document.addEventListener('pointerup', endStroke);
  document.addEventListener('pointercancel', endStroke);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button.sk-btn[data-act="undo"], button.sk-btn[data-act="clear"]'); if (!b) return;
    const id = b.dataset.move;
    const st = state[id] = { ...(state[id] || {}) };
    const h = history[id] = history[id] || [];
    if (b.dataset.act === 'clear') { h.push((st.sketch || []).map(s => s.slice())); st.sketch = [] }
    else st.sketch = h.length ? h.pop() : (st.sketch || []).slice(0, -1);
    drawInk(id); saveSoon(id, 300);
  });

  // ── Reference image: shrunk in the browser and kept with the pick, so Claude can look at it ──
  const cleanRef = v => (typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '');
  function showRef(id) {
    const card = document.getElementById('m-' + id); if (!card) return;
    const ref = cleanRef((state[id] || {}).ref);
    const drop = card.querySelector('.drop'), img = card.querySelector('.drop-img'), empty = card.querySelector('.drop-empty');
    if (!drop) return;
    if (ref) { if (img.getAttribute('src') !== ref) img.src = ref; img.hidden = false; empty.hidden = true; drop.classList.add('has') }
    else { img.removeAttribute('src'); img.hidden = true; empty.hidden = false; drop.classList.remove('has') }
  }
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        let side = 512, out = '';
        for (let tries = 0; tries < 5; tries++) {
          const k = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(im, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', 0.82);
          if (out.length < 180000) break;
          side = Math.round(side * 0.75);
        }
        resolve(out);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')) };
      im.src = url;
    });
  }
  async function takeImage(id, file) {
    if (!file || !/^image\//.test(file.type)) { status(id, 'That file is not an image'); return }
    status(id, 'Reading image…');
    try {
      const ref = await shrink(file);
      state[id] = { ...(state[id] || {}), ref };
      showRef(id); saveSoon(id, 0);
    } catch { status(id, 'Could not read that image') }
  }
  document.addEventListener('dragover', e => {
    const d = e.target.closest && e.target.closest('.drop'); if (!d) return;
    e.preventDefault(); d.classList.add('over');
  });
  document.addEventListener('dragleave', e => {
    const d = e.target.closest && e.target.closest('.drop'); if (d && !d.contains(e.relatedTarget)) d.classList.remove('over');
  });
  document.addEventListener('drop', e => {
    const d = e.target.closest && e.target.closest('.drop'); if (!d) return;
    e.preventDefault(); d.classList.remove('over');
    takeImage(d.dataset.move, e.dataTransfer && e.dataTransfer.files[0]);
  });
  document.addEventListener('change', e => {
    const f = e.target.closest && e.target.closest('input.drop-file'); if (!f) return;
    takeImage(f.dataset.move, f.files[0]); f.value = '';
  });
  document.addEventListener('keydown', e => {
    const d = e.target.closest && e.target.closest('.drop');
    if (d && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); document.getElementById('file-' + d.dataset.move)?.click() }
  });
  document.addEventListener('paste', e => {
    const card = (document.activeElement && document.activeElement.closest('.move')) || null;
    const file = [...((e.clipboardData && e.clipboardData.files) || [])].find(f => /^image\//.test(f.type));
    if (!card || !file || card.querySelector('.note').hidden) return;
    e.preventDefault(); takeImage(card.dataset.move, file);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button.sk-btn[data-act="noimg"]'); if (!b) return;
    const id = b.dataset.move;
    state[id] = { ...(state[id] || {}), ref: '' };
    showRef(id); saveSoon(id, 0);
  });

  document.addEventListener('input', e => {
    const ta = e.target.closest('textarea[data-move]'); if (!ta) return;
    const id = ta.dataset.move;
    state[id] = { ...(state[id] || {}), note: ta.value };
    status(id, 'Typing…'); saveSoon(id, 900);
  });
  document.addEventListener('focusout', e => {
    const ta = e.target.closest && e.target.closest('textarea[data-move]');
    if (ta && pending[ta.dataset.move]) { clearTimeout(pending[ta.dataset.move]); save(ta.dataset.move) }
  });

  Object.assign(state, lsRead());
  cards.forEach(c => render(c.dataset.move));
  where.textContent = 'Picks are kept in this browser.';

  (async () => {
    try { db = window.claude && window.claude.use ? await window.claude.use('db') : null } catch { db = null }
    if (!db) return;
    where.textContent = 'Picks save as you click, and Claude can read them.';
    db.collection('choices').onSnapshot(snap => {
      snap.docs.forEach(d => {
        const id = d.id;
        if (pending[id]) return;               // a local edit is on its way
        const v = d.data() || {};
        if (drawing && drawing.id === id) return;   // mid-stroke: keep the local lines
        state[id] = { choice: typeof v.choice === 'string' ? v.choice : '', note: typeof v.note === 'string' ? v.note : '',
                      sketch: cleanSketch(v.sketch), ref: cleanRef(v.ref) };
        render(id);
      });
      lsWrite();
    }, () => { db = null; where.textContent = 'Saving to the page stopped; picks are kept in this browser.' });
  })();
})();
</script>
"""

if __name__ == "__main__":
    main()
