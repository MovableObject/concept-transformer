// Keyboard shortcuts on the map. They act on the selected box and are ignored while typing or in a dialog.
import { moveById } from './api'
import { runAgain, runMove } from './press'
import type { TransformBox } from './types'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'

export const SHORTCUTS: [string, string][] = [
  ['T', 'transform the selected box'],
  ['F', 'finish it (Visualize or Make concrete)'],
  ['N', 'next option'],
  ['R', 'run the move again'],
  ['K', 'keep'],
  ['X', 'discard'],
  ['Delete', 'delete the branch'],
  ['Ctrl+Z', 'undo the last press'],
]

export function onShortcut(e: KeyboardEvent) {
  const ui = useUI.getState()
  if (e.key === 'Escape') { ui.set({ pickerFor: null }); return }
  const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')
  if (typing) return
  const g = useGraph.getState()
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); g.undoLastPress(); return }
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role=dialog], [role=alertdialog]')) return
  const n = g.graph.selected ? g.graph.nodes[g.graph.selected] : null
  if (!n) return
  // the transform a key acts on: the selected transform, or the one that made the selected result
  const t = (n.kind === 'transform' ? n : n.parent ? g.graph.nodes[n.parent] : null) as TransformBox | null
  const k = e.key.toLowerCase()
  if (k === 't' && n.kind === 'concept') { e.preventDefault(); ui.set({ pickerFor: n.id }) }
  else if (k === 'f' && n.kind === 'concept' && !ui.busy && moveById('visualize')) { e.preventDefault(); void runMove('visualize', { parents: [n.id] }) }
  else if (k === 'n' && t && t.kind === 'transform') { e.preventDefault(); g.rotate(t.id) }
  else if (k === 'r' && t && t.kind === 'transform' && t.moveIds.length && !ui.busy) { e.preventDefault(); void runAgain(t) }
  else if (k === 'k' && n.kind === 'concept') { e.preventDefault(); g.setVerdict(n.id, n.verdict === 'kept' ? undefined : 'kept') }
  else if (k === 'x' && n.kind === 'concept') { e.preventDefault(); g.setVerdict(n.id, n.verdict === 'discarded' ? undefined : 'discarded') }
}
