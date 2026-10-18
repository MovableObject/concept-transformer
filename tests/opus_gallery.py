"""Every transform run on Claude Opus on three inputs the owner picked, in both result types, with the site's exact
prompts: a gallery that shows by example what each transform does. Sent through the Batch API (half price).

    python tests/opus_gallery.py submit     build the 246 requests and send them as one batch
    python tests/opus_gallery.py collect    wait for the batch, then store every result
    python tests/opus_gallery.py page       the read-aloud page, grouped by transform

Needs ANTHROPIC_API_KEY in the environment. Uses ct_private/prompts.json as exported (run tools/export_moves.py with
CT_NO_EXEMPLARS=1 first so the prompts match the live site). Results: tests/results/opus_gallery.json and .html.
"""
import asyncio
import base64
import html
import json
import os
import random
import re
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STORE = os.path.join(HERE, "results", "opus_gallery.json")
MODEL = "claude-opus-5-5"
# The owner's picks, 2026-10-17: a scene, an object, an idea.
INPUTS = ["A man feeding pigeons on a park bench", "A vending machine in a hospital waiting room", "A promise made to a child"]
PAIRS = [(0, 1), (1, 2), (2, 0)]          # collisions take two inputs
WORDS = {"ideas": 30, "image": 16}         # the page's default lengths
FIELDS = {"domain_transfer": "weather"}


def length_rule(words):
    low = max(3, round(words * 0.6))
    return (f"\n\nLENGTH (overrides any other length rule above): each result is {low} to {words} words, not counting "
            "any leading [tag]." + (" Use two or three sentences if it needs them." if words > 25 else " One sentence."))


def load():
    return json.load(open(STORE, encoding="utf-8")) if os.path.exists(STORE) else {}


def save(d):
    os.makedirs(os.path.dirname(STORE), exist_ok=True)
    json.dump(d, open(STORE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


def jobs(P):
    """Every (move, mode, slot) with the system and user text the relay would send."""
    rng = random.Random(11)
    out = []
    for mid, m in P["moves"].items():
        two = m.get("inputs", 1) == 2
        for mode in ("ideas", "image"):
            sysm = m["system"][mode] if isinstance(m["system"], dict) else m["system"]
            if "WORKED EXAMPLE" in sysm:
                sys.exit("prompts hold worked examples; export with CT_NO_EXEMPLARS=1 first")
            system = sysm + P["modes"][mode]["clause"] + P.get("guard", "") + length_rule(WORDS[mode])
            template = m.get("user_template") or P["user_template"]
            for k in range(3):
                a, b = (INPUTS[PAIRS[k][0]], INPUTS[PAIRS[k][1]]) if two else (INPUTS[k], "")
                field = FIELDS.get(mid, "")
                if m.get("deck"):
                    field = rng.choice(P["oblique_deck"])
                user = template.replace("{concept}", a).replace("{concept2}", b).replace("{field}", field).replace("{field2}", "")
                out.append({"id": f"{mid}__{mode}__{k}", "move": mid, "mode": mode, "k": k, "input": a, "input2": b,
                            "field": field, "system": system, "user": user})
    return out


def submit():
    import anthropic
    P = json.load(open(os.path.join(ROOT, "ct_private", "prompts.json"), encoding="utf-8"))
    js = jobs(P)
    client = anthropic.Anthropic()
    batch = client.messages.batches.create(requests=[
        {"custom_id": j["id"], "params": {"model": MODEL, "max_tokens": 4000, "system": j["system"],
                                          "messages": [{"role": "user", "content": j["user"]}]}} for j in js])
    d = {"batch": batch.id, "jobs": {j["id"]: {k: j[k] for k in ("move", "mode", "k", "input", "input2", "field")} for j in js}}
    save(d)
    print(f"sent {len(js)} requests as batch {batch.id}")


def parse(text):
    """The relay's reading of an answer: a JSON object holding a list, or a bare list."""
    t = re.sub(r"^```(?:json)?\s*|```\s*$", "", text.strip(), flags=re.I).strip()
    for cand in (t, t[t.find("{"):t.rfind("}") + 1], t[t.find("["):t.rfind("]") + 1]):
        try:
            v = json.loads(cand)
        except Exception:
            continue
        if isinstance(v, list):
            return [x for x in v if isinstance(x, str) and x.strip()]
        if isinstance(v, dict):
            if isinstance(v.get("variants"), list):
                return [x for x in v["variants"] if isinstance(x, str) and x.strip()]
            for x in v.values():
                if isinstance(x, list):
                    return [y for y in x if isinstance(y, str) and y.strip()]
    return []


def collect():
    import anthropic
    d = load()
    client = anthropic.Anthropic()
    while True:
        b = client.messages.batches.retrieve(d["batch"])
        if b.processing_status == "ended":
            break
        print(f"  {b.processing_status}: {b.request_counts.processing} still processing")
        time.sleep(60)
    got, bad = 0, 0
    for r in client.messages.batches.results(d["batch"]):
        j = d["jobs"].get(r.custom_id)
        if not j:
            continue
        if r.result.type != "succeeded":
            j["error"] = r.result.type
            bad += 1
            continue
        msg = r.result.message
        text = next((c.text for c in msg.content if c.type == "text"), "")
        j["variants"] = parse(text)
        j["stop"] = msg.stop_reason
        got += 1 if j["variants"] else 0
        bad += 0 if j["variants"] else 1
    save(d)
    print(f"stored {got} results; {bad} failed or empty")


async def speak(text):
    import edge_tts
    buf = bytearray()
    async for ch in edge_tts.Communicate(text, "en-US-EricNeural", rate="+20%").stream():
        if ch.get("type") == "audio" and ch.get("data"):
            buf.extend(ch["data"])
    return "data:audio/mpeg;base64," + base64.b64encode(bytes(buf)).decode()


def split_tag(t):
    return (t[1:t.index("]")], t[t.index("]") + 1:].strip()) if t.startswith("[") and "]" in t else ("", t)


PAGE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Every transform on Opus</title><style>
:root{color-scheme:dark}body{margin:0;background:#111318;color:#e8e8ee;font:16px/1.5 system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:24px 16px 80px}h1{font-size:22px;margin:0 0 4px}.sub{color:#9aa0ad;margin:0 0 14px}
.card{border:1px solid #2a2e38;border-radius:4px;padding:14px 16px;margin:14px 0;background:#171a21}.card.on{border-color:#7c83ff}
.mv{font-weight:700;font-size:18px}.tech{color:#9aa0ad;font-size:14px}.what{color:#b9bfcc;font-size:14px;margin:4px 0 8px}
.res{margin:8px 0;padding:8px 10px;border-radius:4px;background:#1d2029}.in{color:#9aa0ad;font-size:13px}.tag{color:#9aa0ad;font-size:13px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}button{background:#2a2e38;color:#e8e8ee;border:0;border-radius:4px;padding:6px 11px;font:inherit;font-size:14px;cursor:pointer}
button.play{background:#4f46e5;color:#fff}.tabs button.sel{background:#7c83ff;color:#111}h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#9aa0ad;margin:10px 0 0}
.mode-image .ideas,.mode-ideas .image{display:none}#bar{position:sticky;top:0;background:#111318;padding:8px 0;border-bottom:1px solid #2a2e38;z-index:1}
</style></head><body class="mode-ideas"><main><h1>Every transform on Opus</h1>
<p class="sub">Each transform run by Claude Opus, with the site's own instructions, on the same three inputs: __INPUTS__. Two inputs are collided for the transforms that mix two things. Switch between Ideas and Images.</p>
<div id="bar" class="row tabs"><button data-m="ideas" class="sel">Ideas</button><button data-m="image">Images</button><button class="play" id="all">Play all</button><button id="stop">Stop</button> <span class="in">Space also stops.</span></div>
__CARDS__</main><script>
let mode='ideas',cur=null,seq=0;const cards=[...document.querySelectorAll('.card')];
document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{mode=b.dataset.m;document.body.className='mode-'+mode;document.querySelectorAll('[data-m]').forEach(x=>x.classList.toggle('sel',x===b))});
function stop(){++seq;if(cur){cur.pause();cur=null}window.chain=false;cards.forEach(c=>c.classList.remove('on'))}
document.getElementById('stop').onclick=stop;document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===document.body){e.preventDefault();stop()}});
function playList(list,done){if(cur)cur.pause();const my=++seq;let k=0;const next=()=>{if(my!==seq)return;if(k>=list.length){cur=null;if(done)done();return}cur=list[k++];cur.currentTime=0;cur.onended=next;cur.play()};next()}
function cardClips(c){return [c.querySelector('audio[data-a="name"]'),...c.querySelectorAll('.'+mode+' audio')]}
function play(i){cards.forEach(c=>c.classList.remove('on'));if(i>=cards.length)return;const c=cards[i];c.classList.add('on');c.scrollIntoView({block:'center',behavior:'smooth'});playList(cardClips(c),()=>{if(window.chain)play(i+1)})}
cards.forEach((c,i)=>{c.querySelector('.play').onclick=()=>{if(c.classList.contains('on')&&cur){stop();return}window.chain=false;play(i)};c.querySelectorAll('[data-say]').forEach(b=>b.onclick=()=>{const a=b.parentElement.parentElement.querySelector('audio');if(cur===a&&!a.paused){stop();return}window.chain=false;playList([a])})});
document.getElementById('all').onclick=()=>{window.chain=true;play(0)};
</script></body></html>"""


async def page():
    d = load()
    ms = {m["id"]: m for m in json.load(open(os.path.join(ROOT, "moves.json"), encoding="utf-8"))["moves"]}
    order = [m for m in ms]          # the site's own order
    parts = []
    for n, mid in enumerate(order, 1):
        m = ms[mid]
        name, tech = m.get("name") or m["label"]["ideas"], m["label"]["ideas"]
        intro = await speak(f"{n}. {name}. {m.get('plain', '')}.")
        blocks = []
        for mode in ("ideas", "image"):
            rows = []
            for k in range(3):
                j = d["jobs"].get(f"{mid}__{mode}__{k}", {})
                v = (j.get("variants") or ["(nothing came back)"])[0]
                tag, body = split_tag(v)
                src = j.get("input", "") + (f" × {j['input2']}" if j.get("input2") else "") + (f" · card: {j['field']}" if j.get("field") and m.get("deck") else "")
                audio = await speak(f"From {j.get('input', '')}" + (f" and {j['input2']}" if j.get("input2") else "") + f". {body}")
                rows.append(f'<div class="res"><div class="row"><span class="in">{html.escape(src)}</span><button data-say="1">Read aloud</button></div>'
                            f'{html.escape(body)}' + (f'<div class="tag">{html.escape(tag)}</div>' if tag else "")
                            + f'<audio preload="none" src="{audio}"></audio></div>')
            blocks.append(f'<div class="{mode}">' + "".join(rows) + '</div>')
        parts.append(f'<div class="card"><div class="row"><span class="mv">{n}. {html.escape(name)}</span>'
                     + (f'<span class="tech">{html.escape(tech)}</span>' if tech != name else "")
                     + '<button class="play">Read aloud</button></div>'
                     f'<div class="what">{html.escape(m.get("plain", ""))}. {html.escape(m["blurb"]["ideas"])}</div>'
                     + "".join(blocks) + f'<audio preload="none" data-a="name" src="{intro}"></audio></div>')
    path = os.path.join(HERE, "results", "opus_gallery.html")
    open(path, "w", encoding="utf-8").write(PAGE.replace("__INPUTS__", html.escape("; ".join(INPUTS))).replace("__CARDS__", "\n".join(parts)))
    print("wrote", path)


if __name__ == "__main__":
    cmd = (sys.argv[1:] or ["help"])[0]
    if cmd == "submit":
        submit()
    elif cmd == "collect":
        collect()
    elif cmd == "page":
        asyncio.run(page())
    else:
        print(__doc__)
