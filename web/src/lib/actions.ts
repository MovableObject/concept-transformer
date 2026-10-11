// What the buttons, menus and keys do to the graph, in one place.
import { moveById } from './api'
import { runNodes } from './cook'
import { canWire } from './graph'
import { useGraph } from '@/store/graph'
import { useSettings } from '@/store/settings'
import { useUI, type TabMenu } from '@/store/ui'

/** A new concept (or source, or note) on the map, ready to type into. */
export function addText(kind: 'concept' | 'source' | 'note', at?: { x: number; y: number }) {
  const id = useGraph.getState().addText(kind, '', at)
  useUI.getState().set({ editing: id, tabMenu: null })
  return id
}

/** The nodes a new transform should take as inputs when none are given: the selected node, if it can feed one. */
function defaultInputs(moveId: string): string[] {
  const g = useGraph.getState().graph
  const sel = g.selected
  if (!sel || !g.nodes[sel] || g.nodes[sel].kind === 'note') return []
  const def = moveById(moveId)
  if (g.nodes[sel].kind === 'source' && def?.inputs !== 2) return []
  return [sel]
}

/** Add a transform for a move, wired to the given inputs (or the selected node). It does not run. */
export function addMove(moveId: string, opts: { inputs?: string[]; at?: { x: number; y: number } } = {}) {
  const s = useSettings.getState()
  const def = moveById(moveId)
  if (!def) return ''
  const g = useGraph.getState().graph
  const ports = def.inputs === 2 ? 2 : 1
  const wanted = (opts.inputs ?? defaultInputs(moveId)).slice(0, ports)
  // keep only wires that are allowed (a source into a one-input move is not)
  const inputs = wanted.map((i) => {
    const n = g.nodes[i]
    if (!n || n.kind === 'note') return null
    if (n.kind === 'source' && ports !== 2) return null
    return i
  })
  while (inputs.length < ports) inputs.push(null)
  const id = useGraph.getState().addTransform({ moveId, inputs, mode: s.mode, words: s.words[s.mode] || 0, at: opts.at })
  useUI.getState().set({ tabMenu: null })
  return id
}

/** Finish a node: a Visualize (or Make concrete) transform wired to it, run straight away. */
export function finish(id: string) {
  const n = useGraph.getState().graph.nodes[id]
  if (!n || n.kind === 'note' || n.kind === 'source' || !moveById('visualize')) return
  const t = addMove('visualize', { inputs: [id] })
  if (t) runNodes([t])
}

/** Open the Tab menu at a screen point. */
export function openTabMenu(m: TabMenu) {
  useUI.getState().set({ tabMenu: m, editing: null })
}

/** Wire `from` into the first free input of transform `to` (or its first input), saying why if it cannot be. */
export function wireInto(from: string, to: string, port?: number) {
  const g = useGraph.getState().graph
  const t = g.nodes[to]
  if (t?.kind !== 'transform') return
  const def = moveById(t.moveIds[0])
  const why = canWire(g, from, to, def)
  if (why) { useUI.getState().toast(why); return }
  const ports = def?.inputs === 2 ? 2 : 1
  const p = port ?? Math.max(0, t.inputs.slice(0, ports).findIndex((i) => !i))
  useGraph.getState().wire(from, to, Math.min(p, ports - 1))
}
