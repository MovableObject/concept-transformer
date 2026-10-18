// "Good next step": a suggestion read off the path, not the text, so it costs no model call. Every transform pushes a
// concept along known directions (more abstract or more concrete, stranger or more grounded, further from the input or
// back toward it). Add up the pushes on the way from the original concept to the selected node, and suggest the move
// that brings it back toward the middle: climbed, so land; strange twice, so ground; drifted, so graft it back.
// The rule underneath (recipe test on Opus, 2026-10-17): a leap, then a change of form or viewpoint; chains that leave the input drift.
import type { Graph, MapBox } from './types'

type Push = [level: number, strange: number, drift: number]   // +1 abstract / stranger / further from the input
const P: Record<string, Push> = {
  substitute: [0, 1, 0], combine: [0, 1, 1], adapt: [0, 1, 0], modify: [0, 1, 0], other_uses: [0, 1, 0],
  eliminate: [0, 1, 0], reverse: [0, 1, 0],
  bisociation: [0, 1, 1], split_pair: [0, 1, 1], blending: [0, 1, 1], graft: [0, 1, -1], collide: [0, 1, 1], dialectic: [1, 0, 1],
  inversion: [0, 1, 1], defamiliarize: [0, 1, 0], rule_break: [0, 1, 0], provocation: [0, 1, 1],
  scale_shift: [0, 1, 0], abstraction: [1, 0, 1], concretization: [-1, -1, 0],
  synecdoche: [0, 1, 0], metonymy: [0, 1, 1], metaphor: [1, 1, 1],
  domain_transfer: [0, 1, 1], lewitt: [1, 0, 1], misuse: [0, 1, 0], documentation: [-1, 1, 0], split: [0, 0, 1],
  etymology: [0, 1, 1], translation_drift: [0, 1, 1],
  constraint_add: [0, 1, 0], constraint_inversion: [0, 1, 0], oulipo: [0, 1, 1],
  oblique: [0, 1, 1], surrealist: [0, 2, 2], exquisite_corpse: [0, 1, 2],
  pov_shift: [0, 1, 0], time_shift: [0, 1, 0], tonal_shift: [0, 1, 0], compression: [0, 0, -1],
  visualize: [-1, -1, 0],
}

export interface Suggestion { moveId: string; inputs: string[]; reason: string }

/** The transforms from the original concept down to `id`, following each node's first input. */
function pathTo(g: Graph, id: string): { root: MapBox | null; moves: string[] } {
  const moves: string[] = []
  let n: MapBox | undefined = g.nodes[id]
  const seen = new Set<string>()
  while (n && n.kind === 'transform' && !seen.has(n.id)) {
    seen.add(n.id)
    if (!n.bypass) moves.unshift(n.moveIds[0])
    n = n.inputs[0] ? g.nodes[n.inputs[0]] : undefined
  }
  return { root: n && n.kind !== 'transform' ? n : null, moves }
}

export function suggestNext(g: Graph, id: string): Suggestion[] {
  const n = g.nodes[id]
  if (!n || n.kind === 'note') return []
  if (n.kind !== 'transform') {
    return [
      { moveId: 'scale_shift', inputs: [id], reason: 'A reliable first move: the same thing, far too big or far too small.' },
      { moveId: 'combine', inputs: [id], reason: 'A reliable first move: fuse it with something from another world.' },
      { moveId: 'reverse', inputs: [id], reason: 'A reliable first move: turn round who it is for, or who serves whom.' },
    ]
  }
  const { root, moves } = pathTo(g, id)
  const [level, strange, drift] = moves.reduce<Push>((a, m) => {
    const p = P[m] ?? [0, 0, 0]
    return [a[0] + p[0], a[1] + p[1], a[2] + p[2]]
  }, [0, 0, 0])
  const last = moves[moves.length - 1]
  const out: Suggestion[] = []
  const add = (s: Suggestion) => { if (s.moveId !== last && !out.some((o) => o.moveId === s.moveId)) out.push(s) }

  if (drift >= 2 && root) {
    add({ moveId: 'graft', inputs: [root.id, id], reason: 'It has drifted far from where it started. This plants it back inside the original concept.' })
    add({ moveId: 'compression', inputs: [id], reason: 'It has drifted. Boiling it down keeps only the part that still matters.' })
  }
  if (level >= 1) {
    add({ moveId: 'visualize', inputs: [id], reason: 'It climbed to an idea. This brings it down to something you could point at.' })
    add({ moveId: 'concretization', inputs: [id], reason: 'It climbed to an idea. This pins it to one real, dated case.' })
  }
  if (strange >= 2) {
    add({ moveId: 'concretization', inputs: [id], reason: 'Two strange steps in a row. One real case grounds it.' })
    add({ moveId: 'pov_shift', inputs: [id], reason: 'Two strange steps in a row. Seeing it through one person makes it believable.' })
  }
  if (moves.length >= 3 && drift >= 2) {
    add({ moveId: 'visualize', inputs: [id], reason: 'Three steps and drifting. Land it now.' })
  }
  // Balanced so far: a leap, then a change of form or viewpoint (what won the recipe test on Opus, 2026-10-17).
  add({ moveId: 'documentation', inputs: [id], reason: 'Leap, then reframe: recast it as its own paperwork, a receipt, a log, a ticket.' })
  add({ moveId: 'time_shift', inputs: [id], reason: 'Leap, then reframe: the same idea in another era, with that era’s things.' })
  add({ moveId: 'pov_shift', inputs: [id], reason: 'Leap, then reframe: tell it from someone or something inside it.' })
  if (moves.length < 2 && drift < 1) {
    add({ moveId: 'combine', inputs: [id], reason: 'Still close to the input. A partner from another world takes it further.' })
    add({ moveId: 'scale_shift', inputs: [id], reason: 'Still close to the input. Changing the scale alone often lands well.' })
  }
  if (moves.length < 2 && drift >= 1 && root) {
    add({ moveId: 'graft', inputs: [root.id, id], reason: 'It moved away from the original. This plants it back inside the original concept.' })
  }
  return out.slice(0, 3)
}
