// The map: concepts, sources and transforms, kept in this browser only (localStorage). Nothing here is sent to the
// server except the concept text a press is about (and, from phase 4, the visitor's own keep/discard lists).
import { create } from 'zustand'
import { lsGet, lsSet } from '@/lib/storage'
import { splitTag } from '@/lib/diff'
import type { ConceptBox, Graph, MapBox, ModeId, SourceBox, TransformBox } from '@/lib/types'
import { descendants, placePress, placeRoot, resultsOf, shownResult, tidy as tidyLayout } from '@/lib/layout'

const KEY = 'ct.map.v3', V2 = 'ct.map.v2', V1 = 'ct.map.v1'
const MAX_NODES = 1200
const empty = (): Graph => ({ v: 3, nodes: {}, order: [], selected: null })
const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/** Accept a version 2 or 3 graph (same fields; 3 adds sources and two-parent transforms). */
export function normalize(raw: unknown): Graph | null {
  const g = raw as { v?: number; nodes?: Record<string, MapBox>; order?: string[]; selected?: string | null }
  if (!g || (g.v !== 2 && g.v !== 3) || !g.nodes || !Array.isArray(g.order)) return null
  const order = g.order.filter((k) => g.nodes![k] && ['concept', 'transform', 'source'].includes(g.nodes![k].kind))
  const nodes: Record<string, MapBox> = {}
  for (const k of order) {
    const n = { ...g.nodes[k] } as MapBox
    // keep only plain values: nothing from a file or old storage runs
    for (const f of ['text', 'plain', 'tag', 'move', 'engine', 'note', 'error', 'field', 'field2', 'mode', 'title'] as const) {
      const r = n as unknown as Record<string, unknown>
      if (r[f] != null) r[f] = String(r[f])
    }
    for (const f of ['x', 'y', 'shown', 'rank', 'words', 'time'] as const) {
      const r = n as unknown as Record<string, unknown>
      if (r[f] != null) r[f] = Number(r[f]) || 0
    }
    if (n.kind === 'transform') n.moveIds = Array.isArray(n.moveIds) ? n.moveIds.map(String) : []
    nodes[k] = n
  }
  return { v: 3, nodes, order, selected: g.selected && nodes[g.selected] ? g.selected : null }
}

/** Version 1 maps (one box per result, grouped by press) become transforms with their results. */
function fromV1(): Graph | null {
  let g1: { nodes?: Record<string, Record<string, unknown>>; order?: string[]; shown?: Record<string, number> } | null = null
  try { g1 = JSON.parse(lsGet(V1, '') || 'null') } catch { return null }
  if (!g1 || !g1.nodes || !Array.isArray(g1.order) || !g1.order.length) return null
  const g = empty()
  const tOf: Record<string, string> = {}
  for (const id of g1.order) {
    const o = g1.nodes[id] as Record<string, string & number>
    if (!o) continue
    if (!o.parent) {
      g.nodes[id] = { id, kind: 'concept', parent: null, rank: null, text: o.text, plain: o.plain || o.text, tag: '', time: o.time || 0 }
      g.order.push(id)
      continue
    }
    let tid = tOf[o.press]
    if (!tid) {
      tid = 't' + o.press
      tOf[o.press] = tid
      g.nodes[tid] = { id: tid, kind: 'transform', parent: o.parent, move: o.move || '', moveIds: [], field: '', mode: (o.mode || 'image') as ModeId,
        words: 0, engine: o.engine || '', note: '', status: 'done', error: '', shown: g1.shown?.[o.press] || 0, time: o.time || 0 }
      g.order.push(tid)
    }
    const rank = o.rank != null ? Number(o.rank) : Object.values(g.nodes).filter((n) => n.parent === tid).length
    g.nodes[id] = { id, kind: 'concept', parent: tid, rank, text: o.text, plain: o.plain || o.text, tag: o.tag || '', time: o.time || 0 }
    g.order.push(id)
  }
  tidyLayout(g)
  return g
}

function load(): Graph {
  for (const k of [KEY, V2]) {
    try {
      const g = normalize(JSON.parse(lsGet(k, '') || 'null'))
      if (g) return g
    } catch { /* next */ }
  }
  return fromV1() || empty()
}

function trim(g: Graph) {
  const roots = () => g.order.filter((k) => !g.nodes[k].parent)
  while (g.order.length > MAX_NODES && roots().length > 1) removeIn(g, roots()[0])
}
function removeIn(g: Graph, id: string) {
  const gone = new Set([id, ...descendants(g, id)])
  g.order = g.order.filter((k) => !gone.has(k))
  for (const k of gone) delete g.nodes[k]
  if (g.selected && gone.has(g.selected)) g.selected = null
}

interface PressInfo {
  move: string
  moveIds: string[]
  field: string
  field2?: string
  mode: ModeId
  words: number
  engine: string
}

interface GraphStore {
  graph: Graph
  version: number                  // bumps on every change (cheap memo key for React Flow)
  update: (fn: (g: Graph) => void, persist?: boolean) => void
  select: (id: string | null) => void
  plant: (text: string) => string
  addSource: (text: string, title: string) => string
  beginPress: (parents: string[], info: PressInfo) => string
  finishPress: (tid: string, variants: string[], engine: string, note: string) => void
  failPress: (tid: string, message: string) => void
  show: (tid: string, index: number) => void
  rotate: (tid: string) => void
  moveBranch: (id: string, x: number, y: number, branch: boolean) => void
  remove: (ids: string[]) => void
  undoLastPress: () => void
  clear: () => void
  tidy: (measured: Record<string, { w: number; h: number }>) => void
  replace: (g: Graph) => void
  setVerdict: (id: string, v: 'kept' | 'discarded' | undefined) => void
  editText: (id: string, text: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const saveSoon = (g: Graph) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { lsSet(KEY, JSON.stringify(g)); lsSet(V1, null) }, 250)
}

export const useGraph = create<GraphStore>()((set, get) => ({
  graph: load(),
  version: 0,
  update: (fn, persist = true) => {
    const g = structuredClone(get().graph)
    fn(g)
    trim(g)
    set({ graph: g, version: get().version + 1 })
    if (persist) saveSoon(g)
  },
  select: (id) => get().update((g) => { g.selected = id && g.nodes[id] ? id : null }),
  plant: (text) => {
    const id = newId('c')
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500)
    get().update((g) => {
      g.nodes[id] = { id, kind: 'concept', parent: null, rank: null, text: clean, plain: clean, tag: '', time: Date.now() } as ConceptBox
      g.order.push(id)
      placeRoot(g, id)
      g.selected = id
    })
    return id
  },
  addSource: (text, title) => {
    const id = newId('s')
    get().update((g) => {
      g.nodes[id] = { id, kind: 'source', parent: null, text, plain: text, title, time: Date.now() } as SourceBox
      g.order.push(id)
      placeRoot(g, id)
      g.selected = id
    })
    return id
  },
  beginPress: (parents, info) => {
    const id = newId('t')
    get().update((g) => {
      g.nodes[id] = { id, kind: 'transform', parent: parents[0], parent2: parents[1], move: info.move, moveIds: info.moveIds,
        field: info.field || '', field2: info.field2 || '', mode: info.mode, words: info.words || 0, engine: info.engine,
        note: '', status: 'working', error: '', shown: 0, time: Date.now() } as TransformBox
      g.order.push(id)
      placePress(g, id)
      g.selected = id
    })
    return id
  },
  finishPress: (tid, variants, engine, note) => get().update((g) => {
    const t = g.nodes[tid] as TransformBox | undefined
    if (!t) return
    t.status = 'done'; t.engine = engine || t.engine; t.note = note || ''
    variants.forEach((v, rank) => {
      const { body, tag } = splitTag(v)
      const id = newId('c')
      g.nodes[id] = { id, kind: 'concept', parent: tid, rank, text: v, plain: body, tag, time: Date.now() } as ConceptBox
      g.order.push(id)
    })
    placePress(g, tid)
    g.selected = shownResult(g, tid)
  }),
  failPress: (tid, message) => get().update((g) => {
    const t = g.nodes[tid] as TransformBox | undefined
    if (!t) return
    t.status = 'error'; t.error = message
    g.selected = tid
  }),
  show: (tid, index) => get().update((g) => {
    const t = g.nodes[tid] as TransformBox | undefined
    const opts = resultsOf(g, tid)
    if (!t || opts.length < 2) return
    const i = ((index % opts.length) + opts.length) % opts.length
    const wasSelected = g.selected ? opts.includes(g.selected) : false
    t.shown = i
    if (wasSelected) g.selected = opts[i]
  }),
  rotate: (tid) => { const t = get().graph.nodes[tid] as TransformBox | undefined; if (t) get().show(tid, (t.shown || 0) + 1) },
  moveBranch: (id, x, y, branch) => get().update((g) => {
    const n = g.nodes[id]
    if (!n) return
    const dx = x - (n.x ?? 0), dy = y - (n.y ?? 0)
    if (!dx && !dy) return
    for (const k of branch ? [id, ...descendants(g, id)] : [id]) {
      g.nodes[k].x = (g.nodes[k].x ?? 0) + dx
      g.nodes[k].y = (g.nodes[k].y ?? 0) + dy
    }
  }),
  remove: (ids) => get().update((g) => {
    for (const id of ids) {
      const n = g.nodes[id]
      if (!n) continue
      // a result's branch is its whole press
      const what = n.kind === 'concept' && n.parent ? n.parent : id
      const parent = g.nodes[what]?.parent
      removeIn(g, what)
      if (!g.selected && parent && g.nodes[parent]) g.selected = parent
    }
  }),
  undoLastPress: () => get().update((g) => {
    const ts = g.order.filter((k) => g.nodes[k].kind === 'transform')
    if (!ts.length) return
    const last = ts.reduce((a, b) => (g.nodes[a].time >= g.nodes[b].time ? a : b))
    const parent = g.nodes[last].parent
    removeIn(g, last)
    g.selected = parent && g.nodes[parent] ? parent : null
  }),
  clear: () => get().update((g) => { g.nodes = {}; g.order = []; g.selected = null }),
  tidy: (measured) => get().update((g) => tidyLayout(g, measured)),
  replace: (ng) => { set({ graph: ng, version: get().version + 1 }); saveSoon(ng) },
  setVerdict: (id, v) => get().update((g) => {
    const n = g.nodes[id]
    if (n && n.kind === 'concept') n.verdict = v
  }),
  editText: (id, text) => get().update((g) => {
    const n = g.nodes[id]
    if (!n || n.kind === 'transform') return
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean) return
    n.plain = clean
    n.text = n.kind === 'concept' && n.tag ? `${n.tag} ${clean}` : clean
  }),
}))

export const nodeOf = (id: string | null | undefined) => (id ? useGraph.getState().graph.nodes[id] || null : null)
export { resultsOf, shownResult }
