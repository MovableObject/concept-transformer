// The transform dial (owner, 2026-10-30): arrows in a transform's title bar step the node to another transform, the way
// the result arrows step through its results. One node to play with, instead of a menu of forty-one.
// The order matters more than the arrows: first what Good next step suggests for this place in the path, then the
// transforms that made the strongest first steps in the recipe test on Opus (2026-10-17), then the rest in menu order.
// A node with two inputs wired dials through the two-input transforms; any other node through the one-input ones.
import { moveById, useMoves } from './api'
import { runNodes } from './cook'
import { needsRun, stateOf } from './graph'
import { suggestNext } from './next'
import { useGraph } from '@/store/graph'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import type { Graph, MoveDef, TransformBox } from './types'

const STRONG_FIRST = ['scale_shift', 'rule_break', 'compression', 'synecdoche', 'substitute', 'misuse', 'defamiliarize']
const STRONG_COLLISION = ['bisociation']

const twoInputs = (t: TransformBox) => t.inputs.filter(Boolean).length >= 2

/** The transforms this node's dial steps through, in order. */
export function dialOrder(g: Graph, t: TransformBox): string[] {
  const all: MoveDef[] = useMoves.getState().moves?.moves || []
  const two = twoInputs(t)
  const fits = new Set(all.filter((m) => (m.inputs === 2) === two).map((m) => m.id))
  const out: string[] = []
  const add = (id: string) => { if (fits.has(id) && !out.includes(id)) out.push(id) }
  const above = t.inputs[0]
  if (above && g.nodes[above]) for (const s of suggestNext(g, above)) add(s.moveId)
  for (const id of two ? STRONG_COLLISION : STRONG_FIRST) add(id)
  const groups = useMoves.getState().moves?.groups || []
  const rank = (m: MoveDef) => { const i = groups.indexOf(m.group); return i < 0 ? groups.length : i }
  for (const m of [...all].sort((a, b) => rank(a) - rank(b))) add(m.id)
  return out
}

/** The transform one step forward (+1) or back (-1) from the node's current one. */
export function dialStep(g: Graph, t: TransformBox, dir: 1 | -1): string | null {
  const order = dialOrder(g, t)
  if (!order.length) return null
  const i = order.indexOf(t.moveIds[0])
  if (i < 0) return order[dir > 0 ? 0 : order.length - 1]
  return order[(i + dir + order.length) % order.length]
}

const needsField = (moveId: string, field: string) => { const d = moveById(moveId); return !!d?.field && !d.field.optional && !d.deck && !field.trim() }

/** Step a node's dial. Nothing runs unless the visitor turned on "Run when I step" in the menu; then a transform with
 *  no results for this place yet runs at once (one press of the day's allowance on the free engines). */
export function stepDial(id: string, dir: 1 | -1) {
  const store = useGraph.getState()
  const t = store.graph.nodes[id]
  if (t?.kind !== 'transform' || t.status === 'working') return
  const next = dialStep(store.graph, t, dir)
  if (!next) return
  store.setMove(id, next)
  if (!useSettings.getState().runOnStep || useUI.getState().busy) return
  const g = useGraph.getState().graph
  const n = g.nodes[id]
  if (n?.kind === 'transform' && !n.bypass && needsRun(stateOf(g, id)) && !needsField(next, n.field)) runNodes([id])
}
