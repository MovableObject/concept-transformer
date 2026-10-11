// Older maps (versions 1 to 3, in this browser or in saved files) and their conversion to the version 4 graph.
// Version 3: typed concepts, sources, transform boxes, and a separate concept box for every result.
// Version 4: a transform holds its own results; wires run from a node's output into a transform's input.
import { splitTag } from './diff'
import { keyOf, tidy } from './graph'
import type { ConceptBox, Graph, MapBox, ModeId, Result, SourceBox, TransformBox, Verdict } from './types'

interface C3 { id: string; kind: 'concept'; parent: string | null; rank: number | null; text: string; plain: string; tag: string; x?: number; y?: number; time: number; verdict?: Verdict }
interface S3 { id: string; kind: 'source'; parent: null; text: string; plain: string; title: string; x?: number; y?: number; time: number }
interface T3 { id: string; kind: 'transform'; parent: string; parent2?: string; move: string; moveIds: string[]; field: string; field2?: string;
  mode: ModeId; words: number; engine: string; note: string; status: string; error: string; shown: number; x?: number; y?: number; time: number }
type B3 = C3 | S3 | T3
interface G3 { v: 3; nodes: Record<string, B3>; order: string[]; selected: string | null }

const str = (v: unknown) => (v == null ? '' : String(v))
const num = (v: unknown) => Number(v) || 0

/** Accept a version 2 or 3 graph, keeping only plain values: nothing from a file or old storage runs. */
function normalize3(raw: unknown): G3 | null {
  const g = raw as { v?: number; nodes?: Record<string, Record<string, unknown>>; order?: unknown[]; selected?: unknown }
  if (!g || (g.v !== 2 && g.v !== 3) || !g.nodes || !Array.isArray(g.order)) return null
  const order = g.order.map(String).filter((k) => g.nodes![k] && ['concept', 'transform', 'source'].includes(String(g.nodes![k].kind)))
  const nodes: Record<string, B3> = {}
  for (const k of order) {
    const r = g.nodes[k]
    const base = { id: k, x: r.x == null ? undefined : num(r.x), y: r.y == null ? undefined : num(r.y), time: num(r.time) }
    if (r.kind === 'concept') nodes[k] = { ...base, kind: 'concept', parent: r.parent ? str(r.parent) : null, rank: r.rank == null ? null : num(r.rank),
      text: str(r.text), plain: str(r.plain || r.text), tag: str(r.tag), verdict: r.verdict === 'kept' || r.verdict === 'discarded' ? r.verdict : undefined }
    else if (r.kind === 'source') nodes[k] = { ...base, kind: 'source', parent: null, text: str(r.text), plain: str(r.plain || r.text), title: str(r.title) }
    else nodes[k] = { ...base, kind: 'transform', parent: str(r.parent), parent2: r.parent2 ? str(r.parent2) : undefined, move: str(r.move),
      moveIds: Array.isArray(r.moveIds) ? r.moveIds.map(String) : [], field: str(r.field), field2: str(r.field2),
      mode: (r.mode === 'ideas' ? 'ideas' : 'image'), words: num(r.words), engine: str(r.engine), note: str(r.note),
      status: str(r.status), error: str(r.error), shown: num(r.shown) }
  }
  return { v: 3, nodes, order, selected: null }
}

/** Version 1 maps (one box per result, grouped by press) become a version 3 graph first. */
function fromV1(raw: unknown): G3 | null {
  const g1 = raw as { nodes?: Record<string, Record<string, unknown>>; order?: unknown[]; shown?: Record<string, number> } | null
  if (!g1 || !g1.nodes || !Array.isArray(g1.order) || !g1.order.length) return null
  const g: G3 = { v: 3, nodes: {}, order: [], selected: null }
  const tOf: Record<string, string> = {}
  for (const id of g1.order.map(String)) {
    const o = g1.nodes[id]
    if (!o) continue
    if (!o.parent) {
      g.nodes[id] = { id, kind: 'concept', parent: null, rank: null, text: str(o.text), plain: str(o.plain || o.text), tag: '', time: num(o.time) }
      g.order.push(id)
      continue
    }
    const press = str(o.press)
    let tid = tOf[press]
    if (!tid) {
      tid = 't' + press
      tOf[press] = tid
      g.nodes[tid] = { id: tid, kind: 'transform', parent: str(o.parent), move: str(o.move), moveIds: [], field: '', mode: o.mode === 'ideas' ? 'ideas' : 'image',
        words: 0, engine: str(o.engine), note: '', status: 'done', error: '', shown: num(g1.shown?.[press]), time: num(o.time) }
      g.order.push(tid)
    }
    const rank = o.rank != null ? num(o.rank) : Object.values(g.nodes).filter((n) => n.parent === tid).length
    g.nodes[id] = { id, kind: 'concept', parent: tid, rank, text: str(o.text), plain: str(o.plain || o.text), tag: str(o.tag), time: num(o.time) }
    g.order.push(id)
  }
  return g
}

const results3 = (g: G3, tid: string) => g.order
  .filter((k) => g.nodes[k].kind === 'concept' && g.nodes[k].parent === tid)
  .sort((a, b) => ((g.nodes[a] as C3).rank || 0) - ((g.nodes[b] as C3).rank || 0))

/** Old move labels (version 1 had no move ids): match a label back to its move where possible. */
function guessMoveIds(t: T3, labels: Record<string, string>): string[] {
  if (t.moveIds.length) return t.moveIds
  const base = t.move.split(/ → |: “/)[0].trim().toLowerCase()
  const hit = Object.entries(labels).find(([, l]) => l.toLowerCase() === base)
  return hit ? [hit[0]] : []
}

/** Convert a version 3 graph: each transform takes in its results; a wire from a result becomes a wire from its
 *  transform when that result is the one showing, otherwise from a new concept holding the result's text. */
export function migrate3(g3: G3, labels: Record<string, string> = {}): Graph {
  const g: Graph = { v: 4, nodes: {}, order: [], selected: null }
  const add = (n: MapBox) => { g.nodes[n.id] = n; g.order.push(n.id) }
  const pinned: Record<string, string> = {}
  const inputFor = (pid: string | undefined): string | null => {
    if (!pid) return null
    const p = g3.nodes[pid]
    if (!p) return null
    if (p.kind === 'concept' && p.parent) {
      const t = g3.nodes[p.parent] as T3 | undefined
      if (t && t.kind === 'transform') {
        const rs = results3(g3, t.id)
        if (rs[Math.min(t.shown || 0, rs.length - 1)] === pid) return t.id
      }
      if (!pinned[pid]) {
        const id = 'c' + pid
        pinned[pid] = id
        add({ id, kind: 'concept', text: p.plain, x: p.x ?? 0, y: p.y ?? 0, time: p.time } as ConceptBox)
      }
      return pinned[pid]
    }
    return pid
  }
  for (const k of g3.order) {
    const n = g3.nodes[k]
    if (n.kind === 'concept' && !n.parent) add({ id: k, kind: 'concept', text: n.plain, x: n.x ?? 0, y: n.y ?? 0, time: n.time } as ConceptBox)
    else if (n.kind === 'source') add({ id: k, kind: 'source', text: n.plain, x: n.x ?? 0, y: n.y ?? 0, time: n.time } as SourceBox)
  }
  for (const k of g3.order) {
    const t = g3.nodes[k]
    if (t.kind !== 'transform') continue
    const results: Result[] = results3(g3, k).map((r) => {
      const c = g3.nodes[r] as C3
      const { body, tag } = c.tag ? { body: c.plain, tag: c.tag } : splitTag(c.text)
      return { text: c.text, plain: body, tag, verdict: c.verdict }
    })
    const card = t.move.match(/: “(.*)”$/)?.[1] || ''
    add({ id: k, kind: 'transform', moveIds: guessMoveIds(t, labels), inputs: [inputFor(t.parent), ...(t.parent2 ? [inputFor(t.parent2)] : [])],
      field: card ? '' : t.field, field2: t.field2 || '', mode: t.mode, words: t.words, results, shown: Math.min(t.shown || 0, Math.max(0, results.length - 1)),
      status: t.status === 'error' && !results.length ? 'error' : 'idle', error: t.error, engine: t.engine, note: t.note, card,
      ranKey: '', x: t.x ?? 0, y: t.y ?? 0, time: t.time } as TransformBox)
  }
  // Everything that ran before is up to date as it stands: record what it ran on.
  for (const k of g.order) {
    const n = g.nodes[k]
    if (n.kind === 'transform' && n.results.length) n.ranKey = keyOf(g, n)
  }
  tidy(g)
  return g
}

/** Any older map (a stored or saved version 1, 2 or 3 graph) as a version 4 graph, or null. */
export function fromOlder(raw: unknown, labels: Record<string, string> = {}): Graph | null {
  const g3 = normalize3(raw) || fromV1(raw)
  return g3 && g3.order.length ? migrate3(g3, labels) : null
}
