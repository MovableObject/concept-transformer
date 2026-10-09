"""Press moves through a running relay, on the free engines and on the own-key path.

Own-key presses use the keys in the Windows user environment (GEMINI_API_KEY, GROQ_API_KEY,
ANTHROPIC_API_KEY, OPENAI_API_KEY); keys are sent in the request only and never printed.

    python tests/relay_check.py [base url] [move] [second box]
    python tests/relay_check.py http://127.0.0.1:8787 collide "a snow globe"
"""
import json, os, sys, time, urllib.request, urllib.error

try:
    import winreg
except ImportError:
    winreg = None


def env(name):
    v = os.environ.get(name, "")
    if not v and winreg:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                v = winreg.QueryValueEx(k, name)[0]
        except OSError:
            v = ""
    return v.strip()


base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
move = sys.argv[2] if len(sys.argv) > 2 else "reverse"
field = sys.argv[3] if len(sys.argv) > 3 else ""
concept = "A cat asleep on a windowsill."
runs = [("gemini", None), ("groq", None)] + [
    (f"own:{p}", env(k)) for p, k in (("gemini", "GEMINI_API_KEY"), ("groq", "GROQ_API_KEY"),
                                      ("claude", "ANTHROPIC_API_KEY"), ("openai", "OPENAI_API_KEY"))]
for engine, key in runs:
    if key == "":
        print(f"{engine}: skipped, no key in the environment")
        continue
    body = {"engine": engine, "move": move, "concept": concept}
    if field:
        body["field"] = field
    if key:
        body["key"] = key
    req = urllib.request.Request(base.rstrip("/") + "/relay.php", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            out = json.load(r)
    except urllib.error.HTTPError as e:
        out = json.loads(e.read().decode() or "{}")
    dt = time.time() - t0
    v = out.get("variants") or []
    print(f"{engine}: {len(v)} variants in {dt:.1f}s {out.get('message', '')} {out.get('detail', '')}".rstrip())
    for x in v:
        print("   " + x)
