"""Do Opus-written worked examples make the free engine follow each move better? A blind A/B on Groq GPT OSS, the
engine most visitors get, through the local relay exactly as the page calls it, judged by Claude Opus and by the owner.

    python tests/exemplar_ab.py run base      export WITHOUT the examples, run every move once on Groq
    python tests/exemplar_ab.py run ex        export WITH the examples, run every move once on Groq
    python tests/exemplar_ab.py judge         Opus picks the better of each pair, blind (needs ANTHROPIC_API_KEY)
    python tests/exemplar_ab.py page          the read-aloud page: the owner picks blind, then sees the judge

Runs are resumable (Groq's free tier has a daily token cap): run the same command again to fill in what is missing.
Start the relay first with a high hourly cap:  $env:CT_PER_IP_HOUR=100000; tests/local/serve.ps1
Results live in tests/results/exemplar_ab.json; the page in tests/results/exemplar_ab.html.
"""
import asyncio
import base64
import html
import json
import os
import random
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STORE = os.path.join(HERE, "results", "exemplar_ab.json")
BASE = "http://127.0.0.1:8787"
JUDGE_MODEL = "claude-opus-5-5"
A, B = "A library that lends tools instead of books", "A bakery that only opens at night"
FIELDS = {"domain_transfer": "beekeeping"}


def load():
    return json.load(open(STORE, encoding="utf-8")) if os.path.exists(STORE) else {"runs": {}, "judge": {}}


def save(d):
    os.makedirs(os.path.dirname(STORE), exist_ok=True)
    json.dump(d, open(STORE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


def moves():
    return {m["id"]: m for m in json.load(open(os.path.join(ROOT, "moves.json"), encoding="utf-8"))["moves"]}


def export(with_examples):
    env = {**os.environ, "CT_NO_EXEMPLARS": "0" if with_examples else "1"}
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "export_moves.py")], env=env, check=True,
                   stdout=subprocess.DEVNULL)


def press(mid, two):
    body = {"engine": "groq", "mode": "ideas", "move": mid, "concept": A, "words": 30}
    if two:
        body["concept2"] = B
    if mid in FIELDS:
        body["field"] = FIELDS[mid]
    req = urllib.request.Request(BASE + "/relay.php", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                b = json.load(r)
                return {"variants": b.get("variants") or [], "engine": b.get("engine", ""), "card": b.get("card", "")}
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode("utf-8", "replace")
            print("   ", mid, e.code, msg)
            if "per day" in msg or "TPD" in msg or "daily" in msg.lower():
                sys.exit("Groq's daily cap is used up; run the same command again tomorrow.")
            time.sleep(60)
    return None


def run(label):
    d = load()
    export(label == "ex")
    ms = moves()
    got = d["runs"].setdefault(label, {})
    todo = [mid for mid in ms if mid not in got]
    print(f"{label}: {len(todo)} of {len(ms)} moves to run")
    for i, mid in enumerate(todo):
        if i:
            time.sleep(20)   # Groq's free tier: a few presses a minute
        r = press(mid, ms[mid].get("inputs") == 2)
        if not r or not r["variants"]:
            print(f"  {mid}: nothing came back")
            continue
        got[mid] = r
        save(d)
        print(f"  {mid:<22} {r['engine']:<6} {r['variants'][0][:90]}")
    export(True)   # leave the local prompts with the examples in


JUDGE_SYSTEM = """You compare two results of the same creative transform, produced by a small model on the same input. \
Decide which one performs the transform better, judged by these, in order:
1. It actually does the method the transform's instructions describe (the exact move, not a general rewrite).
2. It obeys the instructions' form: the leading tag and what it must name, one idea, roughly the asked length, any \
required form (a document, a forced word game, a compression).
3. It stays on the input's own particulars rather than drifting to a generic or stock idea.
4. It does not borrow the subject, words or images of the worked example shown in the instructions (if any). \
Borrowing is a serious fault.
Ignore which one is more vivid unless 1 to 4 are equal. Answer "tie" only when they are genuinely equal on all four."""
JUDGE_SCHEMA = {"type": "object", "properties": {"better": {"type": "string", "enum": ["1", "2", "tie"]},
                                                 "reason": {"type": "string"}},
                "required": ["better", "reason"], "additionalProperties": False}


def judge():
    import anthropic
    d = load()
    P = json.load(open(os.path.join(ROOT, "ct_private", "prompts.json"), encoding="utf-8"))
    ms = moves()
    client = anthropic.Anthropic()
    base, ex = d["runs"].get("base", {}), d["runs"].get("ex", {})
    rng = random.Random(7)
    for mid in ms:
        if mid in d["judge"] or mid not in base or mid not in ex:
            continue
        sysm = P["moves"][mid]["system"]["ideas"]          # the prompt WITH the example, so borrowing can be seen
        flip = rng.random() < 0.5
        one, two = (ex, base) if flip else (base, ex)
        inp = f"Input: {A}" + (f"\nInput B: {B}" if ms[mid].get("inputs") == 2 else "")
        user = (f"THE TRANSFORM'S INSTRUCTIONS:\n{sysm}\n\n{inp}\n\nRESULT 1:\n{one[mid]['variants'][0]}\n\n"
                f"RESULT 2:\n{two[mid]['variants'][0]}")
        r = client.messages.create(model=JUDGE_MODEL, max_tokens=8000, system=JUDGE_SYSTEM,
                                   output_config={"effort": "high", "format": {"type": "json_schema", "schema": JUDGE_SCHEMA}},
                                   messages=[{"role": "user", "content": user}])
        if r.stop_reason == "refusal":
            print(f"  {mid}: refused")
            continue
        v = json.loads(next(b.text for b in r.content if b.type == "text"))
        winner = "tie" if v["better"] == "tie" else ("ex" if (v["better"] == "1") == flip else "base")
        d["judge"][mid] = {"winner": winner, "reason": v["reason"], "ex_first": flip}
        save(d)
        print(f"  {mid:<22} {winner:<5} {v['reason'][:90]}")
    w = [j["winner"] for j in d["judge"].values()]
    print(f"examples won {w.count('ex')}, lost {w.count('base')}, tied {w.count('tie')}")


async def speak(text):
    import edge_tts
    buf = bytearray()
    async for ch in edge_tts.Communicate(text, "en-US-EricNeural", rate="+20%").stream():
        if ch.get("type") == "audio" and ch.get("data"):
            buf.extend(ch["data"])
    return "data:audio/mpeg;base64," + base64.b64encode(bytes(buf)).decode()


def strip_tag(t):
    return t.split("]", 1)[1].strip() if t.startswith("[") and "]" in t else t


PAGE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Worked examples: blind check</title><style>
:root{color-scheme:dark}body{margin:0;background:#111318;color:#e8e8ee;font:16px/1.5 system-ui,sans-serif}
main{max-width:780px;margin:0 auto;padding:24px 16px 80px}h1{font-size:22px;margin:0 0 4px}.sub{color:#9aa0ad;margin:0 0 14px}
.card{border:1px solid #2a2e38;border-radius:4px;padding:14px 16px;margin:12px 0;background:#171a21}.card.on{border-color:#7c83ff}
.mv{font-weight:700;font-size:18px}.res{margin:8px 0;padding:8px 10px;border-radius:4px;background:#1d2029}.res b{color:#9aa0ad;font-weight:600}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}button{background:#2a2e38;color:#e8e8ee;border:0;border-radius:4px;padding:7px 12px;font:inherit;cursor:pointer}
button.play{background:#4f46e5;color:#fff}button.sel{background:#7c83ff;color:#111}.reveal{display:none;margin-top:8px;color:#b9bfcc;font-size:14px}
.card.done .reveal{display:block}#tally{position:sticky;top:0;background:#111318;padding:8px 0;border-bottom:1px solid #2a2e38;z-index:1}
</style></head><body><main><h1>Worked examples: blind check</h1>
<p class="sub">Each card is one transform on the free engine, once without the new worked example and once with it, in random order. Listen, pick the better one, and the card shows which was which and what Claude Opus picked. Your picks stay in this browser; Copy my picks puts them on the clipboard.</p>
<div id="tally"></div><p><button class="play" id="all">Play all</button> <button id="copy">Copy my picks</button></p>__CARDS__</main><script>
const KEY='ct.exemplar.picks';let picks={};try{picks=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const cards=[...document.querySelectorAll('.card')];let cur=null;
function tally(){let n=0,agree=0,ex=0;cards.forEach(c=>{const p=picks[c.dataset.id];if(!p)return;n++;if(p===c.dataset.judge)agree++;if(p===c.dataset.ex)ex++});
document.getElementById('tally').textContent=n?`${n} of ${cards.length} picked. You preferred the worked example ${ex} times. You agreed with Claude ${agree} of ${n}.`:`${cards.length} cards. Nothing picked yet.`}
function show(c){const p=picks[c.dataset.id];c.classList.toggle('done',!!p);c.querySelectorAll('[data-pick]').forEach(b=>b.classList.toggle('sel',b.dataset.pick===p))}
function play(i){if(cur)cur.pause();cards.forEach(c=>c.classList.remove('on'));if(i>=cards.length)return;const c=cards[i];c.classList.add('on');c.scrollIntoView({block:'center',behavior:'smooth'});cur=c.querySelector('audio');cur.currentTime=0;cur.play();cur.onended=()=>{if(window.chain&&picks[c.dataset.id])play(i+1)}}
cards.forEach((c,i)=>{show(c);c.querySelector('.play').onclick=()=>{window.chain=false;play(i)};
c.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{picks[c.dataset.id]=b.dataset.pick;try{localStorage.setItem(KEY,JSON.stringify(picks))}catch(e){};show(c);tally();if(window.chain)play(i+1)})});
document.getElementById('all').onclick=()=>{window.chain=true;play(cards.findIndex(c=>!picks[c.dataset.id]))};
document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(JSON.stringify(picks));tally();
</script></body></html>"""


async def page():
    d = load()
    ms = moves()
    parts = []
    for n, mid in enumerate([m for m in ms if m in d["judge"]], 1):
        j = d["judge"][mid]
        ex, base = d["runs"]["ex"][mid]["variants"][0], d["runs"]["base"][mid]["variants"][0]
        one, two = (ex, base) if j["ex_first"] else (base, ex)
        ex_slot, judge_slot = ("1" if j["ex_first"] else "2"), {"ex": "1" if j["ex_first"] else "2",
                                                               "base": "2" if j["ex_first"] else "1", "tie": "tie"}[j["winner"]]
        name = ms[mid].get("name") or ms[mid]["label"]["ideas"]
        two_in = ms[mid].get("inputs") == 2
        say = (f"{n}. {name}. " + ("Colliding the tool library and the night bakery. " if two_in else "Starting from the tool library. ")
               + f"One: {strip_tag(one)} Two: {strip_tag(two)}")
        audio = await speak(say)
        verdict = {"ex": "the worked example helped", "base": "the worked example made it worse", "tie": "no difference"}[j["winner"]]
        parts.append(
            f'<div class="card" data-id="{mid}" data-ex="{ex_slot}" data-judge="{judge_slot}">'
            f'<div class="row"><span class="mv">{n}. {html.escape(name)}</span><button class="play">Play</button></div>'
            f'<div class="res"><b>1</b> {html.escape(one)}</div><div class="res"><b>2</b> {html.escape(two)}</div>'
            f'<div class="row"><button data-pick="1">1 is better</button><button data-pick="2">2 is better</button><button data-pick="tie">Same</button></div>'
            f'<div class="reveal">With the worked example: {ex_slot}. Claude picked {judge_slot} ({verdict}): {html.escape(j["reason"])}</div>'
            f'<audio preload="none" src="{audio}"></audio></div>')
    path = os.path.join(HERE, "results", "exemplar_ab.html")
    open(path, "w", encoding="utf-8").write(PAGE.replace("__CARDS__", "\n".join(parts)))
    print("wrote", path)


if __name__ == "__main__":
    cmd = sys.argv[1:] or ["help"]
    if cmd[0] == "run" and len(cmd) > 1 and cmd[1] in ("base", "ex"):
        run(cmd[1])
    elif cmd[0] == "judge":
        judge()
    elif cmd[0] == "page":
        asyncio.run(page())
    else:
        print(__doc__)
