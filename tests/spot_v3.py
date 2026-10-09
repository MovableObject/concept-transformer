"""Read-aloud spot check of the version 3 moves in Ideas mode: one result per new move, through the site's relay.

Collisions and the first few moves go to Gemini Flash (the site's first engine); the rest to Groq GPT OSS, so a
spot check does not use up the site's Gemini day. Every card says which engine answered. Writes
results/spot_v3_<ts>.html (audio baked in, plays without a server) and .json.

    python tests/spot_v3.py [base url]          default: the local relay, tests/local/serve.ps1
"""
import asyncio
import base64
import datetime
import html
import json
import os
import sys
import urllib.error
import urllib.request

import edge_tts

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.endswith(".json")]
RESUME = next((a for a in sys.argv[1:] if a.endswith(".json")), None)   # a results file: redo only its empty cards
BASE = ARGS[0] if ARGS else "http://127.0.0.1:8787"
MOVES = {m["id"]: m for m in json.load(open(os.path.join(HERE, "..", "moves.json"), encoding="utf-8"))["moves"]}
A = "A library that lends tools instead of books"
B = "A bakery that only opens at night"
# (move, engine, concept, second box)
PICKS = [
    ("bisociation", "gemini", A, B), ("split_pair", "gemini", A, B), ("blending", "gemini", A, B),
    ("graft", "gemini", A, B), ("collide", "gemini", A, B), ("dialectic", "gemini", A, B),
    ("abstraction", "gemini", B, ""), ("concretization", "gemini", A, ""), ("constraint_add", "gemini", B, ""),
    ("pov_shift", "gemini", A, ""),  # Gemini falls back to Groq once its free day is used
    ("synecdoche", "groq", B, ""), ("metonymy", "groq", A, ""), ("metaphor", "groq", B, ""),
    ("etymology", "groq", A, ""), ("translation_drift", "groq", B, ""), ("lewitt", "groq", A, ""),
    ("misuse", "groq", B, ""), ("documentation", "groq", A, ""), ("split", "groq", B, ""),
    ("constraint_inversion", "groq", A, ""), ("oulipo", "groq", B, ""), ("oblique", "groq", A, ""),
    ("surrealist", "groq", B, ""), ("exquisite_corpse", "groq", A, ""), ("time_shift", "groq", B, ""),
    ("tonal_shift", "groq", A, ""), ("compression", "groq", B, ""),
]
ENGINES = {"gemini": "Gemini Flash", "groq": "Groq GPT OSS"}


def press(engine, move, concept, concept2):
    body = {"engine": engine, "mode": "ideas", "move": move, "concept": concept, "words": 30}
    if concept2:
        body["concept2"] = concept2
    req = urllib.request.Request(BASE + "/relay.php", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    import time
    time.sleep(20 if engine == "groq" else 0)   # Groq free tier: about three presses a minute
    for _ in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                b = json.load(r)
                if b.get("variants"):
                    return b["variants"][0], ENGINES.get(b.get("engine"), b.get("engine", "")), b.get("card", "")
        except urllib.error.HTTPError as e:
            print("   ", move, e.code, e.read()[:200])
            time.sleep(60)
    return "(nothing came back)", "", ""


def strip_tag(t):
    return t.split("]", 1)[1].strip() if t.startswith("[") and "]" in t else t


async def speak(text):
    buf = bytearray()
    async for ch in edge_tts.Communicate(text, "en-US-EricNeural", rate="+20%").stream():
        if ch.get("type") == "audio" and ch.get("data"):
            buf.extend(ch["data"])
    return "data:audio/mpeg;base64," + base64.b64encode(bytes(buf)).decode()


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Version 3 moves: spot check</title><style>
:root{color-scheme:dark}body{margin:0;background:#111318;color:#e8e8ee;font:16px/1.5 system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 80px}h1{font-size:22px;margin:0 0 4px}.sub{color:#9aa0ad;margin:0 0 18px}
.card{border:1px solid #2a2e38;border-radius:4px;padding:14px 16px;margin:12px 0;background:#171a21}.card.on{border-color:#7c83ff}
.mv{font-weight:700;font-size:18px}.what{color:#9aa0ad;font-size:14px}.res{margin:8px 0 4px;font-size:17px}.tag{color:#9aa0ad;font-size:13px}
.meta{color:#7d8392;font-size:12px}button{background:#4f46e5;color:#fff;border:0;border-radius:4px;padding:8px 14px;font:inherit;cursor:pointer}
.row{display:flex;gap:8px;align-items:center;justify-content:space-between}
</style></head><body><main><h1>Version 3 moves, Ideas mode</h1>
<p class="sub">One result per new move. Collisions start from A: __A__, and B: __B__. Press Play all to hear them in order.</p>
<p><button id="all">Play all</button></p>__CARDS__</main><script>
const cards=[...document.querySelectorAll('.card')];let cur=null;
function play(i){if(cur){cur.pause()}cards.forEach(c=>c.classList.remove('on'));if(i>=cards.length)return;const c=cards[i];c.classList.add('on');c.scrollIntoView({block:'center',behavior:'smooth'});cur=c.querySelector('audio');cur.currentTime=0;cur.play();cur.onended=()=>{if(window.chain)play(i+1)}}
document.getElementById('all').onclick=()=>{window.chain=true;play(0)};
cards.forEach((c,i)=>c.querySelector('button').onclick=()=>{window.chain=false;play(i)});
</script></body></html>"""


async def main():
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    out = os.path.join(HERE, "results")
    os.makedirs(out, exist_ok=True)
    cards = []
    old = json.load(open(RESUME, encoding="utf-8")) if RESUME else []
    for n, (mid, engine, c1, c2) in enumerate(PICKS, 1):
        m = MOVES[mid]
        prev = old[n - 1] if n <= len(old) else None
        if prev and not prev["text"].startswith("(nothing"):
            cards.append(prev)
            continue
        text, who, card = press(engine, mid, c1, c2)
        print(f"{n:>2} {m['label']['ideas']:<24} {who:<14} {text[:90]}")
        cards.append({"move": m["label"]["ideas"], "blurb": m["blurb"]["ideas"], "concept": c1, "concept2": c2,
                      "text": text, "engine": who, "card": card, "evidence": m.get("evidence", "")})
        json.dump(cards, open(os.path.join(out, f"spot_v3_{stamp}.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    parts = []
    for n, c in enumerate(cards, 1):
        start = f"A and B collide" if c["concept2"] else f"From: {c['concept']}"
        say = (f"{n}. {c['move']}. {c['blurb']} " + (f"The card: {c['card']}. " if c["card"] else "")
               + ("Colliding A and B. " if c["concept2"] else f"Starting from {c['concept']}. ")
               + f"Result: {strip_tag(c['text'])}")
        audio = await speak(say)
        tag = c["text"].split("]", 1)[0][1:] if c["text"].startswith("[") and "]" in c["text"] else ""
        parts.append(
            f'<div class="card"><div class="row"><span class="mv">{n}. {html.escape(c["move"])}</span><button>Play</button></div>'
            f'<div class="what">{html.escape(c["blurb"])}</div>'
            + (f'<div class="tag">Card: {html.escape(c["card"])}</div>' if c["card"] else "")
            + f'<div class="res">{html.escape(strip_tag(c["text"]))}</div>'
            + (f'<div class="tag">{html.escape(tag)}</div>' if tag else "")
            + f'<div class="meta">{html.escape(start)} · {html.escape(c["engine"])}'
            + (f' · tested {html.escape(c["evidence"])} in the studio' if c["evidence"] else "")
            + f'</div><audio preload="none" src="{audio}"></audio></div>')
    page = PAGE.replace("__A__", html.escape(A)).replace("__B__", html.escape(B)).replace("__CARDS__", "\n".join(parts))
    path = os.path.join(out, f"spot_v3_{stamp}.html")
    open(path, "w", encoding="utf-8").write(page)
    print("wrote", path)


if __name__ == "__main__":
    asyncio.run(main())
