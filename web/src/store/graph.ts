// The node graph: concepts, sources, notes and transforms, kept in this browser only (localStorage). Nothing here is
// sent to the server except the inputs of a transform being run (and the visitor's own keep/discard lists).
import { create } from 'zustand'
import { lsGet, lsSet } from '@/lib/storage'
import { splitTag } from '@/lib/diff'
import { canWire, downstream, keyOf, newId, place, tidy as tidyLayout } from '@/lib/graph'
import { fromOlder } from '@/lib/legacy'
import { moveById } from '@/lib/api'
import type { Graph, MapBox, ModeId, Result, TransformBox, Verdict } from '@/lib/types'

const KEY = 'ct.map.v4'
const OLDER = ['ct.map.v3', 'ct.map.v2', 'ct.map.v1']
const MAX_NODES = 1500, MAX_UNDO = 60
const empty = (): Graph => ({ v: 4, nodes: {}, order: [], selected: null })

const str = (v: unknown, max = 4000) => (v == null ? '' : String(v)).slice(0, max)
const num = (v: unknown) => Number(v) || 0

/** Accept a version 4 graph, keeping only plain values: nothing from a file or old storage runs. */
export function normalize(raw: unknown): Graph | null {
  const g = raw as { v?: number; nodes?: Record<string, Record<string, unknown>>; order?: unknown[]; selected?: unknown }
  if (!g || g.v !== 4 || !g.nodes || !Array.isArray(g.order)) return null
  const out = empty()
  for (const k of g.order.map(String)) {
    const r = g.nodes[k]
    if (!r) continue
    const base = { id: k, x: num(r.x), y: num(r.y), time: num(r.time) }
    let n: MapBox | null = null
    if (r.kind === 'concept' || r.kind === 'source' || r.kind === 'note') n = { ...base, kind: r.kind, text: str(r.text, 1600) } as MapBox
    else if (r.kind === 'transform') {
      const results: Result[] = (Array.isArray(r.results) ? r.results : []).slice(0, 8).map((x) => {
        const o = x as Record<string, unknown>
        return { text: str(o.text), plain: str(o.plain), tag: str(o.tag), verdict: o.verdict === 'kept' || o.verdict === 'discarded' ? o.verdict : undefined }
      })
      n = { ...base, kind: 'transform', moveIds: (Array.isArray(r.moveIds) ? r.moveIds : []).slice(0, 3).map((m) => str(m, 60)),
        inputs: (Array.isArray(r.inputs) ? r.inputs : []).slice(0, 2).map((i) => (i ? str(i, 80) : null)),
        field: str(r.field, 300), field2: str(r.field2, 300), mode: r.mode === 'ideas' ? 'ideas' : 'image', words: num(r.words),
        results, shown: Math.min(num(r.shown), Math.max(0, results.length - 1)), status: r.status === 'error' ? 'error' : 'idle',
        error: str(r.error, 400), engine: str(r.engine, 80), note: str(r.note, 400), card: str(r.card, 200), ranKey: str(r.ranKey, 20000),
        bypass: r.bypass === true || undefined } as TransformBox
    }
    if (n) { out.nodes[k] = n; out.order.push(k) }
  }
  for (const k of out.order) {   // wires only to nodes that exist
    const n = out.nodes[k]
    if (n.kind === 'transform') n.inputs = n.inputs.map((i) => (i && out.nodes[i] && i !== k ? i : null))
  }
  out.selected = typeof g.selected === 'string' && out.nodes[g.selected] ? g.selected : null
  return out
}

/** A stored or saved map of any version, as a version 4 graph. */
export function readMap(raw: unknown): Graph | null {
  return normalize(raw) || fromOlder(raw)
}

function load(): Graph {
  try { const g = normalize(JSON.parse(lsGet(KEY, '') || 'null')); if (g) return g } catch { /* older */ }
  for (const k of OLDER) {
    try {
      const g = fromOlder(JSON.parse(lsGet(k, '') || 'null'))
      if (g) { lsSet(KEY, JSON.stringify(g)); return g }   // the older copy stays where it was
    } catch { /* next */ }
  }
  return empty()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const saveSoon = (g: Graph) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => lsSet(KEY, JSON.stringify(g)), 250)
}

export interface NewTransform {
  moveId: string
  inputs: (string | null)[]
  mode: ModeId
  words: number
  at?: { x: number; y: number }
}

interface GraphStore {
  graph: Graph
  version: number                  // bumps on every change (cheap memo key for React Flow)
  past: Graph[]                    // undo steps
  /** Change the graph. `undo: true` records an undo step first; `persist: false` skips saving (mid-drag). */
  update: (fn: (g: Graph) => void, opts?: { persist?: boolean; undo?: boolean }) => void
  checkpoint: () => void           // record an undo step now (before a drag or a typing session)
  undo: () => void
  select: (id: string | null) => void
  addText: (kind: 'concept' | 'source' | 'note', text: string, at?: { x: number; y: number }) => string
  addTransform: (t: NewTransform) => string
  wire: (from: string, to: string, port: number) => string   // '' when wired, else the reason it could not be
  unwire: (to: string, port: number) => void
  setText: (id: string, text: string) => void
  setParam: (id: string, p: Partial<Pick<TransformBox, 'field' | 'field2' | 'mode' | 'words' | 'bypass'>>, undo?: boolean) => void
  startRun: (id: string) => string                            // returns the key the run is for
  finishRun: (id: string, key: string, variants: string[], engine: string, note: string, card: string) => void
  failRun: (id: string, message: string) => void
  show: (id: string, index: number) => void
  rotate: (id: string) => void
  setVerdict: (id: string, v: Verdict | undefined) => void
  remove: (ids: string[]) => void
  clear: () => void
  tidy: (measured: Record<string, { w: number; h: number }>) => void
  replace: (g: Graph) => void
}

export const useGraph = create<GraphStore>()((set, get) => ({
  graph: load(),
  version: 0,
  past: [],
  update: (fn, opts = {}) => {
    const before = get().graph
    const g = structuredClone(before)
    fn(g)
    if (g.order.length > MAX_NODES) return
    const past = opts.undo ? [...get().past.slice(-(MAX_UNDO - 1)), before] : get().past
    set({ graph: g, version: get().version + 1, past })
    if (opts.persist !== false) saveSoon(g)
  },
  checkpoint: () => set({ past: [...get().past.slice(-(MAX_UNDO - 1)), get().graph] }),
  undo: () => {
    const past = get().past
    if (!past.length) return
    const g = past[past.length - 1]
    // a transform that was running when the step was recorded is not running in the restored copy
    const restored = structuredClone(g)
    for (const k of restored.order) { const n = restored.nodes[k]; if (n.kind === 'transform' && n.status === 'working') n.status = 'idle' }
    set({ graph: restored, past: past.slice(0, -1), version: get().version + 1 })
    saveSoon(restored)
  },
  select: (id) => get().update((g) => { g.selected = id && g.nodes[id] ? id : null }, { persist: false }),
  addText: (kind, text, at) => {
    const id = newId(kind[0])
    get().update((g) => {
      g.nodes[id] = { id, kind, text: text.slice(0, kind === 'concept' ? 800 : 1600), x: 0, y: 0, time: Date.now() } as MapBox
      g.order.push(id)
      place(g, id, at)
      g.selected = id
    }, { undo: true })
    return id
  },
  addTransform: ({ moveId, inputs, mode, words, at }) => {
    const id = newId('t')
    get().update((g) => {
      const t: TransformBox = { id, kind: 'transform', moveIds: [moveId], inputs: inputs.map((i) => (i && g.nodes[i] ? i : null)),
        field: '', field2: '', mode, words, results: [], shown: 0, status: 'idle', error: '', engine: '', note: '', card: '', ranKey: '',
        x: 0, y: 0, time: Date.now() }
      g.nodes[id] = t
      g.order.push(id)
      place(g, id, at)
      g.selected = id
    }, { undo: true })
    return id
  },
  wire: (from, to, port) => {
    const target = get().graph.nodes[to]
    const why = canWire(get().graph, from, to, target?.kind === 'transform' ? moveById(target.moveIds[0]) : undefined)
    if (why) return why
    get().update((g) => {
      const t = g.nodes[to] as TransformBox
      while (t.inputs.length <= port) t.inputs.push(null)
      t.inputs[port] = from
    }, { undo: true })
    return ''
  },
  unwire: (to, port) => get().update((g) => {
    const t = g.nodes[to]
    if (t?.kind === 'transform' && port < t.inputs.length) t.inputs[port] = null
  }, { undo: true }),
  setText: (id, text) => get().update((g) => {
    const n = g.nodes[id]
    if (n && n.kind !== 'transform') n.text = text.slice(0, n.kind === 'concept' ? 800 : 1600)
  }),
  setParam: (id, p, undo = true) => get().update((g) => {
    const n = g.nodes[id]
    if (n?.kind === 'transform') Object.assign(n, p)
  }, { undo }),
  startRun: (id) => {
    let key = ''
    get().update((g) => {
      const t = g.nodes[id]
      if (t?.kind !== 'transform') return
      t.status = 'working'; t.error = ''
      key = keyOf(g, t)
    }, { persist: false })
    return key
  },
  finishRun: (id, key, variants, engine, note, card) => get().update((g) => {
    const t = g.nodes[id]
    if (t?.kind !== 'transform') return
    t.results = variants.map((v) => { const { body, tag } = splitTag(v); return { text: v, plain: body, tag } })
    t.shown = 0; t.status = 'idle'; t.error = ''; t.engine = engine; t.note = note; t.card = card
    t.ranKey = key
  }, { undo: true }),
  failRun: (id, message) => get().update((g) => {
    const t = g.nodes[id]
    if (t?.kind !== 'transform') return
    t.status = 'error'; t.error = message
  }),
  show: (id, index) => get().update((g) => {
    const t = g.nodes[id]
    if (t?.kind !== 'transform' || t.results.length < 2) return
    t.shown = ((index % t.results.length) + t.results.length) % t.results.length
  }, { undo: true }),
  rotate: (id) => { const t = get().graph.nodes[id]; if (t?.kind === 'transform') get().show(id, t.shown + 1) },
  setVerdict: (id, v) => get().update((g) => {
    const t = g.nodes[id]
    if (t?.kind === 'transform' && t.results[t.shown]) t.results[t.shown].verdict = v
  }, { undo: true }),
  remove: (ids) => get().update((g) => {
    const gone = new Set(ids.filter((i) => g.nodes[i]))
    if (!gone.size) return
    g.order = g.order.filter((k) => !gone.has(k))
    for (const k of gone) delete g.nodes[k]
    for (const k of g.order) {
      const n = g.nodes[k]
      if (n.kind === 'transform') n.inputs = n.inputs.map((i) => (i && gone.has(i) ? null : i))
    }
    if (g.selected && gone.has(g.selected)) g.selected = null
  }, { undo: true }),
  clear: () => get().update((g) => { g.nodes = {}; g.order = []; g.selected = null }, { undo: true }),
  tidy: (measured) => get().update((g) => tidyLayout(g, measured), { undo: true }),
  replace: (ng) => { set({ graph: ng, version: get().version + 1, past: [...get().past, get().graph] }); saveSoon(ng) },
}))

export const nodeOf = (id: string | null | undefined) => (id ? useGraph.getState().graph.nodes[id] || null : null)
export { downstream }
