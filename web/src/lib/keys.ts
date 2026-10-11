// Keyboard shortcuts on the map, Houdini-style. They act on the selected node and are ignored while typing or in a dialog.
import { finish, openTabMenu } from './actions'
import { runAll, runNodes, stopRun } from './cook'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import { pointer } from './pointer'
import { mapHooks } from './mapHooks'
import type { MapBox } from './types'
import { normalize } from '@/store/graph'

export const SHORTCUTS: [string, string][] = [
  ['Tab', 'add a node'],
  ['Wheel', 'zoom'],
  ['H', 'fit in view'],
  ['L', 'tidy up'],
  ['Double-click', 'new concept'],
  ['Enter', 'type into the box'],
  ['R', 'run'],
  ['Shift+R', 'run all'],
  ['N', 'next result'],
  ['K / X', 'keep / discard it'],
  ['B', 'bypass'],
  ['F', 'finish'],
  ['Delete', 'delete'],
  ['Ctrl+C / Ctrl+V', 'copy / paste boxes'],
  ['Ctrl+Z', 'undo'],
]

export function onShortcut(e: KeyboardEvent) {
  const ui = useUI.getState()
  if (e.key === 'Escape') { if (ui.busy) stopRun(); ui.set({ tabMenu: null }); return }
  const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')
  if (typing || ui.editing) return
  const store = useGraph.getState()
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); store.undo(); return }
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role=dialog], [role=alertdialog]')) return
  const g = store.graph
  const n = g.selected ? g.nodes[g.selected] : null
  const k = e.key.toLowerCase()
  if (e.key === 'Tab') {
    e.preventDefault()
    const sx = pointer.inside ? pointer.x : window.innerWidth / 2, sy = pointer.inside ? pointer.y : window.innerHeight / 3
    openTabMenu({ sx, sy, inputs: n && n.kind !== 'note' ? [n.id] : [] })
    return
  }
  if (k === 'r' && e.shiftKey) { e.preventDefault(); if (!ui.busy) runAll(); return }
  if (k === 'h' && !e.shiftKey) { e.preventDefault(); mapHooks.fit(); return }
  if (k === 'l' && !e.shiftKey) { e.preventDefault(); mapHooks.tidy(); return }
  if (!n) return
  if (e.key === 'Enter' && n.kind !== 'transform') { e.preventDefault(); ui.set({ editing: n.id }) }
  else if (k === 'r' && n.kind === 'transform' && !ui.busy) { e.preventDefault(); runNodes([n.id]) }
  else if (k === 'n' && n.kind === 'transform') { e.preventDefault(); store.rotate(n.id) }
  else if (k === 'b' && n.kind === 'transform') { e.preventDefault(); store.setParam(n.id, { bypass: !n.bypass || undefined }) }
  else if (k === 'f' && !ui.busy) { e.preventDefault(); finish(n.id) }
  else if ((k === 'k' || k === 'x') && n.kind === 'transform' && n.results[n.shown]) {
    e.preventDefault()
    const want = k === 'k' ? 'kept' : 'discarded'
    store.setVerdict(n.id, n.results[n.shown].verdict === want ? undefined : want)
  }
}


// ── Copy and paste boxes: Ctrl+C copies the selected boxes (with their results and the wires between them); Ctrl+V
// pastes them at the pointer. Plain text pasted onto the map becomes a new concept. Typing in a box is left alone. ──
const CLIP = 'concept-transformer-nodes:'
let lastCopy: MapBox[] = []

const typingIn = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable]')
const textSelected = () => { const s = window.getSelection(); return !!s && !s.isCollapsed && s.toString().trim().length > 0 }

function pastePoint() {
  const g = useGraph.getState().graph
  const at = pointer.inside ? mapHooks.toFlow({ x: pointer.x, y: pointer.y }) : null
  if (at) return at
  const xs = g.order.map((k) => g.nodes[k].x), ys = g.order.map((k) => g.nodes[k].y)
  return xs.length ? { x: Math.max(...xs) + 280, y: Math.min(...ys) } : { x: 0, y: 0 }
}

export function onCopy(e: ClipboardEvent) {
  if (typingIn(e.target) || useUI.getState().editing || textSelected()) return
  const g = useGraph.getState().graph
  let ids = mapHooks.selectedIds().filter((i) => g.nodes[i])
  if (!ids.length && g.selected && g.nodes[g.selected]) ids = [g.selected]
  if (!ids.length) return
  lastCopy = ids.map((i) => structuredClone(g.nodes[i]))
  e.clipboardData?.setData('text/plain', CLIP + JSON.stringify(lastCopy))
  e.preventDefault()
  useUI.getState().toast(ids.length === 1 ? 'Copied 1 box.' : `Copied ${ids.length} boxes.`)
}

/** Boxes read from the clipboard are checked like a map file: plain values only. Wires keep their ids. */
function clean(raw: unknown[]): MapBox[] {
  const byId: Record<string, unknown> = {}
  const order: string[] = []
  for (const r of raw) { const o = r as { id?: unknown }; if (o && typeof o.id === 'string' && !byId[o.id]) { byId[o.id] = r; order.push(o.id) } }
  const g = normalize({ v: 4, nodes: byId, order, selected: null })
  if (!g) return []
  return g.order.map((k) => {
    const n = g.nodes[k]
    const rawIn = (byId[k] as { inputs?: unknown }).inputs
    if (n.kind === 'transform' && Array.isArray(rawIn)) n.inputs = rawIn.slice(0, 2).map((i) => (typeof i === 'string' ? i.slice(0, 80) : null))
    return n
  })
}

export function onPaste(e: ClipboardEvent) {
  if (typingIn(e.target) || useUI.getState().editing || document.querySelector('[role=dialog], [role=alertdialog]')) return
  const text = e.clipboardData?.getData('text/plain') || ''
  let nodes: MapBox[] = []
  if (text.startsWith(CLIP)) {
    try { const v = JSON.parse(text.slice(CLIP.length)); if (Array.isArray(v)) nodes = clean(v.slice(0, 200)) } catch { nodes = [] }
  } else if (text.trim()) {
    // plain text onto the map: a new concept (or a source, when it is long)
    e.preventDefault()
    const clean = text.trim()
    const kind = clean.length > 400 ? 'source' : 'concept'
    useGraph.getState().addText(kind, clean, pastePoint())
    return
  } else if (lastCopy.length) nodes = lastCopy
  if (!nodes.length) return
  e.preventDefault()
  const ids = useGraph.getState().paste(nodes, pastePoint())
  if (ids.length > 1) useUI.getState().toast(`Pasted ${ids.length} boxes.`)
}
