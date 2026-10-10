"""Draw the custom move symbols in the Lucide style (24 grid, 2-unit round strokes, no fill unless noted).

Each entry is the inner SVG markup for one move, drawn from its description in tools/symbol_picks.py.
Writes tools/custom_icons/<move id>.svg (Substitute was drawn by hand first and is left as it is).

    python tools/draw_custom_icons.py
"""
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "custom_icons")
HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" '
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
DASH = 'stroke-dasharray="2 3"'

ICONS = {
    # ── SCAMPER ──
    # Two shapes snapped edge to edge into one outline (square half, round half), a plus at the seam
    "combine": '<path d="M12 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5"/><path d="M12 5a7 7 0 0 1 0 14"/>'
               '<path d="M12 9.5v5"/><path d="M9.5 12h5"/>',
    # A round tab facing a square socket from another puzzle
    "adapt": '<path d="M3 7h7v3.5a1.5 1.5 0 0 1 0 3V17H3z"/><path d="M21 7h-7v3.5h2.5v3H14V17h7z"/>',
    # A square with one corner dragged out by a handle; the old corner dashed
    "modify": '<path d="M15 4H5a1 1 0 0 0-1 1v10l13 3.5"/><path d="m15 4 3.5 13"/><circle cx="19.5" cy="19.5" r="2"/>'
              f'<path d="M15 8v7H8" {DASH}/>',
    # A hammer standing upright beside a door, holding it
    "other_uses": '<path d="M2 21h20"/><rect x="13" y="3" width="8" height="16" rx="1"/><path d="M16 11h.01"/>'
                  '<path d="M8 19v-8"/><rect x="4" y="7" width="8" height="4" rx="1"/>',
    # Three in a row, the middle one crossed out and gone
    "eliminate": '<circle cx="4.5" cy="12" r="2.5"/><circle cx="19.5" cy="12" r="2.5"/>'
                 '<path d="m10 10 4 4"/><path d="m14 10-4 4"/>',
    # An arrow and its mirror image across a dashed axis
    "reverse": '<path d="M4 6h15"/><path d="m16 3 3 3-3 3"/><path d="M20 18H5"/><path d="m8 15-3 3 3 3"/>'
               '<path d="M3 12h2"/><path d="M8 12h2"/><path d="M14 12h2"/><path d="M19 12h2"/>',

    # ── Collisions ──
    # Two rings on different planes, crossing at one bright point
    "bisociation": '<ellipse cx="11" cy="14" rx="9" ry="4"/><ellipse cx="14" cy="10" rx="4" ry="8"/>'
                   '<circle cx="__BX__" cy="__BY__" r="1.6" fill="currentColor"/>',
    # Two things in three pieces each; one piece from each joined
    "split_pair": '<rect x="3" y="3" width="5" height="4" rx="1"/><rect x="3" y="10" width="5" height="4" rx="1"/>'
                  '<rect x="3" y="17" width="5" height="4" rx="1"/><circle cx="18.5" cy="5" r="2"/>'
                  '<circle cx="18.5" cy="12" r="2"/><circle cx="18.5" cy="19" r="2"/><path d="M10 12l5-5.5"/>',
    # Two circles whose overlap grows a third small shape
    "blending": '<circle cx="8.5" cy="12" r="6"/><circle cx="15.5" cy="12" r="6"/>'
                '<path d="M12 9.5l1.5 2.5-1.5 2.5-1.5-2.5z"/>',
    # A branch with a round leaf, and a foreign pointed leaf bound on at its end
    "graft": '<path d="M3 21 14 10"/><path d="M8 16c0-3.5-2-5.5-5-5.5 0 3 2 5.5 5 5.5z"/>'
             '<path d="M16 8l6-2-2 6z"/><path d="m11.5 10.5 2 2"/>',
    # Two arrows meeting head on, a new shape at the impact
    "collide": '<path d="M2 12h4"/><path d="m4 9 3 3-3 3"/><path d="M22 12h-4"/><path d="m20 9-3 3 3 3"/>'
               '<path d="M12 9.5l2.5 2.5-2.5 2.5-2.5-2.5z"/><path d="M12 4v2"/><path d="M12 18v2"/>',
    # Two opposing arrows pressing, a triangle rising between them
    "dialectic": '<path d="M2 18h4"/><path d="m4 15 3 3-3 3"/><path d="M22 18h-4"/><path d="m20 15-3 3 3 3"/>'
                 '<path d="M12 4l4 7H8z"/>',

    # ── Perceptual ──
    # A solid block with a shape cut out; the cut-out beside it
    "inversion": '<path fill="currentColor" fill-rule="evenodd" d="M3 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4'
                 'a1 1 0 0 1-1-1zM9 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z"/><circle cx="19" cy="12" r="2.5"/>',
    # An eye looking at a thing whose name is a question mark
    "defamiliarize": '<path d="M2 12c1.5-2.5 3.5-4 5.5-4s4 1.5 5.5 4c-1.5 2.5-3.5 4-5.5 4S3.5 14.5 2 12z"/>'
                     '<circle cx="7.5" cy="12" r="1.5"/><path d="M15.5 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/>'
                     '<path d="M18.3 17h.01"/>',
    # Ruled lines with one snapped and bent out of place
    "rule_break": '<path d="M3 6h18"/><path d="M3 18h18"/><path d="M3 12h7"/><path d="M13.5 9l3 3H21"/>',
    # A speech bubble holding an upside-down exclamation mark (a wedge, wide at the bottom)
    "provocation": '<path d="M22 17a2 2 0 0 1-2 2H6.8a2 2 0 0 0-1.4.6l-2.2 2.2a.7.7 0 0 1-1.2-.5V5a2 2 0 0 1 2-2h16'
                   'a2 2 0 0 1 2 2z"/><path d="M12 7h.01"/><path d="M11.6 10.5h.8l.6 4.5h-2z" fill="currentColor" stroke-width="1.5"/>',

    # ── Scale and abstraction ──
    # A tiny house on the rim of a giant cup
    "scale_shift": '<path d="M3 12h15v3a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6z"/><path d="M18 13h1a2 2 0 0 1 0 4h-1"/>'
                   '<path d="M6 10V7.5L8.5 5 11 7.5V10"/>',
    # A ladder: a detailed thing at the bottom, a single dot at the top
    "abstraction": '<path d="M4 3v18"/><path d="M9 3v18"/><path d="M4 7h5"/><path d="M4 12h5"/><path d="M4 17h5"/>'
                   '<circle cx="17" cy="5" r="1.5"/><rect x="13.5" y="14.5" width="7" height="7" rx="1"/>'
                   '<path d="M13.5 18h7"/><path d="M17 14.5v7"/><path d="M17 11V8.5"/>',
    # A ladder: a dot at the top, a pin stuck in one spot at the bottom
    "concretization": '<path d="M4 3v18"/><path d="M9 3v18"/><path d="M4 7h5"/><path d="M4 12h5"/><path d="M4 17h5"/>'
                      '<circle cx="17" cy="5" r="1.5"/><path d="M21 14.5c0 2.5-3 5.2-3.6 5.8a.6.6 0 0 1-.8 0'
                      'C16 19.7 13 17 13 14.5a4 4 0 0 1 8 0"/><circle cx="17" cy="14.5" r="1"/>'
                      '<path d="M17 11V8.5"/>',

    # ── Substitution ──
    # A faint whole with one bold slice standing for it
    "synecdoche": f'<path d="M19 13a8 8 0 1 1-8-8" {DASH}/><path d="M12.5 11.5V3.5a8 8 0 0 1 8 8z"/>',
    # The absent thing dashed; the key beside it drawn solid
    "metonymy": f'<rect x="2" y="10" width="11" height="10" rx="2" {DASH}/><path d="M4.5 10V7a3 3 0 0 1 6 0v3" {DASH}/>'
                '<circle cx="18" cy="6" r="3"/><path d="M18 9v12"/><path d="M18 15h2.5"/><path d="M18 18.5h2.5"/>',
    # A leaf filled with the sea's waves
    "metaphor": '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/>'
                '<path d="M2 21c0-3 1.9-5.4 5.1-6"/><path d="M9 11.5c1.3-1 2.7-1 4 0s2.7 1 4 0"/>'
                '<path d="M10.5 15.5c1-.8 2-.8 3 0s2 .8 3 0"/>',

    # ── Structural ──
    # The same little structure in a square and in a circle
    "domain_transfer": '<rect x="2" y="7.5" width="9" height="9" rx="1"/><path d="M6.5 10l2 3.5h-4z"/>'
                       '<circle cx="17.5" cy="12" r="4.5"/><path d="M17.5 10l2 3.5h-4z"/>',
    # A numbered instruction card, three identical marks made from it
    "lewitt": '<rect x="3" y="2" width="18" height="10" rx="1.5"/><path d="M6.5 5.5h.01"/><path d="M9.5 5.5h8"/>'
              '<path d="M6.5 8.5h.01"/><path d="M9.5 8.5h5"/><circle cx="5" cy="18.5" r="2"/>'
              '<circle cx="12" cy="18.5" r="2"/><circle cx="19" cy="18.5" r="2"/>',
    # A screwdriver used to stir a can of paint
    "misuse": '<rect x="15" y="1.5" width="4" height="6.5" rx="1.5" transform="rotate(30 17 4.75)"/>'
              '<path d="M15.4 8.2 12.5 14"/><path d="M4 12h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>'
              '<path d="M6.5 16.5c1.5 1 3 1 4.5.3"/>',
    # A receipt with a dashed empty box where the thing should be
    "documentation": '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/>'
                     f'<rect x="8" y="6" width="8" height="6" rx="1" {DASH}/><path d="M8 16h8"/>',
    # One shape sliced into three, fanned apart, the middle piece solid
    "split": '<rect x="3" y="6" width="4.5" height="12" rx="1" transform="rotate(-12 5.25 18)"/>'
             '<rect x="9.75" y="4.5" width="4.5" height="12" rx="1" fill="currentColor"/>'
             '<rect x="16.5" y="6" width="4.5" height="12" rx="1" transform="rotate(12 18.75 18)"/>',

    # ── Linguistic ──
    # A word with a root growing down into an older word
    "etymology": '<rect x="3" y="2" width="18" height="6" rx="1.5"/><path d="M12 8v7"/><path d="m12 11.5-3 3"/>'
                 '<path d="m12 11.5 3 3"/><rect x="6.5" y="17" width="11" height="5" rx="1.5"/>',
    # A word through two speech bubbles, coming out changed
    "translation_drift": '<path d="M3 4.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-4 3z"/>'
                         '<path d="M6 7h4"/><path d="M21 12.5a1.5 1.5 0 0 0-1.5-1.5h-7a1.5 1.5 0 0 0-1.5 1.5v5'
                         'a1.5 1.5 0 0 0 1.5 1.5H17l4 3z"/><path d="M14 15c.7-.7 1.3.7 2 0s1.3.7 2 0"/>',

    # ── Constraints ──
    # A round shape pressed into a tight square frame, its sides flattened
    "constraint_add": '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="4"/>',
    # A camera with its lens capped, still aimed
    "constraint_inversion": '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/>'
                            '<circle cx="12" cy="13" r="3.5" fill="currentColor"/>',
    # A letter E struck through, beside an O that stays
    "oulipo": '<path d="M10 5H4v14h6"/><path d="M4 12h5"/><path d="M2.5 20.5 11 3.5"/><circle cx="17.5" cy="12" r="4.5"/>',

    # ── Chance and games ──
    # One card turned face up at an angle, a line of text on it
    "oblique": '<g transform="rotate(12 12 12)"><rect x="6" y="3" width="12" height="18" rx="2"/>'
               '<path d="M9 10h6"/><path d="M9 13.5h4"/></g>',
    # A pencil line wandering off the page and turning into a bird
    "surrealist": '<rect x="2" y="6" width="10" height="15" rx="1"/><path d="M5 17c2-3 3 1 5-1.5s2.5-5.5 6-6"/>'
                  '<path d="M15 5.5c1-1 2-1 2.8 0 .8-1 1.8-1 2.7 0"/>',
    # A folded strip, three panels, three parts of one figure
    "exquisite_corpse": '<rect x="3" y="2" width="18" height="5.5" rx="1"/><rect x="3" y="9.25" width="18" height="5.5" rx="1"/>'
                        '<rect x="3" y="16.5" width="18" height="5.5" rx="1"/><circle cx="12" cy="4.75" r="1"/>'
                        '<path d="M12 11v2.5"/><path d="M10 12h4"/><path d="m10 20.5 2-2 2 2"/>',

    # ── Shifts ──
    # A thing seen from below, an eye low in the corner looking up at it
    "pov_shift": '<rect x="12" y="3" width="9" height="9" rx="1"/>'
                 '<path d="M2 18.5c1.2-2 2.8-3 4.5-3s3.3 1 4.5 3c-1.2 2-2.8 3-4.5 3s-3.3-1-4.5-3z"/>'
                 '<circle cx="6.5" cy="18.5" r="1"/><path d="m10 14 1.5-1.5"/>',
    # A thing in front of a clock whose hands are swept back
    "time_shift": '<circle cx="14" cy="10" r="7"/><path d="M14 6v4l-3 2"/><path d="M7.5 3.5 6 5"/>'
                  '<rect x="2" y="16" width="5" height="5" rx="1"/>',
    # One face, half smiling and half frowning
    "tonal_shift": '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M8.5 9h.01"/><path d="M15.5 9h.01"/>'
                   '<path d="M7 14.5c1 1.3 2.5 1.8 3.5 1.5"/><path d="M13.5 16c1-.8 2.3-.9 3.5-.3"/>',
    # Something squeezed between two plates into one dense dot
    "compression": '<path d="M3 4v16"/><path d="M21 4v16"/><path d="m5.5 9 3 3-3 3"/><path d="m18.5 9-3 3 3 3"/>'
                   '<circle cx="12" cy="12" r="1.5" fill="currentColor"/>',

    # ── Finish ──
    # A thought bubble whose tail ends in a picture frame
    "visualize": '<rect x="2" y="2" width="12" height="8" rx="4"/><circle cx="11" cy="12.5" r="1"/>'
                 '<rect x="13" y="13" width="9" height="8" rx="1"/><path d="m14.5 19.5 2.5-2.5 2 2 1.5-1.5 1 1"/>',
}


def bisociation_point():
    """Where the two rings of the Bisociation symbol cross (the upper-right crossing), found numerically."""
    import math
    best = None
    for i in range(3600):
        t = 2 * math.pi * i / 3600
        x, y = 11 + 9 * math.cos(t), 14 + 4 * math.sin(t)
        v = ((x - 14) / 4) ** 2 + ((y - 10) / 8) ** 2 - 1
        if best is None or (abs(v) < best[0] and y < 14 and x > 14):
            if y < 14 and x > 14:
                best = (abs(v), x, y)
    return round(best[1], 2), round(best[2], 2)


def main():
    os.makedirs(OUT, exist_ok=True)
    bx, by = bisociation_point()
    for move_id, inner in ICONS.items():
        inner = inner.replace("__BX__", str(bx)).replace("__BY__", str(by))
        with open(os.path.join(OUT, move_id + ".svg"), "w", encoding="utf-8", newline="\n") as f:
            f.write(HEAD + inner + "</svg>\n")
    print(f"wrote {len(ICONS)} symbols to {OUT}")


if __name__ == "__main__":
    main()
