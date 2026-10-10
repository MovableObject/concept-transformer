"""Symbol candidates for every move: three Lucide icons, most fitting first, plus a custom glyph idea.

Read by tools/build_symbol_page.py. Icon names are Lucide's (the icon set the page already uses).
"""

GROUP_HUES = {   # one hue per group (oklch hue angle); lightness and chroma are set per theme in the page
    "SCAMPER": 265, "Collisions": 25, "Perceptual": 320, "Scale and abstraction": 200, "Substitution": 150,
    "Structural": 60, "Linguistic": 95, "Constraints": 0, "Chance and games": 290, "Shifts": 230, "Finish": 175,
}

PICKS = {
    # SCAMPER
    "substitute": (["replace", "arrow-left-right", "repeat-2"],
                   "A square slot with a circle sliding out one side and a triangle sliding in the other."),
    "combine": (["combine", "merge", "squares-unite"],
                "Two separate shapes snapping together edge to edge into one outline, a small plus where they meet."),
    "adapt": (["puzzle", "plug", "shapes"],
              "A puzzle piece whose tab is being reshaped to fit a socket from a different puzzle."),
    "modify": (["sliders-horizontal", "wand-sparkles", "pencil-ruler"],
               "A single shape with one corner pulled out by a drag handle, the original outline dashed behind it."),
    "other_uses": (["recycle", "signpost", "shuffle"],
                   "A hammer standing upright as a door stop: the familiar tool in an unfamiliar job."),
    "eliminate": (["eraser", "scissors", "circle-minus"],
                  "Three dots in a row with the middle one struck out and its space left empty."),
    "reverse": (["flip-horizontal-2", "arrow-down-up", "undo-2"],
                "An arrow running left to right with its mirror image beneath it running right to left."),
    # Collisions
    "bisociation": (["squares-intersect", "zap", "git-merge"],
                    "Two circles from different planes, one flat and one tilted, crossing at a single bright point."),
    "split_pair": (["git-compare-arrows", "split", "link-2"],
                   "Two shapes each broken into three pieces, with one piece from each joined by a short line."),
    "blending": (["blend", "squares-unite", "flask-conical"],
                 "Two overlapping circles whose shared middle grows a third small shape neither circle had."),
    "graft": (["sprout", "syringe", "pin"],
              "A plain branch with one foreign leaf of a different shape grafted on, wrapped at the joint."),
    "collide": (["atom", "merge", "sparkle"],
                "Two arrows meeting head on, with a new small shape at the impact point."),
    "dialectic": (["scale", "swords", "git-merge"],
                  "Two opposing arrows pressing on a small triangle that rises between them."),
    # Perceptual
    "inversion": (["contrast", "square-dashed", "circle-dashed"],
                  "A solid square with a shape cut out of it, the cut-out shape sitting beside it as the subject."),
    "defamiliarize": (["scan-eye", "eye", "glasses"],
                      "An eye looking at a familiar object drawn with a question mark where its label would be."),
    "rule_break": (["unlink", "ban", "shield-off"],
                   "A ruled grid with one line snapped and bent out of place."),
    "provocation": (["zap", "flame", "message-circle-warning"],
                    "A speech bubble holding an upside-down exclamation mark."),
    # Scale and abstraction
    "scale_shift": (["scaling", "zoom-in", "maximize-2"],
                    "A tiny house standing on the rim of a giant teacup."),
    "abstraction": (["shapes", "layers", "network"],
                    "A ladder whose lowest rung holds a detailed object and whose top rung holds a single dot."),
    "concretization": (["map-pinned", "crosshair", "package"],
                       "A ladder whose top rung holds a dot and whose lowest rung holds a pin stuck in one exact spot."),
    # Substitution
    "synecdoche": (["chart-pie", "puzzle", "focus"],
                   "A whole circle drawn faint, with one slice drawn bold and standing in for it."),
    "metonymy": (["footprints", "link", "paperclip"],
                 "A dashed outline of an absent object with the thing beside it, a key or a shadow, drawn solid."),
    "metaphor": (["drama", "venetian-mask", "sparkles"],
                 "An object whose silhouette is filled with the pattern of something from another world."),
    # Structural
    "domain_transfer": (["route", "git-compare-arrows", "globe"],
                        "The same small network of dots and lines drawn twice, once in a square frame and once in a circle."),
    "lewitt": (["list-ordered", "ruler", "code-xml"],
               "A short numbered instruction card with three identical marks drawn from it below."),
    "misuse": (["hammer", "wrench", "unplug"],
               "A tool drawn upside down doing a job its handle was never meant for."),
    "documentation": (["receipt", "clipboard-list", "stamp"],
                      "A receipt with a dashed empty box where the object it records should be."),
    "split": (["split", "layout-grid", "scissors"],
              "A shape sliced into three pieces fanned apart, one piece highlighted."),
    # Linguistic
    "etymology": (["scroll-text", "book-a", "whole-word"],
                  "A word with a root drawn growing down from it into an older word below."),
    "translation_drift": (["languages", "waves", "route"],
                          "A word passing through two speech bubbles and coming out slightly changed."),
    # Constraints
    "constraint_add": (["lock", "frame", "grid-3x3"],
                       "A shape pressed inside a tight square frame, its sides bent to fit."),
    "constraint_inversion": (["circle-off", "eye-off", "volume-off"],
                             "A camera with its lens covered, still pointed at the subject."),
    "oulipo": (["spell-check", "type", "case-sensitive"],
               "A row of letters with every E crossed out."),
    # Chance and games
    "oblique": (["dice-5", "spade", "shuffle"],
                "A single playing card turned face up at an angle, with a short line of text on it."),
    "surrealist": (["cloud-moon", "feather", "infinity"],
                   "A pencil line that wanders off the page and comes back as a bird."),
    "exquisite_corpse": (["fold-vertical", "person-standing", "rows-3"],
                         "A strip of paper folded into three panels, each holding a different part of one figure."),
    # Shifts
    "pov_shift": (["eye", "cctv", "user"],
                  "The same object drawn small, with an eye placed somewhere unexpected looking at it, low or from inside."),
    "time_shift": (["history", "hourglass", "calendar-clock"],
                   "An object with a clock face behind it, its hands swept back."),
    "tonal_shift": (["palette", "music", "cloud-sun-rain"],
                    "One face split down the middle, one half smiling and one half frowning."),
    "compression": (["shrink", "minimize-2", "diamond"],
                    "A long shape squeezed between two plates into one dense dot."),
    # Finish
    "visualize": (["image", "camera", "frame"],
                  "A thought bubble whose tail ends in a picture frame."),
}
