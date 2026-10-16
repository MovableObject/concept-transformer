"""Write one worked example per move per mode with Claude Opus, to teach the free engines what a correct result looks
like. The example is generated from the exact prompt the relay sends (move + result type + style guard + length), on
seeds that no test uses, and saved to prompts/exemplars.json (private). export_moves.py puts each example into its
move's prompt; CT_NO_EXEMPLARS=1 exports without them (the baseline for tests/exemplar_ab.py).

    python tools/make_exemplars.py                 every move and mode missing from prompts/exemplars.json
    python tools/make_exemplars.py --redo oulipo   write that move again (both modes)

Needs ANTHROPIC_API_KEY in the environment (never in a file). Costs about two dollars for all 82.
"""
import concurrent.futures as cf
import json
import os
import sys

import anthropic

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "prompts", "exemplars.json")
PRIVATE = os.path.join(ROOT, "ct_private", "prompts.json")
MARK = "WORKED EXAMPLE"
MODEL = "claude-opus-5-5"

# Seeds no test uses (the tests use the tool library, the night bakery, the cat, the dog, the tax audit).
SEEDS = {
    "ideas": ("A laundromat with a reading corner", "A lighthouse keeper's logbook"),
    "image": ("A ferry crossing a harbor at dawn", "A beehive inside a hollow wall"),
}
WORDS = {"ideas": 30, "image": 16}            # the page's default lengths
FIELDS = {"domain_transfer": "astronomy", "oblique": "Use an old idea"}
TEACH = ("\n\n---\nYou are writing the REFERENCE EXAMPLE that will be shown to smaller models to teach this move. Make "
         "the FIRST result a textbook-clear, fully correct instance of the move on this input: obey every rule above "
         "exactly (the tag and its format, the length, the form), and make the move itself plain to see. The other two "
         "results can be ordinary.")
SCHEMA = {"type": "object", "properties": {"variants": {"type": "array", "items": {"type": "string"}}},
          "required": ["variants"], "additionalProperties": False}


def length_rule(words):
    low = max(3, round(words * 0.6))
    return (f"\n\nLENGTH (overrides any other length rule above): each result is {low} to {words} words, not counting "
            "any leading [tag]." + (" Use two or three sentences if it needs them." if words > 25 else " One sentence."))


def prompt_for(P, mid, mode):
    """The system and user text the relay would send for this move, mode and seed."""
    m = P["moves"][mid]
    sysm = m["system"][mode] if isinstance(m["system"], dict) else m["system"]
    if MARK in sysm:
        sys.exit("ct_private/prompts.json already holds examples; export with CT_NO_EXEMPLARS=1 first")
    clause = P["modes"][mode]["clause"]
    system = sysm + clause + P.get("guard", "") + length_rule(WORDS[mode])
    a, b = SEEDS[mode]
    template = m.get("user_template") or P["user_template"]
    user = template.replace("{concept}", a).replace("{concept2}", b).replace("{field}", FIELDS.get(mid, "")).replace("{field2}", "")
    seed = {"input": a}
    if m.get("inputs", 1) == 2:
        seed["input2"] = b
    if mid in FIELDS:
        seed["field"] = FIELDS[mid]
    return system, user, seed


def write_one(client, P, mid, mode):
    system, user, seed = prompt_for(P, mid, mode)
    r = client.messages.create(
        model=MODEL, max_tokens=16000, system=system + TEACH,
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": user}],
    )
    if r.stop_reason == "refusal":
        return mid, mode, None, "refused"
    text = next((b.text for b in r.content if b.type == "text"), "")
    variants = json.loads(text).get("variants") or []
    if not variants:
        return mid, mode, None, "no variants"
    return mid, mode, {**seed, "output": variants[0].strip()}, ""


def main():
    P = json.load(open(PRIVATE, encoding="utf-8"))
    have = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    redo = sys.argv[sys.argv.index("--redo") + 1].split(",") if "--redo" in sys.argv else []
    jobs = [(mid, mode) for mid in P["moves"] for mode in ("ideas", "image")
            if mid in redo or mode not in have.get(mid, {})]
    print(f"{len(jobs)} examples to write")
    client = anthropic.Anthropic()
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        for mid, mode, ex, why in pool.map(lambda j: write_one(client, P, *j), jobs):
            if ex is None:
                print(f"  {mid} ({mode}): {why}")
                continue
            have.setdefault(mid, {})[mode] = ex
            print(f"  {mid:<22} {mode:<6} {ex['output'][:100]}")
            json.dump(have, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
