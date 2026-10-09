"""Build the site's two move files from prompts/site_prompts.py.

The site keeps its own prompt set (it started from Hyper Studio's Develop tab on 2026-10-08,
then was cut down and given two result modes: image concepts and ideas). The studio is no
longer read; edit prompts/site_prompts.py and re-run:

    python tools\\export_moves.py

Writes:
  moves.json               public, read by the page: modes, groups, and per move its labels,
                           blurbs and examples for each mode, plus second-box settings.
  ct_private/prompts.json  server only, read by relay.php: the prompts, mode clauses, style
                           guard, length rule and message templates. Never sent to a browser.
Then upload both (tools/upload_files.sh), ct_private/prompts.json into the locked folder.
"""
import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "prompts"))
import site_prompts as sp  # noqa: E402

OUT = os.path.join(ROOT, "moves.json")
PRIVATE_OUT = os.path.join(ROOT, "ct_private", "prompts.json")
MODE_IDS = list(sp.MODES)


def per_mode(value):
    """A move field given once, or per mode, as a {mode: value} dict for every mode."""
    if isinstance(value, dict) and set(value) <= set(MODE_IDS):
        missing = [m for m in MODE_IDS if m not in value]
        if missing:
            raise ValueError(f"missing modes {missing}")
        return {m: value[m] for m in MODE_IDS}
    return {m: value for m in MODE_IDS}


def main():
    problems = []
    public_moves, private_moves = [], {}
    seen = set()
    for m in sp.MOVES:
        mid = m["id"]
        if mid in seen:
            problems.append(f"{mid}: duplicate id")
        seen.add(mid)
        if m["group"] not in sp.GROUPS:
            problems.append(f"{mid}: unknown group {m['group']}")
        try:
            label, blurb, example, system = (per_mode(m[k]) for k in ("label", "blurb", "example", "system"))
        except (KeyError, ValueError) as e:
            problems.append(f"{mid}: {e}")
            continue
        for mode, text in system.items():
            if '"variants"' not in text:
                problems.append(f"{mid} ({mode}): prompt does not ask for a variants list")
        count = int(m.get("count", 3))
        inputs = int(m.get("inputs", 1))
        pub = {"id": mid, "group": m["group"], "label": label, "blurb": blurb, "example": example, "count": count}
        for k in ("field", "field2", "evidence", "evidenceNote"):
            if k in m:
                pub[k] = m[k]
        if inputs != 1:
            pub["inputs"] = inputs
            if "{concept2}" not in m.get("user_template", ""):
                problems.append(f"{mid}: takes two inputs but its user template has no {{concept2}}")
        if m.get("deck"):
            pub["deck"] = True
        if m.get("evidence") not in (None, "strong", "mixed", "drifts"):
            problems.append(f"{mid}: unknown evidence tag {m['evidence']}")
        if m.get("diff") is False:
            pub["diff"] = False
        public_moves.append(pub)
        priv = {"system": system, "length_rule": m.get("length_rule", True), "count": count, "inputs": inputs}
        if m.get("deck"):
            priv["deck"] = True
        if (m["group"] in sp.STACKABLE_GROUPS and "field" not in m and inputs == 1
                and not isinstance(m["system"], dict)):
            cut = m["system"].find("\n\nRules:")
            if cut < 0:
                problems.append(f"{mid}: stackable but has no Rules section to cut at")
            else:
                priv["method"] = m["system"][:cut].strip()
                pub["stackable"] = True
        for k in ("field", "field2", "user_template"):
            if k in m:
                priv[k] = m[k]
        private_moves[mid] = priv

    stamp = datetime.datetime.now().isoformat(timespec="seconds")
    public = {
        "exported": stamp,
        "default_mode": MODE_IDS[0],
        "modes": {k: {f: v[f] for f in ("label", "placeholder", "anchor")} for k, v in sp.MODES.items()},
        "groups": [g for g in sp.GROUPS if g not in getattr(sp, "HIDDEN_GROUPS", [])],
        "stack_max": sp.STACK_MAX,
        "moves": public_moves,
    }
    private = {
        "exported": stamp,
        "modes": {k: {"clause": v["clause"], "length_rule": v.get("length_rule", sp.LENGTH_RULE)} for k, v in sp.MODES.items()},
        "guard": sp.GUARD,
        "length_rule": sp.LENGTH_RULE,
        "user_template": sp.USER_TEMPLATE,
        "stack": {"intro": sp.STACK_INTRO, "rules": sp.STACK_RULES, "max": sp.STACK_MAX},
        "moves": private_moves,
        "oblique_deck": list(getattr(sp, "OBLIQUE_DECK", [])),
    }
    pub_text = json.dumps(public)
    # an example may quote a card or two; the deck as a whole must stay private
    if sum(card in pub_text for card in getattr(sp, "OBLIQUE_DECK", []) if len(card) > 12) > 2:
        problems.append("the Oblique deck leaked into the public file")
    if '"system"' in pub_text or '"clause"' in pub_text or "Output ONLY" in pub_text or "RESULT TYPE" in pub_text:
        problems.append("prompt text leaked into the public file")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(public, f, indent=1, ensure_ascii=False)
    os.makedirs(os.path.dirname(PRIVATE_OUT), exist_ok=True)
    with open(PRIVATE_OUT, "w", encoding="utf-8") as f:
        json.dump(private, f, indent=1, ensure_ascii=False)

    print(f"wrote {OUT}")
    print(f"wrote {PRIVATE_OUT}")
    for m in public_moves:
        names = " / ".join(dict.fromkeys(m["label"].values()))
        print(f"  {m['group']:<22} {names}  {m.get('evidence', '')}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print(f"OK: {len(public_moves)} moves, modes: {', '.join(MODE_IDS)}")


if __name__ == "__main__":
    main()
