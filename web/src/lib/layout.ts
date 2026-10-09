// Where boxes go. New boxes take the first free spot beside their parent, so nothing already on the map moves
// by itself; "Tidy up" lays the whole map out again with dagre (left to right).
import dagre from '@dagrejs/dagre'
import type { Graph, MapBox, TransformBox } from './types'

export const C_W = 240, T_W = 168, S_W = 260   // concept, transform and source box widths
const GAP_X = 52, CLEAR = 12, ROOT_GAP = 40

/** Estimated box height (React Flow measures the real one after drawing; this is for placement). */
export function estHeight(n: MapBox, resultCount = 0): number {
  if (n.kind === 'transform') {
    const lines = Math.ceil((n.move || '').length / 20) + 1
    return 22 + lines * 16 + (resultCount > 1 ? 24 : 0) + (n.status !== 'done' ? 16 : 0)
  }
  const w = n.kind === 'source' ? S_W : C_W
  const perLine = Math.floor((w - 24) / 7.2)
  const lines = Math.min(n.kind === 'source' ? 6 : 4, Math.max(1, Math.ceil((n.plain || n.text).length / perLine)))
  return 20 + lines * 19 + (n.kind === 'source' ? 18 : 0)
}
export const width = (n: MapBox) => (n.kind === 'transform' ? T_W : n.kind === 'source' ? S_W : C_W)

export const childrenOf = (g: Graph, id: string) => g.order.filter((k) => {
  const n = g.nodes[k]
  return n.parent === id || (n.kind === 'transform' && n.parent2 === id)
})
export const resultsOf = (g: Graph, tid: string) => g.order
  .filter((k) => g.nodes[k].kind === 'concept' && g.nodes[k].parent === tid)
  .sort((a, b) => ((g.nodes[a] as { rank: number }).rank || 0) - ((g.nodes[b] as { rank: number }).rank || 0))
export function shownResult(g: Graph, tid: string): string | null {
  const r = resultsOf(g, tid)
  const t = g.nodes[tid] as TransformBox
  return r[Math.min(t?.shown || 0, r.length - 1)] || null
}

/** Every box drawn on the map: a result only while it is its transform's shown option, and a transform only
 *  while all its parents are drawn. */
export function visibleIds(g: Graph): Set<string> {
  const vis = new Set<string>()
  let grew = true
  for (const k of g.order) if (!g.nodes[k].parent) vis.add(k)
  while (grew) {
    grew = false
    for (const k of g.order) {
      if (vis.has(k)) continue
      const n = g.nodes[k]
      if (n.kind === 'transform') {
        if (vis.has(n.parent) && (!n.parent2 || vis.has(n.parent2))) { vis.add(k); grew = true }
      } else if (n.kind === 'concept' && n.parent && vis.has(n.parent) && shownResult(g, n.parent) === k) {
        vis.add(k); grew = true
      }
    }
  }
  return vis
}

function rect(g: Graph, id: string) {
  const n = g.nodes[id]
  const rc = n.kind === 'transform' ? resultsOf(g, id).length : 0
  return { x: n.x ?? 0, y: n.y ?? 0, w: width(n), h: estHeight(n, rc) }
}
function hits(g: Graph, r: { x: number; y: number; w: number; h: number }, ignore: Set<string>) {
  for (const k of g.order) {
    if (ignore.has(k) || g.nodes[k].x == null) continue
    const o = rect(g, k)
    if (r.x < o.x + o.w + CLEAR && o.x < r.x + r.w + CLEAR && r.y < o.y + o.h + CLEAR && o.y < r.y + r.h + CLEAR) return true
  }
  return false
}
export function descendants(g: Graph, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  const walk = (k: string) => {
    for (const c of childrenOf(g, k)) if (!seen.has(c)) { seen.add(c); out.push(c); walk(c) }
  }
  walk(id)
  return out
}

/** Place a transform and its results (which share one spot) beside its parent(s), in the nearest free row. */
export function placePress(g: Graph, tid: string) {
  const t = g.nodes[tid] as TransformBox
  const parents = [t.parent, t.parent2].filter(Boolean).map((p) => rect(g, p as string))
  const right = Math.max(...parents.map((p) => p.x + p.w))
  const cy = parents.reduce((s, p) => s + p.y + p.h / 2, 0) / parents.length
  const rIds = resultsOf(g, tid)
  const th = estHeight(t, rIds.length)
  const rh = rIds.length ? estHeight(g.nodes[rIds[0]]) : 60
  const tx = right + GAP_X, rx = tx + T_W + GAP_X
  const ignore = new Set([tid, ...rIds, ...rIds.flatMap((r) => descendants(g, r))])
  const laterPress = childrenOf(g, t.parent).some((k) => k !== tid && g.nodes[k].kind === 'transform' && g.nodes[k].x != null)
  for (let i = 0; i < 800; i++) {
    const off = laterPress ? i * 8 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 8
    const ty = cy + off - th / 2, ry = cy + off - rh / 2
    if (!hits(g, { x: tx, y: ty, w: T_W, h: th }, ignore) && !hits(g, { x: rx, y: ry, w: C_W, h: rh }, ignore)) {
      t.x = tx; t.y = ty
      for (const r of rIds) { g.nodes[r].x = rx; g.nodes[r].y = ry }
      return
    }
  }
  t.x = tx; t.y = cy
  for (const r of rIds) { g.nodes[r].x = rx; g.nodes[r].y = cy }
}

/** A new root (typed concept or source) goes under everything already on the map. */
export function placeRoot(g: Graph, id: string) {
  const n = g.nodes[id]
  const others = g.order.filter((k) => k !== id && g.nodes[k].x != null)
  if (!others.length) { n.x = 0; n.y = 0; return }
  const rootXs = g.order.filter((k) => k !== id && !g.nodes[k].parent && g.nodes[k].x != null).map((k) => g.nodes[k].x as number)
  n.x = rootXs.length ? Math.min(...rootXs) : 0
  n.y = Math.max(...others.map((k) => { const r = rect(g, k); return r.y + r.h })) + ROOT_GAP
}

/** Lay everything out again, left to right. Hidden options share their shown sibling's spot. */
export function tidy(g: Graph, measured: Record<string, { w: number; h: number }> = {}) {
  const vis = visibleIds(g)
  const dg = new dagre.graphlib.Graph()
  dg.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 56, marginx: 0, marginy: 0 })
  dg.setDefaultEdgeLabel(() => ({}))
  for (const k of vis) {
    const n = g.nodes[k]
    const m = measured[k]
    dg.setNode(k, { width: m?.w ?? width(n), height: m?.h ?? estHeight(n, n.kind === 'transform' ? resultsOf(g, k).length : 0) })
  }
  for (const k of vis) {
    const n = g.nodes[k]
    if (n.parent && vis.has(n.parent)) dg.setEdge(n.parent, k)
    if (n.kind === 'transform' && n.parent2 && vis.has(n.parent2)) dg.setEdge(n.parent2, k)
  }
  dagre.layout(dg)
  for (const k of vis) {
    const p = dg.node(k)
    g.nodes[k].x = p.x - p.width / 2
    g.nodes[k].y = p.y - p.height / 2
  }
  // hidden options sit where their shown sibling is; their own branches stay relative to them
  for (const k of g.order) {
    const n = g.nodes[k]
    if (n.kind !== 'transform' || !vis.has(k)) continue
    const shown = shownResult(g, k)
    if (!shown) continue
    for (const r of resultsOf(g, k)) {
      if (r === shown) continue
      const dx = (g.nodes[shown].x ?? 0) - (g.nodes[r].x ?? 0), dy = (g.nodes[shown].y ?? 0) - (g.nodes[r].y ?? 0)
      for (const d of [r, ...descendants(g, r)]) {
        if (vis.has(d)) continue
        g.nodes[d].x = (g.nodes[d].x ?? 0) + dx
        g.nodes[d].y = (g.nodes[d].y ?? 0) + dy
      }
    }
  }
}
