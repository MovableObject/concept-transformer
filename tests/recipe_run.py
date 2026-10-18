"""Recipe test on Claude Opus: which chains of two or three transforms give a better result than one transform alone.
Each chain runs like the graph: the first result of a step feeds the next. Ideas mode, 30 words, the site's prompts.
Steps already in the Opus gallery (same transform, same input) are reused, so only the new steps are paid for.
Each round of steps goes to the Batch API (half price); a chain's later steps wait for the round before.

    python tests/recipe_run.py run      run every round until every chain is complete (resumable)
    python tests/recipe_run.py dump     every chain as plain text, for reading and judging

Needs ANTHROPIC_API_KEY. Results: tests/results/recipes_opus.json; text: tests/results/recipes_opus.txt
Design (SPEC_recipes_test.md, trimmed; owner approved 2026-10-17): two inputs from the gallery plus one new one,
since 'a promise made to a child' pulled every transform to one idea.
"""
import json
import os
import random
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from opus_gallery import length_rule, parse  # noqa: E402

STORE = os.path.join(HERE, "results", "recipes_opus.json")
GALLERY = os.path.join(HERE, "results", "opus_gallery.json")
MODEL = "claude-opus-5-5"
INPUTS = ["A man feeding pigeons on a park bench", "A vending machine in a hospital waiting room",
          "Moving into an empty apartment"]
PAIRS = [(0, 1), (1, 2), (2, 0)]
FIELDS = {"domain_transfer": "weather"}

# A step is (move, [refs]); a ref is "A" or "B" (the inputs) or "s0", "s1"... (an earlier step's first result).
ONE = {  # single input
    # leap, then land (the studio's proven singles, finished with Make It Real)
    "L1 Huge or Tiny > Make It Real": [("scale_shift", ["A"]), ("visualize", ["s0"])],
    "L2 Combine > Make It Real": [("combine", ["A"]), ("visualize", ["s0"])],
    "L3 Reverse > Make It Real": [("reverse", ["A"]), ("visualize", ["s0"])],
    "L4 Start Impossible > Make It Real": [("provocation", ["A"]), ("visualize", ["s0"])],
    "L5 Add a Rule > Make It Real": [("constraint_add", ["A"]), ("visualize", ["s0"])],
    "L6 Repurpose > Make It Real": [("other_uses", ["A"]), ("visualize", ["s0"])],
    # two transforms
    "S1 One Part Only > Combine": [("split", ["A"]), ("combine", ["s0"])],
    "S2 Same Idea Elsewhere > One Real Case": [("abstraction", ["A"]), ("concretization", ["s0"])],
    "S3 Remove a Part > Repurpose": [("eliminate", ["A"]), ("other_uses", ["s0"])],
    "S4 Huge or Tiny > One Real Case": [("scale_shift", ["A"]), ("concretization", ["s0"])],
    "S5 Start Impossible > One Real Case": [("provocation", ["A"]), ("concretization", ["s0"])],
    "S6 Break Its Rule > Another Era": [("rule_break", ["A"]), ("time_shift", ["s0"])],
    "S7 Boil It Down > Exaggerate": [("compression", ["A"]), ("modify", ["s0"])],
    "S8 Add a Rule > Reverse": [("constraint_add", ["A"]), ("reverse", ["s0"])],
    "S9 Swap a Part > Point of View": [("substitute", ["A"]), ("pov_shift", ["s0"])],
    "S10 Part for Whole > Huge or Tiny": [("synecdoche", ["A"]), ("scale_shift", ["s0"])],
    "S11 Metaphor > One Real Case": [("metaphor", ["A"]), ("concretization", ["s0"])],
    "S12 Fresh Eyes > The Paperwork": [("defamiliarize", ["A"]), ("documentation", ["s0"])],
    "S13 Negative Space > Repurpose": [("inversion", ["A"]), ("other_uses", ["s0"])],
    "S14 Draw a Card > One Real Case": [("oblique", ["A"]), ("concretization", ["s0"])],
    "S15 Old Meaning > Another Era": [("etymology", ["A"]), ("time_shift", ["s0"])],
    "S16 Wrong Tool > The Paperwork": [("misuse", ["A"]), ("documentation", ["s0"])],
    "S17 Free Association > Boil It Down": [("surrealist", ["A"]), ("compression", ["s0"])],
    "S18 Repurpose > Add a Rule": [("other_uses", ["A"]), ("constraint_add", ["s0"])],
    # leap, then plant it back in the original
    "G1 Start Impossible > Plant back": [("provocation", ["A"]), ("graft", ["A", "s0"])],
    "G2 Metaphor > Plant back": [("metaphor", ["A"]), ("graft", ["A", "s0"])],
    "G3 Last Word Only > Plant back": [("exquisite_corpse", ["A"]), ("graft", ["A", "s0"])],
    "G4 Huge or Tiny > Plant back": [("scale_shift", ["A"]), ("graft", ["A", "s0"])],
    "G5 Remove a Part > Plant back": [("eliminate", ["A"]), ("graft", ["A", "s0"])],
    # three transforms
    "T1 One Part Only > Start Impossible > One Real Case": [("split", ["A"]), ("provocation", ["s0"]), ("concretization", ["s1"])],
    "T2 Huge or Tiny > Combine > Make It Real": [("scale_shift", ["A"]), ("combine", ["s0"]), ("visualize", ["s1"])],
    "T3 One Real Case > Break Its Rule > Change the Mood": [("concretization", ["A"]), ("rule_break", ["s0"]), ("tonal_shift", ["s1"])],
    "T4 Same Idea Elsewhere > Rebuild Elsewhere > One Real Case": [("abstraction", ["A"]), ("domain_transfer", ["s0"]), ("concretization", ["s1"])],
    "T5 Boil It Down > Metaphor > One Real Case": [("compression", ["A"]), ("metaphor", ["s0"]), ("concretization", ["s1"])],
    "T6 Remove a Part > Swap a Part > Point of View": [("eliminate", ["A"]), ("substitute", ["s0"]), ("pov_shift", ["s1"])],
}
TWO = {  # two inputs
    "C1 Clash Two Parts": [("split_pair", ["A", "B"])],
    "C2 Cross Two Worlds": [("bisociation", ["A", "B"])],
    "C3 Clash Two Parts > Make It Real": [("split_pair", ["A", "B"]), ("visualize", ["s0"])],
    "C4 Cross Two Worlds > Make It Real": [("bisociation", ["A", "B"]), ("visualize", ["s0"])],
    "C5 Clash Two Parts > Plant back in A": [("split_pair", ["A", "B"]), ("graft", ["A", "s0"])],
    "C6 Cross Two Worlds > One Real Case": [("bisociation", ["A", "B"]), ("concretization", ["s0"])],
    "C7 Blend > Plant back in A": [("blending", ["A", "B"]), ("graft", ["A", "s0"])],
    "C8 Collide > Boil It Down": [("collide", ["A", "B"]), ("compression", ["s0"])],
    "C9 Resolve the Clash > One Real Case": [("dialectic", ["A", "B"]), ("concretization", ["s0"])],
    "C10 Huge or Tiny A > Cross with B": [("scale_shift", ["A"]), ("bisociation", ["s0", "B"])],
    "C11 One Part Only A > Collide with B": [("split", ["A"]), ("collide", ["s0", "B"])],
    "C12 One Real Case each > Blend": [("concretization", ["A"]), ("concretization", ["B"]), ("blending", ["s0", "s1"])],
    "C13 Cross Two Worlds > Point of View > The Paperwork": [("bisociation", ["A", "B"]), ("pov_shift", ["s0"]), ("documentation", ["s1"])],
}


def load():
    return json.load(open(STORE, encoding="utf-8")) if os.path.exists(STORE) else {"chains": {}}


def save(d):
    json.dump(d, open(STORE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


def chains():
    out = {}
    for name, steps in ONE.items():
        for k, a in enumerate(INPUTS):
            out[f"{name.split()[0]}|{k}"] = {"name": name, "A": a, "B": "", "steps": steps}
    for name, steps in TWO.items():
        for k, (i, j) in enumerate(PAIRS):
            out[f"{name.split()[0]}|{k}"] = {"name": name, "A": INPUTS[i], "B": INPUTS[j], "steps": steps}
    return out


def gallery_lookup():
    """(move, input, input2) -> first result, from the Opus gallery's Ideas runs."""
    if not os.path.exists(GALLERY):
        return {}
    g = json.load(open(GALLERY, encoding="utf-8"))["jobs"]
    return {(j["move"], j["input"], j.get("input2", "")): j["variants"][0]
            for j in g.values() if j.get("mode") == "ideas" and j.get("variants")}


def text_of(c, outs, ref):
    return c["A"] if ref == "A" else c["B"] if ref == "B" else outs[int(ref[1:])]


def prompt(P, move, a, b, rng):
    m = P["moves"][move]
    system = m["system"]["ideas"] + P["modes"]["ideas"]["clause"] + P.get("guard", "") + length_rule(30)
    field = rng.choice(P["oblique_deck"]) if m.get("deck") else FIELDS.get(move, "")
    template = m.get("user_template") or P["user_template"]
    user = template.replace("{concept}", a).replace("{concept2}", b).replace("{field}", field).replace("{field2}", "")
    return system, user, field


def strip_tag(t):
    return t.split("]", 1)[1].strip() if t.startswith("[") and "]" in t else t


def run():
    import anthropic
    P = json.load(open(os.path.join(ROOT, "ct_private", "prompts.json"), encoding="utf-8"))
    if any("WORKED EXAMPLE" in (m["system"]["ideas"] if isinstance(m["system"], dict) else m["system"]) for m in P["moves"].values()):
        sys.exit("prompts hold worked examples; export with CT_NO_EXEMPLARS=1 first")
    d = load()
    spec = chains()
    for cid, c in spec.items():
        d["chains"].setdefault(cid, {"name": c["name"], "A": c["A"], "B": c["B"], "outs": [], "full": [], "fields": [], "reused": []})
    gal = gallery_lookup()
    client = anthropic.Anthropic()
    rng = random.Random(5)
    for rnd in range(1, 6):
        reqs, waiting = [], {}
        for cid, c in spec.items():
            st = d["chains"][cid]
            outs = st["outs"]
            for si, (move, refs) in enumerate(c["steps"]):
                if si < len(outs) and outs[si] is not None:
                    continue
                if any(r.startswith("s") and (int(r[1:]) >= len(outs) or outs[int(r[1:])] is None) for r in refs):
                    break                                  # waits for an earlier step
                while len(outs) <= si:
                    outs.append(None); st["full"].append(None); st["fields"].append(""); st["reused"].append(False)
                texts = [strip_tag(text_of(c, outs, r)) if r.startswith("s") else text_of(c, outs, r) for r in refs]
                a, b = texts[0], texts[1] if len(texts) > 1 else ""
                hit = gal.get((move, a, b)) if all(not r.startswith("s") for r in refs) else None
                if hit:
                    outs[si], st["full"][si], st["reused"][si] = hit, [hit], True
                    continue
                system, user, field = prompt(P, move, a, b, rng)
                rid = f"{cid.replace('|', '-')}-s{si}-r{rnd}"
                st["fields"][si] = field
                reqs.append({"custom_id": rid, "params": {"model": MODEL, "max_tokens": 4000, "system": system,
                                                          "messages": [{"role": "user", "content": user}]}})
                waiting[rid] = (cid, si)
        save(d)
        if not reqs:
            print(f"round {rnd}: nothing left to run")
            break
        batch = client.messages.batches.create(requests=reqs)
        print(f"round {rnd}: sent {len(reqs)} steps as {batch.id}")
        while client.messages.batches.retrieve(batch.id).processing_status != "ended":
            time.sleep(30)
        bad = 0
        for r in client.messages.batches.results(batch.id):
            cid, si = waiting[r.custom_id]
            st = d["chains"][cid]
            if r.result.type != "succeeded":
                bad += 1
                continue
            text = next((x.text for x in r.result.message.content if x.type == "text"), "")
            v = parse(text)
            if v:
                st["outs"][si], st["full"][si] = v[0], v
            else:
                bad += 1
        save(d)
        print(f"round {rnd}: done, {bad} failed")
    done = sum(1 for cid, c in spec.items() if len(d["chains"][cid]["outs"]) == len(c["steps"]) and all(d["chains"][cid]["outs"]))
    print(f"{done} of {len(spec)} chains complete")


def dump():
    d = load()
    lines = []
    for cid, st in d["chains"].items():
        spec = (ONE.get(st["name"]) or TWO.get(st["name"]))
        lines.append(f"===== {st['name']}  |  A: {st['A']}" + (f"  |  B: {st['B']}" if st["B"] else ""))
        for si, (move, refs) in enumerate(spec):
            out = st["outs"][si] if si < len(st["outs"]) else None
            lines.append(f"  {si + 1}. {move}{' (gallery)' if si < len(st['reused']) and st['reused'][si] else ''}: {out}")
    path = os.path.join(HERE, "results", "recipes_opus.txt")
    open(path, "w", encoding="utf-8").write("\n".join(lines))
    print("wrote", path)


if __name__ == "__main__":
    cmd = (sys.argv[1:] or ["help"])[0]
    {"run": run, "dump": dump}.get(cmd, lambda: print(__doc__))()
