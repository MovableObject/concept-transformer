"""Image concepts vs Ideas, side by side: the same concept and move in both modes, read aloud.

Not a blind test: it shows the difference between the two modes. Runs through a relay
(default the local one) so the prompts are the site's real ones.
    python tests/modes4.py [base url] [engine]
Writes results/modes4_<ts>.html and .json.
"""
import asyncio, base64, datetime, html, json, os, sys, urllib.request, urllib.error
import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
ENGINE = sys.argv[2] if len(sys.argv) > 2 else "groq"
PICKS = [("assembler", "combine"), ("A cat asleep on a windowsill.", "reverse"),
         ("second earth", "provocation"), ("A bakery that only opens at night.", "rule_break")]
MOVES = {m["id"]: m for m in json.load(open(os.path.join(HERE, "..", "moves.json"), encoding="utf-8"))["moves"]}


def press(mode, move, concept):
    """One press; Groq's free tier allows about 8,000 tokens a minute, so wait and retry when busy."""
    import time
    msg = "error"
    for attempt in range(5):
        req = urllib.request.Request(BASE + "/relay.php", headers={"Content-Type": "application/json"},
                                     data=json.dumps({"engine": ENGINE, "mode": mode, "move": move, "concept": concept}).encode())
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                v = json.load(r).get("variants") or []
                return v[0] if v else "(nothing came back)"
        except urllib.error.HTTPError as e:
            msg = json.loads(e.read().decode() or "{}").get("message") or "error"
            time.sleep(25)
    return "(" + msg + ")"


def strip_tag(t):
    return t.split("]", 1)[1].strip() if t.startswith("[") and "]" in t else t


async def speak(text):
    buf = bytearray()
    async for ch in edge_tts.Communicate(text, "en-US-EricNeural", rate="+20%").stream():
        if ch.get("type") == "audio" and ch.get("data"):
            buf.extend(ch["data"])
    return "data:audio/mpeg;base64," + base64.b64encode(bytes(buf)).decode()


async def main():
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    cards = []
    for concept, move in PICKS:
        label = MOVES[move]["label"]["image"]
        img, idea = press("image", move, concept), press("ideas", move, concept)
        say = (f"{label}, on: {concept} Image concept: {strip_tag(img)}. Idea: {strip_tag(idea)}.")
        cards.append({"concept": concept, "move": label, "image": img, "ideas": idea, "audio": await speak(say)})
        print(f"{label}: done", flush=True)
    out = os.path.join(HERE, "results", f"modes4_{ts}")
    json.dump([{k: v for k, v in c.items() if k != "audio"} for c in cards],
              open(out + ".json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    rows = "".join(
        f'<div class="card"><div class="mv">{html.escape(c["move"])} · {html.escape(c["concept"])}</div>'
        f'<div class="row"><b>Image concept</b><span>{html.escape(c["image"])}</span></div>'
        f'<div class="row"><b>Idea</b><span>{html.escape(c["ideas"])}</span></div>'
        f'<button onclick="play({i})">Read aloud</button></div>' for i, c in enumerate(cards))
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Image concepts vs Ideas</title>
<style>body{{background:#1b1b1d;color:#e6e6e6;font:17px/1.5 system-ui,sans-serif;margin:0;display:flex;justify-content:center}}
.wrap{{max-width:780px;width:100%;padding:36px 20px}} h1{{font-size:20px;font-weight:600}} .dim{{color:#9a9aa0;font-size:14px}}
.card{{border:1px solid #3a3a3e;border-radius:4px;background:#232326;padding:14px 16px;margin:14px 0}}
.mv{{font-size:13px;color:#9a9aa0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}}
.row{{display:flex;gap:12px;margin:6px 0}} .row b{{flex:none;width:120px;color:#9a9aa0;font-weight:600;font-size:14px}}
button{{background:#2b2b2f;color:#e6e6e6;border:1px solid #444;border-radius:4px;padding:5px 12px;cursor:pointer;margin-top:6px}}</style></head>
<body><div class="wrap"><h1>Image concepts vs Ideas</h1><div class="dim">Same concept, same move, both modes ({html.escape(ENGINE)}). Read aloud plays all four in order.</div>
<button onclick="playAll()">Read all aloud</button> <button onclick="stop()">Stop</button>{rows}</div>
<script>const A={json.dumps([c["audio"] for c in cards])};let a=null,q=[];
function stop(){{q=[];if(a)a.pause();}}
function play(i){{stop();a=new Audio(A[i]);a.play();}}
function next(){{if(!q.length)return;a=new Audio(A[q.shift()]);a.onended=next;a.play();}}
function playAll(){{stop();q=A.map((_,i)=>i);next();}}</script></body></html>"""
    open(out + ".html", "w", encoding="utf-8").write(page)
    print(out + ".html")


if __name__ == "__main__":
    asyncio.run(main())
