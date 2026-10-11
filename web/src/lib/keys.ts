// Keyboard shortcuts on the map, Houdini-style. They act on the selected node and are ignored while typing or in a dialog.
import { finish, openTabMenu } from './actions'
import { runAll, runNodes, stopRun } from './cook'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import { pointer } from './pointer'

export const SHORTCUTS: [string, string][] = [
  ['Tab', 'add a node'],
  ['Wheel', 'scroll'],
  ['Ctrl+wheel', 'zoom'],
  ['Double-click', 'new concept'],
  ['Enter', 'type into the box'],
  ['R', 'run'],
  ['Shift+R', 'run all'],
  ['N', 'next result'],
  ['K / X', 'keep / discard it'],
  ['B', 'bypass'],
  ['F', 'finish'],
  ['Delete', 'delete'],
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

