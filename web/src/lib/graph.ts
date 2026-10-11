// Pure functions over the version 4 graph: what each node outputs, whether a transform needs running, the order to
// run things in, wiring rules, placement and Tidy up. No React and no store here.
import dagre from '@dagrejs/dagre'
import type { Graph, MapBox, MoveDef, TransformBox } from './types'

export const C_W = 220, S_W = 240, T_W = 250, N_W = 200   // concept, source, transform and note widths
const GAP_Y = 56, CLEAR = 14

export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
export const widthOf = (n: MapBox) => (n.kind === 'transform' ? T_W : n.kind === 'source' ? S_W : n.kind === 'note' ? N_W : C_W)

/** Estimated height before React Flow measures the real one. */
export function estHeight(n: MapBox): number {
  const w = widthOf(n)
  const perLine = Math.floor((w - 24) / 7.2)
  if (n.kind === 'transform') {
    const r = n.results[n.shown] || n.results[0]
    const lines = r ? Math.min(5, Math.max(1, Math.ceil(r.plain.length / perLine))) : 1
    return 100 + lines * 18 + (n.results.length > 1 ? 26 : 0)
  }
  const lines = Math.min(n.kind === 'source' ? 6 : 5, Math.max(1, Math.ceil((n.text || ' ').length / perLine)))
  return 22 + lines * 19 + (n.kind === 'source' ? 18 : 0)
}

/** How many input ports a transform has: two for a collision, one otherwise. */
export const portsOf = (t: TransformBox, def?: MoveDef) => (def?.inputs === 2 || t.inputs.length >= 2 ? 2 : 1)

/** What a node passes on: a concept's or source's text, a transform's showing result (or its input when bypassed). */
export function outputOf(g: Graph, id: string | null | undefined, seen = new Set<string>()): string {
  if (!id || seen.has(id)) return ''
  seen.add(id)
  const n = g.nodes[id]
  if (!n) return ''
  if (n.kind === 'concept' || n.kind === 'source') return n.text.trim()
  if (n.kind === 'note') return ''
  if (n.bypass) return outputOf(g, n.inputs[0], seen)
  const r = n.results[Math.min(n.shown, n.results.length - 1)]
  return r ? r.plain : ''
}

/** The full text of a node's output, with a result's [tag], for copying. */
export function outputFull(g: Graph, id: string): string {
  const n = g.nodes[id]
  if (n?.kind === 'transform' && !n.bypass) {
    const r = n.results[Math.min(n.shown, n.results.length - 1)]
    return r ? (r.tag ? `${r.plain} ${r.tag}` : r.plain) : ''
  }
  return outputOf(g, id)
}

/** Everything a transform's results depend on. When it differs from ranKey, the transform is stale. */
export function keyOf(g: Graph, t: TransformBox): string {
  return JSON.stringify([t.moveIds, t.field, t.field2, t.mode, t.words, t.inputs.map((i) => outputOf(g, i))])
}

export type NodeState = 'new' | 'working' | 'done' | 'stale' | 'error' | 'bypass'

/** A transform's state, like Houdini's cook flags: new (never run), working, done, stale (an input or setting changed
 *  since it ran, or something above it needs running), error, or bypassed. */
export function stateOf(g: Graph, id: string, memo = new Map<string, NodeState>(), path = new Set<string>()): NodeState {
  const hit = memo.get(id)
  if (hit) return hit
  const n = g.nodes[id]
  if (!n || n.kind !== 'transform') return 'done'
  if (path.has(id)) return 'error'
  path.add(id)
  let s: NodeState
  if (n.status === 'working') s = 'working'
  else if (n.bypass) {
    const up = n.inputs[0] ? stateOf(g, n.inputs[0], memo, path) : 'done'
    s = up === 'new' || up === 'stale' || up === 'error' ? 'stale' : 'bypass'
  } else if (n.status === 'error') s = 'error'
  else if (!n.results.length) s = 'new'
  else {
    const upBad = n.inputs.some((i) => {
      if (!i) return false
      const u = stateOf(g, i, memo, path)
      return u === 'new' || u === 'stale' || u === 'error'
    })
    s = upBad || keyOf(g, n) !== n.ranKey ? 'stale' : 'done'
  }
  path.delete(id)
  memo.set(id, s)
  return s
}
export const needsRun = (s: NodeState) => s === 'new' || s === 'stale' || s === 'error'

/** The transforms feeding into id (nearest last), each once. */
export function upstream(g: Graph, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (k: string) => {
    const n = g.nodes[k]
    if (!n || n.kind !== 'transform') return
    for (const i of n.inputs) if (i && !seen.has(i)) { seen.add(i); walk(i); if (g.nodes[i]?.kind === 'transform') out.push(i) }
  }
  walk(id)
  return out
}

/** The nodes fed by id, directly or further down. */
export function downstream(g: Graph, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  const walk = (k: string) => {
    for (const c of g.order) {
      const n = g.nodes[c]
      if (n.kind === 'transform' && n.inputs.includes(k) && !seen.has(c)) { seen.add(c); out.push(c); walk(c) }
    }
  }
  walk(id)
  return out
}

/** What to run so that the given transforms are up to date: anything above them that needs it, then them, in order. */
export function runPlan(g: Graph, targets: string[], force: boolean): string[] {
  const memo = new Map<string, NodeState>()
  const plan: string[] = []
  const add = (k: string) => { if (!plan.includes(k)) plan.push(k) }
  for (const t of targets) {
    for (const u of upstream(g, t)) if (needsRun(stateOf(g, u, memo)) && !(g.nodes[u] as TransformBox).bypass) add(u)
    const n = g.nodes[t]
    if (n?.kind === 'transform' && !n.bypass && (force || needsRun(stateOf(g, t, memo)))) add(t)
  }
  return plan
}

/** Every transform that needs running, in an order where inputs come first. */
export function runAllPlan(g: Graph): string[] {
  const memo = new Map<string, NodeState>()
  const ts = g.order.filter((k) => g.nodes[k].kind === 'transform' && !(g.nodes[k] as TransformBox).bypass && needsRun(stateOf(g, k, memo)))
  return runPlan(g, ts, false)
}

/** Can `from` be wired into input `port` of transform `to`? Returns a reason when it cannot. */
export function canWire(g: Graph, from: string, to: string, def?: MoveDef): string {
  const a = g.nodes[from], b = g.nodes[to]
  if (!a || !b || from === to) return 'That wire goes nowhere.'
  if (a.kind === 'note') return 'Notes are not wired.'
  if (b.kind !== 'transform') return 'Wire into a transform.'
  if (a.kind === 'source' && def?.inputs !== 2) return 'A source only goes into a collision.'
  if (downstream(g, to).includes(from)) return 'That would make a loop.'
  return ''
}

// ── placement ──
function rect(g: Graph, id: string) {
  const n = g.nodes[id]
  return { x: n.x, y: n.y, w: widthOf(n), h: estHeight(n) }
}
function hits(g: Graph, r: { x: number; y: number; w: number; h: number }, ignore: string) {
  for (const k of g.order) {
    if (k === ignore) continue
    const o = rect(g, k)
    if (r.x < o.x + o.w + CLEAR && o.x < r.x + r.w + CLEAR && r.y < o.y + o.h + CLEAR && o.y < r.y + r.h + CLEAR) return true
  }
  return false
}
/** Put a node at a spot (or beside the nodes wired into it), moved down to the nearest free place. */
export function place(g: Graph, id: string, at?: { x: number; y: number }) {
  const n = g.nodes[id]
  let x: number, y: number
  const ins = n.kind === 'transform' ? n.inputs.filter((i): i is string => !!i && !!g.nodes[i]) : []
  if (at) { x = at.x; y = at.y }
  else if (ins.length) {
    // under the nodes wired into it, centred between them
    const rs = ins.map((i) => rect(g, i))
    y = Math.max(...rs.map((r) => r.y + r.h)) + GAP_Y
    x = rs.reduce((s, r) => s + r.x + r.w / 2, 0) / rs.length - widthOf(n) / 2
  } else {
    // a new starting box goes to the right of everything, level with the top
    const others = g.order.filter((k) => k !== id)
    x = others.length ? Math.max(...others.map((k) => { const r = rect(g, k); return r.x + r.w })) + 40 : 0
    y = others.length ? Math.min(...others.map((k) => g.nodes[k].y)) : 0
  }
  const w = widthOf(n), h = estHeight(n)
  for (let i = 0; i < 600; i++) {
    const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 12
    if (!hits(g, { x: x + off, y, w, h }, id)) { n.x = x + off; n.y = y; return }
  }
  n.x = x; n.y = y
}

/** Lay the whole graph out again, top to bottom, with wires flowing down from inputs into transforms. */
export function tidy(g: Graph, measured: Record<string, { w: number; h: number }> = {}) {
  const dg = new dagre.graphlib.Graph()
  dg.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 56, marginx: 0, marginy: 0 })
  dg.setDefaultEdgeLabel(() => ({}))
  for (const k of g.order) {
    const n = g.nodes[k]
    const m = measured[k]
    dg.setNode(k, { width: m?.w ?? widthOf(n), height: m?.h ?? estHeight(n) })
  }
  for (const k of g.order) {
    const n = g.nodes[k]
    if (n.kind === 'transform') for (const i of n.inputs) if (i && g.nodes[i]) dg.setEdge(i, k)
  }
  dagre.layout(dg)
  for (const k of g.order) {
    const p = dg.node(k)
    g.nodes[k].x = Math.round(p.x - p.width / 2)
    g.nodes[k].y = Math.round(p.y - p.height / 2)
  }
}
