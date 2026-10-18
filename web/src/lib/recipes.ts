// Recipes: chains of transforms that tested well on Claude Opus (tests/results/RECIPES_VERDICT_2026-10-17.md,
// the owner's yes 2026-10-17). One click places the whole chain, wired, with the display flag on the last node, so
// Cook runs it. Nothing runs by itself. The pattern that won: a leap, then a change of form or viewpoint.
import { labelOf, moveById } from './api'
import { addMove, addText } from './actions'
import { mapHooks } from './mapHooks'
import type { ModeId } from './types'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'

/** A step's inputs: 'A' and 'B' are the boxes the recipe starts from; 's0', 's1'... are earlier steps. */
export interface RecipeStep { move: string; from: string[] }
export interface Recipe { id: string; two: boolean; steps: RecipeStep[]; example: string }

export const RECIPES: Recipe[] = [
  { id: 'misuse-paper', two: false, steps: [{ move: 'misuse', from: ['A'] }, { move: 'documentation', from: ['s0'] }],
    example: 'A pigeon-race clock printout for a bench flock: distance flown 0 km, released by nobody.' },
  { id: 'fresh-paper', two: false, steps: [{ move: 'defamiliarize', from: ['A'] }, { move: 'documentation', from: ['s0'] }],
    example: 'A customs declaration for a moving box of smells: declared value none, purpose to make flat 6C smell occupied.' },
  { id: 'rule-era', two: false, steps: [{ move: 'rule_break', from: ['A'] }, { move: 'time_shift', from: ['s0'] }],
    example: 'In 1290s England, churchyard jackdaws repay a miller in clipped pennies, until the coroner calls it treasure.' },
  { id: 'core-exaggerate', two: false, steps: [{ move: 'compression', from: ['A'] }, { move: 'modify', from: ['s0'] }],
    example: 'The pigeon feeder becomes a hereditary post; after ninety years nobody remembers the man, only the coat.' },
  { id: 'part-scale', two: false, steps: [{ move: 'synecdoche', from: ['A'] }, { move: 'scale_shift', from: ['s0'] }],
    example: 'Twelve neighbors keep refilling the dead feeder’s seed bag, fifty-pound sacks for one last pigeon.' },
  { id: 'rule-reverse', two: false, steps: [{ move: 'constraint_add', from: ['A'] }, { move: 'reverse', from: ['s0'] }],
    example: 'Each crumb costs the widower a minute of life, so the pigeons start rationing his feedings.' },
  { id: 'swap-view', two: false, steps: [{ move: 'substitute', from: ['A'] }, { move: 'pov_shift', from: ['s0'] }],
    example: 'A half-used jar of cumin passes through eleven tenants and judges each by how much they use.' },
  { id: 'scale-combine-real', two: false, steps: [{ move: 'scale_shift', from: ['A'] }, { move: 'combine', from: ['s0'] }, { move: 'visualize', from: ['s1'] }],
    example: 'The surgeon’s one closing sentence is printed inside the chocolate wrapper before the bar drops.' },
  { id: 'case-rule-mood', two: false, steps: [{ move: 'concretization', from: ['A'] }, { move: 'rule_break', from: ['s0'] }, { move: 'tonal_shift', from: ['s1'] }],
    example: 'Vending slot B7 starts taking returns; every Tuesday the widower reads who didn’t make it.' },
  { id: 'lastword-back', two: false, steps: [{ move: 'exquisite_corpse', from: ['A'] }, { move: 'graft', from: ['A', 's0'] }],
    example: 'The pigeons start arriving in pairs and refuse bread until he rules on their disputes.' },
  { id: 'scale-cross', two: true, steps: [{ move: 'scale_shift', from: ['A'] }, { move: 'bisociation', from: ['s0', 'B'] }],
    example: 'A vending spiral inside your empty fridge turns a notch for every unpacked box.' },
  { id: 'cross-view-paper', two: true, steps: [{ move: 'bisociation', from: ['A', 'B'] }, { move: 'pov_shift', from: ['s0'] }, { move: 'documentation', from: ['s1'] }],
    example: 'Told only through a vending machine’s restock log: saltines up every Tuesday, until one entry reads “left full.”' },
  { id: 'blend-back', two: true, steps: [{ move: 'blending', from: ['A', 'B'] }, { move: 'graft', from: ['A', 's0'] }],
    example: 'A man feeds the park pigeons by seniority, and the flock stops mobbing him and starts queuing.' },
]

/** The recipe's name in the current naming setting: "Wrong Tool, then The Paperwork". */
export function recipeName(r: Recipe, mode: ModeId): string {
  return r.steps.map((s, i) => {
    if (s.move === 'graft' && s.from[0] === 'A' && i > 0) return 'plant it back'
    const label = labelOf(moveById(s.move), mode)
    return i === 0 && r.two && s.from.length === 1 ? `${label} on A` : label
  }).join(', then ')
}

/** Place a recipe: from the given boxes, or the selected ones, or a new concept to type into. One undo step. */
export function placeRecipe(r: Recipe, from: string[] = []) {
  const store = useGraph.getState()
  let a = from[0], b = from[1]
  if (!a) {
    const sel = mapHooks.selectedIds().filter((id) => store.graph.nodes[id] && store.graph.nodes[id].kind !== 'note')
    a = sel[0]; b = b || sel[1]
  }
  if (r.two && (!a || !b)) {
    useUI.getState().toast('This recipe takes two boxes: Shift-click two, then pick it again.')
    return
  }
  const before = useGraph.getState().past.length
  if (!a) a = addText('concept')
  const g = useGraph.getState().graph
  const origin = g.nodes[a]
  const ids: string[] = []
  r.steps.forEach((s, i) => {
    const inputs = s.from.map((f) => (f === 'A' ? a : f === 'B' ? b : ids[Number(f.slice(1))]))
    const at = origin ? { x: origin.x + (r.two ? 120 : 0), y: origin.y + 190 * (i + 1) } : undefined
    ids.push(addMove(s.move, { inputs, at }))
  })
  const last = ids[ids.length - 1]
  if (last) useGraph.getState().setDisplay(last)
  // the whole chain is one Ctrl+Z
  useGraph.setState({ past: useGraph.getState().past.slice(0, before + 1) })
  useUI.getState().set({ tabMenu: null })
  if (last) useGraph.getState().select(last)
}
